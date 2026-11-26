import { describe, expect, it } from 'vitest'
import corpusRaw from './fixtures/pii-corpus.json'
import {
  DEFAULT_MASK_OPTIONS,
  maskPiiText,
  type PiiCategory,
} from '../pii-masker'

interface ExpectedEntity {
  category: PiiCategory
  text: string
}

interface CorpusEntry {
  id: string
  docType: 'email' | 'minutes' | 'inquiry' | 'chat' | 'log' | 'negative'
  text: string
  expected: ExpectedEntity[]
  mustNotMask?: string[]
  note?: string
}

const TOKEN_PLACEHOLDERS: Record<string, string> = {
  '{{FAKE_AWS_KEY_1}}': ['AKIA', '0000', 'EXAMPLE', '00001'].join(''),
  '{{FAKE_GHP_TOKEN_1}}': [
    'ghp_',
    'aB12cD34eF56gH78',
    'iJ90kL12mN34oP56qR78',
  ].join(''),
  '{{FAKE_SLACK_TOKEN_1}}': [
    'xoxb-',
    '111122223333-',
    '444455556666-',
    'SampleSlackTok',
  ].join(''),
  '{{FAKE_GOOGLE_KEY_1}}': [
    'AIza',
    'SyDummySampleKey',
    'ForUnitTestOnly12345',
  ].join(''),
  '{{FAKE_JWT_1}}': [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlNhbXBsZSJ9',
    'dummysignature1234567890abcdef',
  ].join('.'),
  '{{FAKE_PEM_KEY_1}}': [
    '-----BEGIN ',
    'PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCtest\n-----END ',
    'PRIVATE KEY-----',
  ].join(''),
}

function hydrateTokenPlaceholders(value: string): string {
  let out = value
  for (const [placeholder, actual] of Object.entries(TOKEN_PLACEHOLDERS)) {
    out = out.split(placeholder).join(actual)
  }
  return out
}

const TRACKED_CATEGORIES: PiiCategory[] = [
  'apiKey',
  'email',
  'phone',
  'postalCode',
  'ipv4',
  'creditCard',
  'myNumber',
  'organization',
  'personName',
]

interface CategoryStats {
  tp: number
  fp: number
  fn: number
  recall: number
  precision: number
  f1: number
}

function computeStats(tp: number, fp: number, fn: number): CategoryStats {
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
  const f1 =
    recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision)
  return { tp, fp, fn, recall, precision, f1 }
}

describe('pii-masker benchmark corpus', () => {
  const corpus = corpusRaw as CorpusEntry[]

  it('covers >= 100 business documents across all 9 PII categories and negative traps', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(100)

    const docTypes = new Set(corpus.map((c) => c.docType))
    expect(docTypes).toEqual(
      new Set(['email', 'minutes', 'inquiry', 'chat', 'log', 'negative'])
    )

    const coveredCategories = new Set(
      corpus.flatMap((c) => c.expected.map((e) => e.category))
    )
    for (const cat of TRACKED_CATEGORIES) {
      expect(
        coveredCategories.has(cat),
        `Missing category in corpus: ${cat}`
      ).toBe(true)
    }
  })

  it('meets strict per-category Recall/Precision thresholds and blocks false-positive traps', () => {
    const counters: Record<PiiCategory, { tp: number; fp: number; fn: number }> = {
      apiKey: { tp: 0, fp: 0, fn: 0 },
      email: { tp: 0, fp: 0, fn: 0 },
      phone: { tp: 0, fp: 0, fn: 0 },
      postalCode: { tp: 0, fp: 0, fn: 0 },
      ipv4: { tp: 0, fp: 0, fn: 0 },
      creditCard: { tp: 0, fp: 0, fn: 0 },
      myNumber: { tp: 0, fp: 0, fn: 0 },
      organization: { tp: 0, fp: 0, fn: 0 },
      personName: { tp: 0, fp: 0, fn: 0 },
      custom: { tp: 0, fp: 0, fn: 0 },
    }

    const fpDetails: string[] = []
    const fnDetails: string[] = []

    for (const item of corpus) {
      const text = hydrateTokenPlaceholders(item.text)
      const res = maskPiiText(text, DEFAULT_MASK_OPTIONS)

      // 誤検知禁止語がマスクされていないことを確認
      for (const safeTerm of item.mustNotMask ?? []) {
        const maskedHit = res.entries.find(
          (e) =>
            e.count > 0 &&
            (e.original === safeTerm ||
              e.original.includes(safeTerm) ||
              safeTerm.includes(e.original))
        )
        expect(
          maskedHit,
          `False positive on mustNotMask term "${safeTerm}" in ${item.id}: ${JSON.stringify(maskedHit)}`
        ).toBeUndefined()
      }

      const expectedMap = new Map<string, number>()
      for (const exp of item.expected) {
        const key = `${exp.category}::${hydrateTokenPlaceholders(exp.text)}`
        expectedMap.set(key, (expectedMap.get(key) ?? 0) + 1)
      }

      const predictedMap = new Map<string, number>()
      for (const pred of res.entries) {
        if (pred.count <= 0) continue
        const key = `${pred.category}::${pred.original}`
        predictedMap.set(key, (predictedMap.get(key) ?? 0) + pred.count)
      }

      const allKeys = new Set([...expectedMap.keys(), ...predictedMap.keys()])
      for (const key of allKeys) {
        const sepIdx = key.indexOf('::')
        const cat = key.slice(0, sepIdx) as PiiCategory
        const rawText = key.slice(sepIdx + 2)
        const expCount = expectedMap.get(key) ?? 0
        const predCount = predictedMap.get(key) ?? 0

        const tp = Math.min(expCount, predCount)
        const fp = Math.max(0, predCount - expCount)
        const fn = Math.max(0, expCount - predCount)

        counters[cat].tp += tp
        counters[cat].fp += fp
        counters[cat].fn += fn

        if (fp > 0) {
          fpDetails.push(`${item.id} [${cat}] FP: "${rawText}"`)
        }
        if (fn > 0) {
          fnDetails.push(`${item.id} [${cat}] FN: "${rawText}"`)
        }
      }
    }

    let totalTp = 0
    let totalFp = 0
    let totalFn = 0
    const summaryRows: Record<string, Record<string, string | number>> = {}

    for (const cat of TRACKED_CATEGORIES) {
      const c = counters[cat]
      totalTp += c.tp
      totalFp += c.fp
      totalFn += c.fn
      const stats = computeStats(c.tp, c.fp, c.fn)
      summaryRows[cat] = {
        TP: stats.tp,
        FP: stats.fp,
        FN: stats.fn,
        Recall: `${(stats.recall * 100).toFixed(1)}%`,
        Precision: `${(stats.precision * 100).toFixed(1)}%`,
        F1: `${(stats.f1 * 100).toFixed(1)}%`,
      }
    }

    const overall = computeStats(totalTp, totalFp, totalFn)
    summaryRows.OVERALL = {
      TP: overall.tp,
      FP: overall.fp,
      FN: overall.fn,
      Recall: `${(overall.recall * 100).toFixed(1)}%`,
      Precision: `${(overall.precision * 100).toFixed(1)}%`,
      F1: `${(overall.f1 * 100).toFixed(1)}%`,
    }

    console.info(
      `[PII Benchmark] Corpus=${corpus.length} docs | FP=${fpDetails.length} | FN=${fnDetails.length}`
    )
    console.info(JSON.stringify(summaryRows, null, 2))
    if (fpDetails.length > 0) console.info('FP details:', fpDetails)
    if (fnDetails.length > 0) console.info('FN details:', fnDetails)

    const statsByCat = Object.fromEntries(
      TRACKED_CATEGORIES.map((cat) => [
        cat,
        computeStats(counters[cat].tp, counters[cat].fp, counters[cat].fn),
      ])
    ) as Record<PiiCategory, CategoryStats>

    expect(statsByCat.email.recall).toBe(1)
    expect(statsByCat.email.precision).toBeGreaterThanOrEqual(0.98)

    expect(statsByCat.phone.recall).toBe(1)
    expect(statsByCat.phone.precision).toBeGreaterThanOrEqual(0.95)

    expect(statsByCat.apiKey.recall).toBe(1)
    expect(statsByCat.apiKey.precision).toBeGreaterThanOrEqual(0.95)

    expect(statsByCat.postalCode.recall).toBe(1)
    expect(statsByCat.postalCode.precision).toBeGreaterThanOrEqual(0.95)

    expect(statsByCat.ipv4.recall).toBe(1)
    expect(statsByCat.ipv4.precision).toBeGreaterThanOrEqual(0.95)

    expect(statsByCat.creditCard.recall).toBe(1)
    expect(statsByCat.creditCard.precision).toBeGreaterThanOrEqual(0.95)

    expect(statsByCat.myNumber.recall).toBe(1)
    expect(statsByCat.myNumber.precision).toBeGreaterThanOrEqual(0.95)

    expect(statsByCat.organization.recall).toBeGreaterThanOrEqual(0.95)
    expect(statsByCat.organization.precision).toBeGreaterThanOrEqual(0.92)

    expect(statsByCat.personName.recall).toBeGreaterThanOrEqual(0.9)
    expect(statsByCat.personName.precision).toBeGreaterThanOrEqual(0.9)

    expect(overall.recall).toBeGreaterThanOrEqual(0.95)
    expect(overall.precision).toBeGreaterThanOrEqual(0.95)
  })
})
