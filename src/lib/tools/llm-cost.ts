import { LLM_MODELS, type LlmModelPrice } from '../../data/llm-pricing'

export interface TokenEstimate {
  totalChars: number
  kanjiChars: number
  kanaChars: number
  asciiChars: number
  estimatedTokens: number
}

export interface CostSimulationInput {
  inputTokens: number
  outputTokens: number
  monthlyRequests: number
  cacheHitRatePercent: number
  useBatchApi: boolean
  usdToJpy: number
  customModel?: {
    name: string
    inputPerMillionUsd: number
    outputPerMillionUsd: number
    cachedInputPerMillionUsd: number
  } | null
}

export interface ModelCostRow {
  id: string
  provider: string
  name: string
  tier: string
  releasedAt: string
  inputPerMillionUsd: number
  outputPerMillionUsd: number
  cachedInputPerMillionUsd: number
  perRequestUsd: number
  monthlyUsd: number
  monthlyJpy: number
  batchApplied: boolean
  priceEffectiveUntil?: string
  sourceUrl: string
  notes: string
}

export function estimateTokens(text: string): TokenEstimate {
  if (!text) {
    return {
      totalChars: 0,
      kanjiChars: 0,
      kanaChars: 0,
      asciiChars: 0,
      estimatedTokens: 0,
    }
  }

  let kanjiChars = 0
  let kanaChars = 0
  let asciiChars = 0
  let otherNonAscii = 0

  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x7f) {
      asciiChars += 1
    } else if (
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff) ||
      (code >= 0xff65 && code <= 0xff9f)
    ) {
      kanaChars += 1
    } else if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf)
    ) {
      kanjiChars += 1
    } else {
      otherNonAscii += 1
    }
  }

  // 日本語BPEトークナイザ近似：漢字1.55、かな1.15、ASCII約0.28（空白・記号込み）
  const rawEstimate =
    kanjiChars * 1.55 +
    kanaChars * 1.15 +
    otherNonAscii * 1.3 +
    asciiChars * 0.28

  return {
    totalChars: kanjiChars + kanaChars + asciiChars + otherNonAscii,
    kanjiChars,
    kanaChars,
    asciiChars,
    estimatedTokens: Math.max(1, Math.round(rawEstimate)),
  }
}

export function calculateSingleModelCost(
  model: Pick<
    LlmModelPrice,
    | 'id'
    | 'provider'
    | 'name'
    | 'tier'
    | 'releasedAt'
    | 'inputPerMillionUsd'
    | 'outputPerMillionUsd'
    | 'cachedInputPerMillionUsd'
    | 'supportsBatch50'
    | 'priceEffectiveUntil'
    | 'sourceUrl'
    | 'notes'
  > | {
    id: string
    provider: string
    name: string
    tier: string
    releasedAt: string
    inputPerMillionUsd: number
    outputPerMillionUsd: number
    cachedInputPerMillionUsd: number
    supportsBatch50: boolean
    priceEffectiveUntil?: string
    sourceUrl: string
    notes: string
  },
  input: CostSimulationInput
): ModelCostRow {
  const safeInputTokens = Math.max(0, input.inputTokens)
  const safeOutputTokens = Math.max(0, input.outputTokens)
  const safeRequests = Math.max(1, input.monthlyRequests)
  const hitRate = Math.min(95, Math.max(0, input.cacheHitRatePercent)) / 100
  const fx = Math.max(1, input.usdToJpy)

  const cachedTokens = safeInputTokens * hitRate
  const uncachedTokens = safeInputTokens * (1 - hitRate)

  let inputCostUsd =
    (uncachedTokens / 1_000_000) * model.inputPerMillionUsd +
    (cachedTokens / 1_000_000) * model.cachedInputPerMillionUsd
  let outputCostUsd = (safeOutputTokens / 1_000_000) * model.outputPerMillionUsd

  const batchApplied = Boolean(input.useBatchApi && model.supportsBatch50)
  if (batchApplied) {
    inputCostUsd *= 0.5
    outputCostUsd *= 0.5
  }

  const perRequestUsd = inputCostUsd + outputCostUsd
  const monthlyUsd = perRequestUsd * safeRequests
  const monthlyJpy = monthlyUsd * fx

  return {
    id: model.id,
    provider: model.provider,
    name: model.name,
    tier: model.tier,
    releasedAt: model.releasedAt,
    inputPerMillionUsd: model.inputPerMillionUsd,
    outputPerMillionUsd: model.outputPerMillionUsd,
    cachedInputPerMillionUsd: model.cachedInputPerMillionUsd,
    perRequestUsd,
    monthlyUsd,
    monthlyJpy,
    batchApplied,
    priceEffectiveUntil: model.priceEffectiveUntil,
    sourceUrl: model.sourceUrl,
    notes: model.notes,
  }
}

export function calculateAllModelCosts(
  input: CostSimulationInput
): ModelCostRow[] {
  const models: Array<
    LlmModelPrice | {
      id: string
      provider: string
      name: string
      tier: string
      releasedAt: string
      inputPerMillionUsd: number
      outputPerMillionUsd: number
      cachedInputPerMillionUsd: number
      supportsBatch50: boolean
      priceEffectiveUntil?: string
      sourceUrl: string
      notes: string
    }
  > = [...LLM_MODELS]

  if (
    input.customModel &&
    input.customModel.name.trim() &&
    Number.isFinite(input.customModel.inputPerMillionUsd) &&
    Number.isFinite(input.customModel.outputPerMillionUsd)
  ) {
    models.push({
      id: 'custom-model',
      provider: 'Custom',
      name: input.customModel.name.trim(),
      tier: 'balanced',
      releasedAt: 'Custom',
      inputPerMillionUsd: Math.max(0, input.customModel.inputPerMillionUsd),
      outputPerMillionUsd: Math.max(0, input.customModel.outputPerMillionUsd),
      cachedInputPerMillionUsd: Math.max(
        0,
        input.customModel.cachedInputPerMillionUsd
      ),
      supportsBatch50: true,
      sourceUrl: '',
      notes: 'ユーザー指定のカスタム単価条件',
    })
  }

  return models
    .map((m) => calculateSingleModelCost(m, input))
    .sort((a, b) => a.monthlyUsd - b.monthlyUsd)
}

export function exportCostComparisonCsv(rows: ModelCostRow[]): string {
  const header = [
    'Provider',
    'Model',
    'Tier',
    'ReleasedAt',
    'InputPer1M_USD',
    'OutputPer1M_USD',
    'CachedInputPer1M_USD',
    'PerRequestUSD',
    'MonthlyUSD',
    'MonthlyJPY',
    'Batch50Applied',
    'PriceEffectiveUntil',
  ].join(',')

  const lines = rows.map((r) =>
    [
      `"${r.provider.replace(/"/g, '""')}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      r.tier,
      r.releasedAt,
      r.inputPerMillionUsd.toFixed(4),
      r.outputPerMillionUsd.toFixed(4),
      r.cachedInputPerMillionUsd.toFixed(4),
      r.perRequestUsd.toFixed(6),
      r.monthlyUsd.toFixed(4),
      Math.round(r.monthlyJpy).toString(),
      r.batchApplied ? 'YES' : 'NO',
      r.priceEffectiveUntil ?? '',
    ].join(',')
  )
  return [header, ...lines].join('\r\n')
}
