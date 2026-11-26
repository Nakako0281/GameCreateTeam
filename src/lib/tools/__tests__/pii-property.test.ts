import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import {
  DEFAULT_MASK_OPTIONS,
  maskPiiText,
  restoreMaskedText,
  type MaskOptions,
} from '../pii-masker'

const TOKEN_LIKE_RE =
  /(?:\\?\[|［)(?:SECRET|EMAIL|TEL|ZIP|IP|CARD|ID12|ORG|PERSON|CUSTOM)\\?_\d+(?:\\?\]|］)/

const SAMPLE_PIIS = [
  'sato.taro@example.co.jp',
  'tanaka@example.jp',
  '090-1234-5678',
  '03-0000-1111',
  '(06) 0000-2222',
  '〒100-0001',
  '150-0002',
  '192.168.10.25',
  '10.20.30.40',
  '4111-1111-1111-1111',
  '1234-5678-9012',
  'sk-proj-example1234567890abcdef',
  'Bearer sample_bearer_token_1234567890',
  '株式会社サンプル商事',
  '架空テック株式会社',
  '佐藤太郎様',
  '鈴木一郎さん',
  'ジョン・スミス様',
]

const SAMPLE_PROSE_CHUNKS = [
  'お疲れ様です。',
  'の',
  'と',
  'へ連絡しました。',
  '、確認依頼：',
  ' \\ ',
  '\n',
  ' / ',
  '（担当メモ）',
  '前回同様に処理します。',
]

const structuredBusinessTextArb = fc
  .array(
    fc.oneof(
      fc.constantFrom(...SAMPLE_PIIS),
      fc.constantFrom(...SAMPLE_PROSE_CHUNKS)
    ),
    { minLength: 1, maxLength: 14 }
  )
  .map((parts) => parts.join(''))

const SAFE_CUSTOM_TERMS = [
  '$1',
  '$&',
  '$$',
  'C++',
  '(v2.0)',
  'foo\\bar',
  'A*B?C',
  '案件[Alpha]',
  '極秘コード-2026',
]

describe('pii-masker property-based tests (fast-check)', () => {
  it('round-trips structured business documents including newlines and backslashes with zero unresolved tokens', () => {
    fc.assert(
      fc.property(structuredBusinessTextArb, (input) => {
        const masked = maskPiiText(input, DEFAULT_MASK_OPTIONS)
        const restored = restoreMaskedText(masked.maskedText, masked.entries)

        expect(restored.restoredText).toBe(input)
        expect(restored.unresolvedTokens).toEqual([])
        expect(restored.restoredCount).toBe(masked.totalReplacements)
      }),
      { numRuns: 150 }
    )
  })

  it('maintains invariants and lossless round-trip on arbitrary random strings', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }).filter((s) => !TOKEN_LIKE_RE.test(s)),
        (input) => {
          const masked = maskPiiText(input, DEFAULT_MASK_OPTIONS)
          const sumCategories = Object.values(masked.countsByCategory).reduce(
            (acc, n) => acc + n,
            0
          )
          expect(sumCategories).toBe(masked.totalReplacements)

          const seenTokens = new Set<string>()
          for (const entry of masked.entries) {
            expect(seenTokens.has(entry.token)).toBe(false)
            seenTokens.add(entry.token)
            expect(entry.count).toBeGreaterThanOrEqual(1)
          }

          const restored = restoreMaskedText(masked.maskedText, masked.entries)
          expect(restored.restoredText).toBe(input)
          expect(restored.unresolvedTokens).toEqual([])
          expect(restored.restoredCount).toBe(masked.totalReplacements)
        }
      ),
      { numRuns: 150 }
    )
  })

  it('avoids token collisions when input text already contains literal placeholder tokens', () => {
    const preExistingTokensArb = fc.subarray(
      ['[EMAIL_1]', '[EMAIL_2]', '[PERSON_1]', '[ORG_1]', '\\[TEL_1\\]', '［IP_1］'],
      { minLength: 1, maxLength: 4 }
    )

    fc.assert(
      fc.property(
        preExistingTokensArb,
        fc.constantFrom('sato@example.co.jp', 'tanaka@example.jp'),
        fc.constantFrom('佐藤太郎様', '鈴木一郎さん'),
        fc.constantFrom('株式会社サンプル商事', 'テスト工業株式会社'),
        (existingTokens, email, person, org) => {
          const input = `${existingTokens.join(' ')} と ${org}の${person} (${email}) / 090-1234-5678 / 192.168.10.25`
          const masked = maskPiiText(input, DEFAULT_MASK_OPTIONS)

          for (const existing of existingTokens) {
            expect(masked.maskedText).toContain(existing)
          }

          const restored = restoreMaskedText(masked.maskedText, masked.entries)
          expect(restored.restoredText).toBe(input)
        }
      ),
      { numRuns: 150 }
    )
  })

  it('restores reordered, duplicated, full-width bracketed, and markdown-escaped AI responses cleanly', () => {
    const variantFormatArb = fc.constantFrom<'plain' | 'fullwidth' | 'escaped'>(
      'plain',
      'fullwidth',
      'escaped'
    )

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            idx: fc.nat({ max: 100 }),
            fmt: variantFormatArb,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (selections) => {
          const source =
            '株式会社サンプル商事の佐藤太郎様（sato@example.co.jp / 090-1234-5678 / 〒100-0001 / 192.168.10.25）へ sk-proj-example1234567890abcdef を共有。'
          const masked = maskPiiText(source, DEFAULT_MASK_OPTIONS)
          expect(masked.entries.length).toBeGreaterThan(0)

          const aiChunks: string[] = []
          const expectedChunks: string[] = []

          for (const sel of selections) {
            const entry = masked.entries[sel.idx % masked.entries.length]
            let formattedToken = entry.token
            if (sel.fmt === 'fullwidth') {
              formattedToken = entry.token.replace('[', '［').replace(']', '］')
            } else if (sel.fmt === 'escaped') {
              formattedToken = entry.token
                .replace('[', '\\[')
                .replace('_', '\\_')
                .replace(']', '\\]')
            }
            aiChunks.push(formattedToken)
            expectedChunks.push(entry.original)
          }

          const aiReply = aiChunks.join(' -> ')
          const expectedRestored = expectedChunks.join(' -> ')
          const restored = restoreMaskedText(aiReply, masked.entries)

          expect(restored.restoredText).toBe(expectedRestored)
          expect(restored.unresolvedTokens).toEqual([])
          expect(restored.restoredCount).toBe(selections.length)
        }
      ),
      { numRuns: 150 }
    )
  })

  it('safely masks and restores custom terms containing regex or replacement metacharacters', () => {
    const customSubsetArb = fc.subarray(SAFE_CUSTOM_TERMS, {
      minLength: 1,
      maxLength: 5,
    })

    fc.assert(
      fc.property(customSubsetArb, fc.boolean(), (terms, withBackslash) => {
        const prefix = withBackslash ? '\\' : ''
        const input = terms.map((t) => `${prefix}対象:${t}`).join(' / ')
        const opts: MaskOptions = {
          ...DEFAULT_MASK_OPTIONS,
          customTerms: terms,
        }
        const masked = maskPiiText(input, opts)
        const restored = restoreMaskedText(masked.maskedText, masked.entries)

        expect(restored.restoredText).toBe(input)
        expect(restored.unresolvedTokens).toEqual([])
      }),
      { numRuns: 150 }
    )
  })
})
