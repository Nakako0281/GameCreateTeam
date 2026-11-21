import { describe, expect, it } from 'vitest'
import {
  LLM_MODELS,
  OFFICIAL_PRICING_SOURCES,
  type LlmProvider,
} from '../../../data/llm-pricing'
import {
  calculateAllModelCosts,
  estimateTokens,
  exportCostComparisonCsv,
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
    }

    expect(providers).toEqual(
      new Set<LlmProvider>(['OpenAI', 'Anthropic', 'Google', 'DeepSeek'])
    )
    expect(LLM_MODELS.length).toBeGreaterThanOrEqual(15)
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
    expect(csv).toContain('GPT-6.2 Sol')
    expect(csv).toContain('Internal Custom 8B')
  })
})
