import { describe, expect, it } from 'vitest'
import {
  calculateAllModelCosts,
  estimateTokens,
  exportCostComparisonCsv,
} from '../llm-cost'

describe('llm-cost', () => {
  it('estimates more tokens for Japanese text than same-length ASCII text', () => {
    const jp = estimateTokens('東京の天気予報を確認して要約してください。')
    const en = estimateTokens('Check Tokyo weather forecast and summarize')

    expect(jp.totalChars).toBeGreaterThan(0)
    expect(jp.kanjiChars).toBeGreaterThan(0)
    expect(jp.kanaChars).toBeGreaterThan(0)
    expect(jp.estimatedTokens).toBeGreaterThan(en.estimatedTokens)
  })

  it('calculates sorted monthly JPY costs with cache hits, batch 50% discount, and custom model', () => {
    const standardRows = calculateAllModelCosts({
      inputTokens: 2000,
      outputTokens: 500,
      monthlyRequests: 1000,
      cacheHitRatePercent: 0,
      useBatchApi: false,
      usdToJpy: 150,
    })

    expect(standardRows.length).toBeGreaterThanOrEqual(10)
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
      usdToJpy: 150,
      customModel: {
        name: 'Internal Custom 8B',
        inputPerMillionUsd: 0.05,
        outputPerMillionUsd: 0.2,
        cachedInputPerMillionUsd: 0.01,
      },
    })

    const gptMiniStandard = standardRows.find((r) => r.id === 'gpt-4o-mini')!
    const gptMiniBatch = batchAndCacheRows.find((r) => r.id === 'gpt-4o-mini')!
    expect(gptMiniBatch.batchApplied).toBe(true)
    expect(gptMiniBatch.monthlyUsd).toBeLessThan(gptMiniStandard.monthlyUsd * 0.5)

    const custom = batchAndCacheRows.find((r) => r.id === 'custom-model')!
    expect(custom.name).toBe('Internal Custom 8B')

    const csv = exportCostComparisonCsv(batchAndCacheRows)
    expect(csv).toContain('Provider,Model,Tier')
    expect(csv).toContain('Internal Custom 8B')
  })
})
