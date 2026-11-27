import { describe, expect, it } from 'vitest'
import {
  LLM_MODELS,
  OFFICIAL_BENCHMARK_SOURCE,
  OFFICIAL_PRICING_SOURCES,
  type LlmProvider,
} from '../../../data/llm-pricing'
import {
  calculateAllModelCosts,
  computeBenchmarkComparison,
  estimateTokens,
  exportCostComparisonCsv,
  resolveEffectiveModelPrice,
} from '../llm-cost'

const RETIRED_IDS = new Set([
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-nano',
  'claude-3-5-haiku',
  'claude-3-5-sonnet',
  'claude-sonnet-4',
  'claude-opus-4',
  'gemini-2-5-pro',
  'gemini-2-5-flash',
  'gemini-2-5-flash-lite',
  'deepseek-chat',
  'deepseek-reasoner',
])

describe('llm-cost', () => {
  it('estimates more tokens for Japanese text than same-length ASCII text', () => {
    const jp = estimateTokens('東京の天気予報を確認して要約してください。')
    const en = estimateTokens('Check Tokyo weather forecast and summarize')

    expect(jp.totalChars).toBeGreaterThan(0)
    expect(jp.kanjiChars).toBeGreaterThan(0)
    expect(jp.kanaChars).toBeGreaterThan(0)
    expect(jp.estimatedTokens).toBeGreaterThan(en.estimatedTokens)
  })

  it('maintains valid current pricing metadata across all 4 major providers without retired models', () => {
    const providers = new Set<LlmProvider>()

    for (const model of LLM_MODELS) {
      providers.add(model.provider)
      expect(RETIRED_IDS.has(model.id)).toBe(false)
      expect(model.inputPerMillionUsd).toBeGreaterThanOrEqual(0)
      expect(model.outputPerMillionUsd).toBeGreaterThanOrEqual(
        model.inputPerMillionUsd
      )
      expect(model.cachedInputPerMillionUsd).toBeLessThanOrEqual(
        model.inputPerMillionUsd
      )
      expect(model.releasedAt).toMatch(/^\d{4}-\d{2}$/)
      expect(model.sourceUrl.startsWith('https://')).toBe(true)
      expect(model.sourceUrl).toBe(OFFICIAL_PRICING_SOURCES[model.provider])
      if (model.priceEffectiveUntil) {
        expect(model.priceEffectiveUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(
          Number.isNaN(new Date(`${model.priceEffectiveUntil}T00:00:00Z`).getTime())
        ).toBe(false)
      }
      if (model.scheduledPricing) {
        expect(model.scheduledPricing.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(
          Number.isNaN(
            new Date(`${model.scheduledPricing.effectiveFrom}T00:00:00Z`).getTime()
          )
        ).toBe(false)
        if (model.priceEffectiveUntil) {
          const untilMs = new Date(`${model.priceEffectiveUntil}T00:00:00Z`).getTime()
          const fromMs = new Date(`${model.scheduledPricing.effectiveFrom}T00:00:00Z`).getTime()
          expect(fromMs - untilMs).toBe(24 * 60 * 60 * 1000)
        }
        expect(model.scheduledPricing.inputPerMillionUsd).toBeGreaterThanOrEqual(0)
        expect(model.scheduledPricing.outputPerMillionUsd).toBeGreaterThanOrEqual(
          model.scheduledPricing.inputPerMillionUsd
        )
        expect(model.scheduledPricing.cachedInputPerMillionUsd).toBeLessThanOrEqual(
          model.scheduledPricing.inputPerMillionUsd
        )
        expect(model.scheduledPricing.notes.trim().length).toBeGreaterThan(0)
      }
    }

    expect(providers).toEqual(
      new Set<LlmProvider>(['OpenAI', 'Anthropic', 'Google', 'DeepSeek'])
    )
    expect(LLM_MODELS.length).toBeGreaterThanOrEqual(15)
  })

  it('transitions Gemini 4 Argon (2026-12-01) and Gemini 3.8 Flash (2027-01-01) scheduled pricing and clears introductory badge metadata', () => {
    const argon = LLM_MODELS.find((m) => m.id === 'gemini-4-argon')!
    const beforeDec1 = resolveEffectiveModelPrice(argon, '2026-11-30')
    expect(beforeDec1.inputPerMillionUsd).toBe(2.0)
    expect(beforeDec1.outputPerMillionUsd).toBe(10.0)
    expect(beforeDec1.cachedInputPerMillionUsd).toBe(0.1)
    expect(beforeDec1.priceEffectiveUntil).toBe('2026-11-30')

    const onDec1 = resolveEffectiveModelPrice(argon, '2026-12-01')
    expect(onDec1.inputPerMillionUsd).toBe(4.0)
    expect(onDec1.outputPerMillionUsd).toBe(20.0)
    expect(onDec1.cachedInputPerMillionUsd).toBe(0.2)
    expect(onDec1.priceEffectiveUntil).toBeUndefined()
    expect(onDec1.notes).toContain('2026/12/1')

    const rowsOnDec1 = calculateAllModelCosts({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      monthlyRequests: 1,
      cacheHitRatePercent: 0,
      useBatchApi: false,
      usdToJpy: 159,
      asOfDate: '2026-12-01',
    })
    const argonRow = rowsOnDec1.find((r) => r.id === 'gemini-4-argon')!
    expect(argonRow.inputPerMillionUsd).toBe(4.0)
    expect(argonRow.outputPerMillionUsd).toBe(20.0)
    expect(argonRow.monthlyUsd).toBeCloseTo(24.0, 5)
    expect(argonRow.priceEffectiveUntil).toBeUndefined()
    expect(exportCostComparisonCsv([argonRow])).not.toContain('2026-11-30')

    const flash38 = LLM_MODELS.find((m) => m.id === 'gemini-3-8-flash')!
    expect(resolveEffectiveModelPrice(flash38, '2026-12-31').inputPerMillionUsd).toBe(0.75)
    const onJan1 = resolveEffectiveModelPrice(flash38, '2027-01-01')
    expect(onJan1.inputPerMillionUsd).toBe(1.5)
    expect(onJan1.outputPerMillionUsd).toBe(7.5)
    expect(onJan1.cachedInputPerMillionUsd).toBe(0.15)
    expect(onJan1.priceEffectiveUntil).toBeUndefined()
  })

  it('calculates sorted monthly JPY costs with cache hits, batch 50% discount, and custom model', () => {
    const standardRows = calculateAllModelCosts({
      inputTokens: 2000,
      outputTokens: 500,
      monthlyRequests: 1000,
      cacheHitRatePercent: 0,
      useBatchApi: false,
      usdToJpy: 159,
    })

    expect(standardRows.length).toBeGreaterThanOrEqual(15)
    for (let i = 1; i < standardRows.length; i++) {
      expect(standardRows[i].monthlyUsd).toBeGreaterThanOrEqual(
        standardRows[i - 1].monthlyUsd
      )
    }

    const batchAndCacheRows = calculateAllModelCosts({
      inputTokens: 2000,
      outputTokens: 500,
      monthlyRequests: 1000,
      cacheHitRatePercent: 80,
      useBatchApi: true,
      usdToJpy: 159,
      customModel: {
        name: 'Internal Custom 8B',
        inputPerMillionUsd: 0.05,
        outputPerMillionUsd: 0.2,
        cachedInputPerMillionUsd: 0.01,
      },
    })

    for (const modelId of [
      'gpt-6-luna',
      'gpt-6-2-sol',
      'claude-sonnet-5-5',
      'gemini-4-argon',
    ]) {
      const standard = standardRows.find((r) => r.id === modelId)!
      const batchAndCache = batchAndCacheRows.find((r) => r.id === modelId)!
      expect(standard).toBeDefined()
      expect(batchAndCache).toBeDefined()
      expect(batchAndCache.batchApplied).toBe(true)
      expect(batchAndCache.monthlyUsd).toBeLessThan(standard.monthlyUsd * 0.5)
    }

    const deepseekStandard = standardRows.find((r) => r.id === 'deepseek-flash')!
    const deepseekBatch = batchAndCacheRows.find((r) => r.id === 'deepseek-flash')!
    expect(deepseekBatch.batchApplied).toBe(false)
    expect(deepseekBatch.monthlyUsd).toBeLessThan(deepseekStandard.monthlyUsd)

    const custom = batchAndCacheRows.find((r) => r.id === 'custom-model')!
    expect(custom.name).toBe('Internal Custom 8B')

    const csv = exportCostComparisonCsv(batchAndCacheRows)
    expect(csv).toContain('Provider,Model,Tier')
    expect(csv).toContain('BenchmarkOverall,BenchmarkCoding')
    expect(csv).toContain('GPT-6.2 Sol')
    expect(csv).toContain('Internal Custom 8B')
  })

  it('maintains valid unified benchmark scores and computes Pareto optimal frontier accurately (Issue #79)', () => {
    expect(OFFICIAL_BENCHMARK_SOURCE.url).toBe('https://benchlm.ai/')

    for (const model of LLM_MODELS) {
      expect(model.benchmarks.sourceUrl).toBe(OFFICIAL_BENCHMARK_SOURCE.url)
      for (const score of [model.benchmarks.overall, model.benchmarks.coding]) {
        if (score !== null) {
          expect(score).toBeGreaterThan(0)
          expect(score).toBeLessThanOrEqual(100)
        }
      }
    }

    const rows = calculateAllModelCosts({
      inputTokens: 2000,
      outputTokens: 800,
      monthlyRequests: 1000,
      cacheHitRatePercent: 50,
      useBatchApi: false,
      usdToJpy: 159,
      customModel: {
        name: 'Unmeasured Custom',
        inputPerMillionUsd: 0.5,
        outputPerMillionUsd: 2.0,
        cachedInputPerMillionUsd: 0.1,
        benchmarkOverall: null,
        benchmarkCoding: 84.5,
      },
    })

    const overallComp = computeBenchmarkComparison(rows, 'overall')
    expect(overallComp.measured.length).toBe(LLM_MODELS.length)
    expect(overallComp.unmeasured.map((u) => u.id)).toEqual(['custom-model'])
    expect(overallComp.paretoFrontier.length).toBeGreaterThanOrEqual(3)

    // パレート最適フロンティアはコスト昇順でスコアが単調増加していること
    for (let i = 1; i < overallComp.paretoFrontier.length; i++) {
      expect(overallComp.paretoFrontier[i].row.monthlyUsd).toBeGreaterThanOrEqual(
        overallComp.paretoFrontier[i - 1].row.monthlyUsd
      )
      expect(overallComp.paretoFrontier[i].score).toBeGreaterThanOrEqual(
        overallComp.paretoFrontier[i - 1].score
      )
    }

    // Coding 軸ではスコア指定済みのカスタムモデルも測定対象に入ること
    const codingComp = computeBenchmarkComparison(rows, 'coding')
    expect(codingComp.measured.some((p) => p.row.id === 'custom-model')).toBe(true)
    expect(codingComp.unmeasured).toHaveLength(0)
  })
})
