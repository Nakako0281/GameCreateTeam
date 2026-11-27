import {
  LLM_MODELS,
  PRICING_LAST_VERIFIED,
  type BenchmarkMetricKey,
  type ModelBenchmarkProfile,
  type ScheduledModelPrice,
} from '../../data/llm-pricing'

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
  asOfDate?: string
  customModel?: {
    name: string
    inputPerMillionUsd: number
    outputPerMillionUsd: number
    cachedInputPerMillionUsd: number
    benchmarkOverall?: number | null
    benchmarkCoding?: number | null
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
  benchmarks: ModelBenchmarkProfile
  sourceUrl: string
  notes: string
}

export interface BenchmarkChartPoint {
  row: ModelCostRow
  score: number
  isParetoOptimal: boolean
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

export interface SimulatableModel {
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
  scheduledPricing?: ScheduledModelPrice
  benchmarks: ModelBenchmarkProfile
  sourceUrl: string
  notes: string
}

type PricedModelLike = Pick<
  SimulatableModel,
  | 'inputPerMillionUsd'
  | 'outputPerMillionUsd'
  | 'cachedInputPerMillionUsd'
  | 'priceEffectiveUntil'
  | 'scheduledPricing'
  | 'notes'
>

function sanitizeOptionalScore(val?: number | null): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) return null
  if (val <= 0 || val > 100) return null
  return Number(val.toFixed(1))
}

/**
 * 基準日 (YYYY-MM-DD) に応じて予定改定価格を適用する。
 * デフォルト基準日は PRICING_LAST_VERIFIED に固定し、SSRおよび既存単体テストを決定的に保つ。
 */
export function resolveEffectiveModelPrice<T extends PricedModelLike>(
  model: T,
  asOfDate: string = PRICING_LAST_VERIFIED
): T {
  if (
    model.scheduledPricing &&
    asOfDate >= model.scheduledPricing.effectiveFrom
  ) {
    return {
      ...model,
      inputPerMillionUsd: model.scheduledPricing.inputPerMillionUsd,
      outputPerMillionUsd: model.scheduledPricing.outputPerMillionUsd,
      cachedInputPerMillionUsd:
        model.scheduledPricing.cachedInputPerMillionUsd,
      priceEffectiveUntil: undefined,
      notes: model.scheduledPricing.notes,
    }
  }
  return model
}

export function calculateSingleModelCost(
  model: SimulatableModel,
  input: CostSimulationInput
): ModelCostRow {
  const effectiveModel = resolveEffectiveModelPrice(
    model,
    input.asOfDate ?? PRICING_LAST_VERIFIED
  )
  const safeInputTokens = Math.max(0, input.inputTokens)
  const safeOutputTokens = Math.max(0, input.outputTokens)
  const safeRequests = Math.max(1, input.monthlyRequests)
  const hitRate = Math.min(95, Math.max(0, input.cacheHitRatePercent)) / 100
  const fx = Math.max(1, input.usdToJpy)

  const cachedTokens = safeInputTokens * hitRate
  const uncachedTokens = safeInputTokens * (1 - hitRate)

  let inputCostUsd =
    (uncachedTokens / 1_000_000) * effectiveModel.inputPerMillionUsd +
    (cachedTokens / 1_000_000) * effectiveModel.cachedInputPerMillionUsd
  let outputCostUsd =
    (safeOutputTokens / 1_000_000) * effectiveModel.outputPerMillionUsd

  const batchApplied = Boolean(
    input.useBatchApi && effectiveModel.supportsBatch50
  )
  if (batchApplied) {
    inputCostUsd *= 0.5
    outputCostUsd *= 0.5
  }

  const perRequestUsd = inputCostUsd + outputCostUsd
  const monthlyUsd = perRequestUsd * safeRequests
  const monthlyJpy = monthlyUsd * fx

  return {
    id: effectiveModel.id,
    provider: effectiveModel.provider,
    name: effectiveModel.name,
    tier: effectiveModel.tier,
    releasedAt: effectiveModel.releasedAt,
    inputPerMillionUsd: effectiveModel.inputPerMillionUsd,
    outputPerMillionUsd: effectiveModel.outputPerMillionUsd,
    cachedInputPerMillionUsd: effectiveModel.cachedInputPerMillionUsd,
    perRequestUsd,
    monthlyUsd,
    monthlyJpy,
    batchApplied,
    priceEffectiveUntil: effectiveModel.priceEffectiveUntil,
    benchmarks: effectiveModel.benchmarks,
    sourceUrl: effectiveModel.sourceUrl,
    notes: effectiveModel.notes,
  }
}

export function calculateAllModelCosts(
  input: CostSimulationInput
): ModelCostRow[] {
  const models: SimulatableModel[] = [...LLM_MODELS]

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
      benchmarks: {
        overall: sanitizeOptionalScore(input.customModel.benchmarkOverall),
        coding: sanitizeOptionalScore(input.customModel.benchmarkCoding),
        sourceUrl: '',
      },
      sourceUrl: '',
      notes: 'ユーザー指定のカスタム単価条件',
    })
  }

  return models
    .map((m) => calculateSingleModelCost(m, input))
    .sort((a, b) => a.monthlyUsd - b.monthlyUsd)
}

/**
 * 指定されたベンチマーク軸で有効スコアを持つモデルを抽出し、
 * 「それ以下の月額コストでより高い（または同等の）スコアを持つ他モデルが存在しない」
 * パレート最適（効率フロンティア）モデルを判定して返す。
 */
export function computeBenchmarkComparison(
  rows: ModelCostRow[],
  metric: BenchmarkMetricKey
): {
  measured: BenchmarkChartPoint[]
  unmeasured: ModelCostRow[]
  paretoFrontier: BenchmarkChartPoint[]
} {
  const unmeasured: ModelCostRow[] = []
  const rawPoints: Array<{ row: ModelCostRow; score: number }> = []

  for (const row of rows) {
    const score = row.benchmarks[metric]
    if (typeof score === 'number' && Number.isFinite(score) && score > 0) {
      rawPoints.push({ row, score })
    } else {
      unmeasured.push(row)
    }
  }

  // 月額コスト昇順、同額ならスコア降順で並べ、これまでの最高スコアを更新した点をパレート最適とする
  const sortedByCost = [...rawPoints].sort((a, b) => {
    const costDiff = a.row.monthlyUsd - b.row.monthlyUsd
    if (Math.abs(costDiff) > 1e-12) return costDiff
    return b.score - a.score
  })

  const paretoIds = new Set<string>()
  let bestScoreSoFar = -Infinity
  let prevParetoCost = -Infinity

  for (const item of sortedByCost) {
    const isSameCostAsPrev = Math.abs(item.row.monthlyUsd - prevParetoCost) <= 1e-12
    if (item.score > bestScoreSoFar || (isSameCostAsPrev && item.score === bestScoreSoFar)) {
      paretoIds.add(item.row.id)
      bestScoreSoFar = item.score
      prevParetoCost = item.row.monthlyUsd
    }
  }

  const measured: BenchmarkChartPoint[] = sortedByCost.map((item) => ({
    row: item.row,
    score: item.score,
    isParetoOptimal: paretoIds.has(item.row.id),
  }))

  const paretoFrontier = measured.filter((p) => p.isParetoOptimal)

  return {
    measured,
    unmeasured,
    paretoFrontier,
  }
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
    'BenchmarkOverall',
    'BenchmarkCoding',
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
      r.benchmarks.overall !== null ? r.benchmarks.overall.toFixed(1) : '',
      r.benchmarks.coding !== null ? r.benchmarks.coding.toFixed(1) : '',
      r.priceEffectiveUntil ?? '',
    ].join(',')
  )
  return [header, ...lines].join('\r\n')
}
