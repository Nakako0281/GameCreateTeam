import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  BarChart3,
  CalendarClock,
  Download,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Table2,
  TrendingUp,
} from 'lucide-react'
import {
  DEFAULT_USD_TO_JPY,
  OFFICIAL_BENCHMARK_SOURCE,
  OFFICIAL_PRICING_SOURCES,
  PRICING_LAST_VERIFIED,
  type BenchmarkMetricKey,
  type LlmProvider,
} from '../../data/llm-pricing'
import {
  calculateAllModelCosts,
  computeBenchmarkComparison,
  estimateTokens,
  exportCostComparisonCsv,
} from '../../lib/tools/llm-cost'

const SAMPLE_JP_PROMPT = `あなたはBtoB SaaSのカスタマーサクセス担当です。以下の顧客からの問い合わせ履歴とエラーログを要約し、原因の仮説を3点、顧客向けの丁寧な一次返信メール案を日本語で作成してください。専門用語は噛み砕き、事実と推測を明確に分けて記述してください。`

const SAMPLE_CODE_PROMPT = `Review the following TypeScript module for edge-case bugs, memory leaks, and performance bottlenecks. Provide concise patches only:\nexport function normalizeBatch(items: string[]): string[] { return Array.from(new Set(items.map((v) => v.trim().toLowerCase()))); }`

const PROVIDER_FILTERS: Array<{ value: 'ALL' | LlmProvider; label: string }> = [
  { value: 'ALL', label: 'すべて' },
  { value: 'OpenAI', label: 'OpenAI' },
  { value: 'Anthropic', label: 'Anthropic' },
  { value: 'Google', label: 'Google' },
  { value: 'DeepSeek', label: 'DeepSeek' },
]

type ResultViewTab = 'table' | 'scatter' | 'bars'

const BENCHMARK_METRICS: Array<{
  key: BenchmarkMetricKey
  label: string
  shortLabel: string
  description: string
}> = [
  {
    key: 'overall',
    label: '総合推論・知識 (BenchLM Overall)',
    shortLabel: '総合スコア',
    description: 'BenchLM 公開横断評価（推論・専門知識・エージェント処理の総合0〜100指数）',
  },
  {
    key: 'coding',
    label: '実務コーディング (BenchLM Coding)',
    shortLabel: 'コーディング',
    description: 'BenchLM コーディング領域評価（コード生成・不具合修正・開発タスク0〜100指数）',
  },
]

const PROVIDER_VISUALS: Record<
  string,
  { color: string; bgClass: string; textClass: string; borderClass: string; shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'ring' }
> = {
  OpenAI: {
    color: '#0f172a',
    bgClass: 'bg-slate-900',
    textClass: 'text-slate-900',
    borderClass: 'border-slate-300',
    shape: 'circle',
  },
  Anthropic: {
    color: '#d97706',
    bgClass: 'bg-amber-600',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-300',
    shape: 'square',
  },
  Google: {
    color: '#0284c7',
    bgClass: 'bg-sky-600',
    textClass: 'text-sky-800',
    borderClass: 'border-sky-300',
    shape: 'diamond',
  },
  DeepSeek: {
    color: '#059669',
    bgClass: 'bg-emerald-600',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-300',
    shape: 'triangle',
  },
  Custom: {
    color: '#7c3aed',
    bgClass: 'bg-violet-600',
    textClass: 'text-violet-800',
    borderClass: 'border-violet-300',
    shape: 'ring',
  },
}

function getProviderVisual(provider: string) {
  return PROVIDER_VISUALS[provider] || PROVIDER_VISUALS.Custom
}

function formatUsdRate(value: number): string {
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '')
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return isoDate
  return `${Number(month)}/${Number(day)}`
}

function formatCompactJpy(jpy: number): string {
  const rounded = Math.round(jpy)
  if (rounded >= 10000) {
    const man = rounded / 10000
    return `${man >= 10 ? Math.round(man) : Number(man.toFixed(1))}万円`
  }
  return `${rounded.toLocaleString()}円`
}

function renderMarkerGlyph(
  shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'ring',
  cx: number,
  cy: number,
  radius: number,
  color: string,
  isSelected: boolean
) {
  const r = isSelected ? radius + 1.5 : radius
  switch (shape) {
    case 'square':
      return (
        <rect
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          rx={1.5}
          fill={color}
          stroke="#ffffff"
          strokeWidth={1.75}
        />
      )
    case 'diamond':
      return (
        <polygon
          points={`${cx},${cy - r - 1.5} ${cx + r + 1.5},${cy} ${cx},${cy + r + 1.5} ${cx - r - 1.5},${cy}`}
          fill={color}
          stroke="#ffffff"
          strokeWidth={1.75}
        />
      )
    case 'triangle':
      return (
        <polygon
          points={`${cx},${cy - r - 1.5} ${cx + r + 1.5},${cy + r + 1} ${cx - r - 1.5},${cy + r + 1}`}
          fill={color}
          stroke="#ffffff"
          strokeWidth={1.75}
        />
      )
    case 'ring':
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="#ffffff"
          stroke={color}
          strokeWidth={2.5}
        />
      )
    default:
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={color}
          stroke="#ffffff"
          strokeWidth={1.75}
        />
      )
  }
}

export default function LlmCostCalculator() {
  const [promptText, setPromptText] = useState(SAMPLE_JP_PROMPT)
  const [overrideInputTokens, setOverrideInputTokens] = useState<string>('')
  const [outputTokens, setOutputTokens] = useState(800)
  const [monthlyRequests, setMonthlyRequests] = useState(1000)
  const [cacheHitRate, setCacheHitRate] = useState(0)
  const [useBatchApi, setUseBatchApi] = useState(false)
  const [usdToJpy, setUsdToJpy] = useState(DEFAULT_USD_TO_JPY)
  const [providerFilter, setProviderFilter] = useState<'ALL' | LlmProvider>('ALL')

  const [resultTab, setResultTab] = useState<ResultViewTab>('table')
  const [benchmarkMetric, setBenchmarkMetric] = useState<BenchmarkMetricKey>('overall')
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)

  const [useCustomModel, setUseCustomModel] = useState(false)
  const [customName, setCustomName] = useState('自社想定モデル')
  const [customInputPrice, setCustomInputPrice] = useState(1.0)
  const [customOutputPrice, setCustomOutputPrice] = useState(4.0)
  const [customCachePrice, setCustomCachePrice] = useState(0.25)
  const [customBenchmarkOverall, setCustomBenchmarkOverall] = useState<string>('')
  const [customBenchmarkCoding, setCustomBenchmarkCoding] = useState<string>('')
  const [asOfDate, setAsOfDate] = useState(PRICING_LAST_VERIFIED)

  useEffect(() => {
    const utcToday = new Date().toISOString().slice(0, 10)
    if (utcToday > PRICING_LAST_VERIFIED) {
      setAsOfDate(utcToday)
    }
  }, [])

  const tokenEstimate = useMemo(() => estimateTokens(promptText), [promptText])

  const effectiveInputTokens = useMemo(() => {
    const parsed = Number(overrideInputTokens)
    if (overrideInputTokens.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed)
    }
    return tokenEstimate.estimatedTokens
  }, [overrideInputTokens, tokenEstimate.estimatedTokens])

  const rows = useMemo(() => {
    const parsedOverall =
      customBenchmarkOverall.trim() === '' ? null : Number(customBenchmarkOverall)
    const parsedCoding =
      customBenchmarkCoding.trim() === '' ? null : Number(customBenchmarkCoding)

    return calculateAllModelCosts({
      inputTokens: effectiveInputTokens,
      outputTokens,
      monthlyRequests,
      cacheHitRatePercent: cacheHitRate,
      useBatchApi,
      usdToJpy,
      asOfDate,
      customModel: useCustomModel
        ? {
            name: customName,
            inputPerMillionUsd: customInputPrice,
            outputPerMillionUsd: customOutputPrice,
            cachedInputPerMillionUsd: customCachePrice,
            benchmarkOverall: parsedOverall,
            benchmarkCoding: parsedCoding,
          }
        : null,
    })
  }, [
    effectiveInputTokens,
    outputTokens,
    monthlyRequests,
    cacheHitRate,
    useBatchApi,
    usdToJpy,
    asOfDate,
    useCustomModel,
    customName,
    customInputPrice,
    customOutputPrice,
    customCachePrice,
    customBenchmarkOverall,
    customBenchmarkCoding,
  ])

  const filteredRows = useMemo(() => {
    if (providerFilter === 'ALL') return rows
    return rows.filter(
      (row) => row.provider === providerFilter || row.provider === 'Custom'
    )
  }, [rows, providerFilter])

  const benchmarkData = useMemo(
    () => computeBenchmarkComparison(filteredRows, benchmarkMetric),
    [filteredRows, benchmarkMetric]
  )

  const sortedByScoreDesc = useMemo(
    () =>
      [...benchmarkData.measured].sort(
        (a, b) => b.score - a.score || a.row.monthlyUsd - b.row.monthlyUsd
      ),
    [benchmarkData.measured]
  )

  const activeMetricMeta =
    BENCHMARK_METRICS.find((m) => m.key === benchmarkMetric) || BENCHMARK_METRICS[0]

  const activePoint = useMemo(() => {
    if (benchmarkData.measured.length === 0) return null
    if (selectedModelId) {
      const hit = benchmarkData.measured.find((p) => p.row.id === selectedModelId)
      if (hit) return hit
    }
    return (
      benchmarkData.paretoFrontier[Math.floor(benchmarkData.paretoFrontier.length / 2)] ||
      benchmarkData.measured[0]
    )
  }, [benchmarkData, selectedModelId])

  const scatterLayout = useMemo(() => {
    const pts = benchmarkData.measured
    if (pts.length === 0) return null

    const svgWidth = 640
    const svgHeight = 330
    const padLeft = 52
    const padRight = 24
    const padTop = 22
    const padBottom = 46
    const plotW = svgWidth - padLeft - padRight
    const plotH = svgHeight - padTop - padBottom

    const logValues = pts.map((p) => Math.log10(Math.max(1, p.row.monthlyJpy)))
    const minLogRaw = Math.min(...logValues)
    const maxLogRaw = Math.max(...logValues)
    const logSpan = Math.max(0.6, maxLogRaw - minLogRaw)
    const minLog = minLogRaw - logSpan * 0.08
    const maxLog = maxLogRaw + logSpan * 0.08

    const scores = pts.map((p) => p.score)
    const minScore = Math.max(30, Math.floor((Math.min(...scores) - 6) / 10) * 10)
    const maxScore = 100

    const toX = (jpy: number) => {
      const lv = Math.log10(Math.max(1, jpy))
      return padLeft + ((lv - minLog) / (maxLog - minLog)) * plotW
    }
    const toY = (score: number) => {
      return padTop + ((maxScore - score) / (maxScore - minScore)) * plotH
    }

    const xTicks: Array<{ jpy: number; x: number; label: string }> = []
    const startPow = Math.floor(minLogRaw)
    const endPow = Math.ceil(maxLogRaw)
    for (let p = startPow; p <= endPow; p++) {
      const val = Math.pow(10, p)
      const x = toX(val)
      if (x >= padLeft - 6 && x <= svgWidth - padRight + 6) {
        xTicks.push({ jpy: val, x, label: formatCompactJpy(val) })
      }
    }
    if (xTicks.length < 2) {
      const minJpy = Math.max(1, Math.min(...pts.map((p) => p.row.monthlyJpy)))
      const maxJpy = Math.max(minJpy + 10, Math.max(...pts.map((p) => p.row.monthlyJpy)))
      xTicks.push(
        { jpy: minJpy, x: toX(minJpy), label: formatCompactJpy(minJpy) },
        { jpy: maxJpy, x: toX(maxJpy), label: formatCompactJpy(maxJpy) }
      )
    }

    const yTicks: Array<{ score: number; y: number }> = []
    for (let s = minScore; s <= maxScore; s += 10) {
      yTicks.push({ score: s, y: toY(s) })
    }

    const mappedPointsBase = pts.map((pt, index) => ({
      ...pt,
      rankIndex: index + 1,
      cx: toX(pt.row.monthlyJpy),
      cy: toY(pt.score),
    }))

    // ラベル衝突防止（PC表示用の単純貪欲オフセット配置）
    const placedBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    const mappedPoints = mappedPointsBase.map((pt) => {
      const labelW = pt.row.name.length * 6.8 + 8
      const labelH = 14
      const preferLeft = pt.cx > svgWidth - padRight - labelW - 14
      const candidates: Array<{
        dx: number
        dy: number
        anchor: 'start' | 'middle' | 'end'
      }> = [
        { dx: preferLeft ? -10 : 10, dy: -8, anchor: preferLeft ? 'end' : 'start' },
        { dx: preferLeft ? -10 : 10, dy: 14, anchor: preferLeft ? 'end' : 'start' },
        { dx: preferLeft ? 10 : -10, dy: -8, anchor: preferLeft ? 'start' : 'end' },
        { dx: 0, dy: -13, anchor: 'middle' },
        { dx: 0, dy: 18, anchor: 'middle' },
      ]

      let chosen = candidates[0]
      for (const cand of candidates) {
        const lx = pt.cx + cand.dx
        const ly = pt.cy + cand.dy
        const x1 =
          cand.anchor === 'end'
            ? lx - labelW
            : cand.anchor === 'middle'
              ? lx - labelW / 2
              : lx
        const x2 = x1 + labelW
        const y1 = ly - labelH + 3
        const y2 = ly + 3

        const outOfBounds =
          x1 < padLeft + 2 ||
          x2 > svgWidth - padRight + 8 ||
          y1 < 6 ||
          y2 > svgHeight - padBottom - 2
        const collides = placedBoxes.some(
          (b) => !(x2 < b.x1 || x1 > b.x2 || y2 < b.y1 || y1 > b.y2)
        )
        if (!outOfBounds && !collides) {
          chosen = cand
          if (pt.isParetoOptimal) {
            placedBoxes.push({ x1, y1, x2, y2 })
          }
          break
        }
      }

      return {
        ...pt,
        labelX: pt.cx + chosen.dx,
        labelY: pt.cy + chosen.dy,
        labelAnchor: chosen.anchor,
      }
    })

    const frontierPath = mappedPoints
      .filter((p) => p.isParetoOptimal)
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`)
      .join(' ')

    return {
      svgWidth,
      svgHeight,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotW,
      plotH,
      xTicks,
      yTicks,
      mappedPoints,
      frontierPath,
    }
  }, [benchmarkData.measured])

  const handleExportCsv = () => {
    const csv = exportCostComparisonCsv(filteredRows)
    const bom = new Uint8Array([0xef, 0xbb, 0xbf])
    const encoder = new TextEncoder()
    const blob = new Blob([bom, encoder.encode(csv)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'llm-cost-comparison.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* スリム1行ツールバー */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs">
        <span className="font-medium text-slate-600 tabular-nums">
          料金・性能確認: {PRICING_LAST_VERIFIED}（{rows.length}モデル）
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setPromptText(SAMPLE_JP_PROMPT)
              setOverrideInputTokens('')
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            日本語プロンプト
          </button>
          <button
            type="button"
            onClick={() => {
              setPromptText(SAMPLE_CODE_PROMPT)
              setOverrideInputTokens('')
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            英語コードレビュー
          </button>
          <button
            type="button"
            onClick={() => {
              setPromptText('')
              setOverrideInputTokens('')
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            クリア
          </button>
        </div>
      </div>

      {/* プロンプト入力 & トークン内訳 */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <label
            htmlFor="llm-prompt-input"
            className="block text-xs font-bold text-slate-800"
          >
            入力プロンプト
          </label>
          <textarea
            id="llm-prompt-input"
            rows={4}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="システムプロンプトや想定入力テキストを貼り付けてください..."
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm leading-relaxed text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <dl className="grid grid-cols-2 gap-2.5 self-start rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
          <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200/80">
            <dt className="text-slate-500">推定トークン数</dt>
            <dd
              data-testid="effective-input-tokens"
              className="mt-0.5 text-lg font-bold tabular-nums text-sky-800"
            >
              {effectiveInputTokens.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200/80">
            <dt className="text-slate-500">総文字数</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {tokenEstimate.totalChars.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200/80">
            <dt className="text-slate-500">漢字 / かな</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">
              {tokenEstimate.kanjiChars} / {tokenEstimate.kanaChars}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200/80">
            <dt className="text-slate-500">半角英数</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-800">
              {tokenEstimate.asciiChars}
            </dd>
          </div>
        </dl>
      </div>

      {/* 条件パラメータ */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label
            htmlFor="override-tokens"
            className="block text-xs font-semibold text-slate-700"
          >
            入力トークン指定
          </label>
          <input
            id="override-tokens"
            type="number"
            min={0}
            value={overrideInputTokens}
            onChange={(e) => setOverrideInputTokens(e.target.value)}
            placeholder={`自動: ${tokenEstimate.estimatedTokens}`}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="output-tokens"
            className="block text-xs font-semibold text-slate-700"
          >
            出力トークン
          </label>
          <input
            id="output-tokens"
            type="number"
            min={0}
            value={outputTokens}
            onChange={(e) => setOutputTokens(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="monthly-requests"
            className="block text-xs font-semibold text-slate-700"
          >
            月間回数
          </label>
          <input
            id="monthly-requests"
            type="number"
            min={1}
            value={monthlyRequests}
            onChange={(e) => setMonthlyRequests(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="cache-hit-rate"
            className="block text-xs font-semibold tabular-nums text-slate-700"
          >
            キャッシュ率: {cacheHitRate}%
          </label>
          <input
            id="cache-hit-rate"
            type="range"
            min={0}
            max={90}
            step={10}
            value={cacheHitRate}
            onChange={(e) => setCacheHitRate(Number(e.target.value))}
            className="mt-2.5 w-full accent-sky-700"
          />
        </div>
        <div>
          <label
            htmlFor="usd-jpy"
            className="block text-xs font-semibold text-slate-700"
          >
            為替 (円/$)
          </label>
          <input
            id="usd-jpy"
            type="number"
            min={50}
            max={400}
            value={usdToJpy}
            onChange={(e) =>
              setUsdToJpy(Math.max(50, Number(e.target.value) || DEFAULT_USD_TO_JPY))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm tabular-nums text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      {/* オプション & プロバイダ絞り込み */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="プロバイダ絞り込み"
          className="flex flex-wrap items-center gap-1.5"
        >
          {PROVIDER_FILTERS.map((item) => {
            const active = providerFilter === item.value
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={active}
                onClick={() => setProviderFilter(item.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={useBatchApi}
              onChange={(e) => setUseBatchApi(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-700"
            />
            Batch API（50%割引・対応モデル）
          </label>

          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={useCustomModel}
              onChange={(e) => setUseCustomModel(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-700"
            />
            カスタム比較
          </label>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            CSV出力
          </button>
        </div>
      </div>

      {useCustomModel && (
        <div className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50/40 p-3.5 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-700">モデル名</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">入力 $/1M</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={customInputPrice}
              onChange={(e) => setCustomInputPrice(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">出力 $/1M</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={customOutputPrice}
              onChange={(e) => setCustomOutputPrice(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">キャッシュ $/1M</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={customCachePrice}
              onChange={(e) => setCustomCachePrice(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              性能スコア (任意 1-100)
            </label>
            <input
              type="number"
              step="0.1"
              min={1}
              max={100}
              placeholder="未指定"
              value={
                benchmarkMetric === 'coding'
                  ? customBenchmarkCoding
                  : customBenchmarkOverall
              }
              onChange={(e) => {
                if (benchmarkMetric === 'coding') {
                  setCustomBenchmarkCoding(e.target.value)
                } else {
                  setCustomBenchmarkOverall(e.target.value)
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
            />
          </div>
        </div>
      )}

      {/* 結果表示ビュー切替タブ（Issue #79: 初期FVを圧迫せず1行で切替） */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 pb-2.5">
        <div
          role="tablist"
          aria-label="比較ビュー切替"
          className="inline-flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={resultTab === 'table'}
            onClick={() => setResultTab('table')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              resultTab === 'table'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            料金テーブル
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resultTab === 'scatter'}
            onClick={() => setResultTab('scatter')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              resultTab === 'scatter'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            コスパ×性能マップ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={resultTab === 'bars'}
            onClick={() => setResultTab('bars')}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              resultTab === 'bars'
                ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            ベンチマーク棒グラフ
          </button>
        </div>

        {resultTab !== 'table' && (
          <div
            role="group"
            aria-label="ベンチマーク評価軸"
            className="flex flex-wrap items-center gap-1.5"
          >
            {BENCHMARK_METRICS.map((m) => {
              const active = benchmarkMetric === m.key
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBenchmarkMetric(m.key)}
                  className={`min-h-9 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? 'bg-sky-700 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m.shortLabel}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* タブ1: 料金比較表 */}
      {resultTab === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold text-slate-700">
              <tr>
                <th className="px-4 py-2.5">モデル</th>
                <th className="px-4 py-2.5">単価 (入/出 $/1M)</th>
                <th className="px-4 py-2.5">性能 (総合/Code)</th>
                <th className="px-4 py-2.5">1回 (USD)</th>
                <th className="px-4 py-2.5">月額 (USD)</th>
                <th className="px-4 py-2.5">月額目安 (円)</th>
                <th className="px-4 py-2.5">注記</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {filteredRows.map((row, idx) => (
                <tr key={row.id} className={idx === 0 ? 'bg-emerald-50/40' : ''}>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-500">{row.provider}</span>
                      <span>{row.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600">
                        {row.releasedAt}
                      </span>
                      {idx === 0 && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                          最安
                        </span>
                      )}
                      {row.batchApplied && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                          Batch 50%OFF
                        </span>
                      )}
                      {row.priceEffectiveUntil && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          <CalendarClock className="h-3 w-3" />
                          導入価格 〜{formatShortDate(row.priceEffectiveUntil)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs tabular-nums text-slate-600">
                    ${formatUsdRate(row.inputPerMillionUsd)} / ${formatUsdRate(row.outputPerMillionUsd)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs tabular-nums text-slate-700">
                    {row.benchmarks.overall !== null
                      ? `${row.benchmarks.overall.toFixed(1)} / ${row.benchmarks.coding !== null ? row.benchmarks.coding.toFixed(1) : '—'}`
                      : '未計測'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono tabular-nums text-slate-700">
                    ${row.perRequestUsd.toFixed(5)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono font-semibold tabular-nums text-slate-900">
                    ${row.monthlyUsd.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono font-bold tabular-nums text-sky-900">
                    {Math.round(row.monthlyJpy).toLocaleString()} 円
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* タブ2: コスパ × 性能散布図（対数コスト軸 ＋ パレート効率フロンティア） */}
      {resultTab === 'scatter' && (
        <div
          data-testid="llm-scatter-panel"
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                実利用月額（対数軸）× {activeMetricMeta.label}
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                左上に位置するほど「低コストかつ高性能」です。破線は同予算帯で最高性能となるパレート最適モデルを結びます。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-medium text-slate-600">
              {(['OpenAI', 'Anthropic', 'Google', 'DeepSeek'] as const).map((prov) => {
                const vis = getProviderVisual(prov)
                return (
                  <span key={prov} className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      {renderMarkerGlyph(vis.shape, 6, 6, 3.8, vis.color, false)}
                    </svg>
                    {prov}
                  </span>
                )
              })}
            </div>
          </div>

          {scatterLayout && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-2 sm:p-3">
              <svg
                data-testid="llm-pareto-svg"
                viewBox={`0 0 ${scatterLayout.svgWidth} ${scatterLayout.svgHeight}`}
                role="img"
                aria-label={`${activeMetricMeta.label} と試算月額料金の散布図`}
                className="h-auto w-full select-none"
              >
                {/* グリッド線 (Y軸: スコア) */}
                {scatterLayout.yTicks.map((yt) => (
                  <g key={`y-${yt.score}`}>
                    <line
                      x1={scatterLayout.padLeft}
                      y1={yt.y}
                      x2={scatterLayout.svgWidth - scatterLayout.padRight}
                      y2={yt.y}
                      stroke="#e2e8f0"
                      strokeDasharray={yt.score === 100 ? undefined : '3 3'}
                    />
                    <text
                      x={scatterLayout.padLeft - 8}
                      y={yt.y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#475569"
                    >
                      {yt.score}
                    </text>
                  </g>
                ))}

                {/* グリッド線 (X軸: 対数月額円) */}
                {scatterLayout.xTicks.map((xt, idx) => (
                  <g key={`x-${xt.jpy}-${idx}`}>
                    <line
                      x1={xt.x}
                      y1={scatterLayout.padTop}
                      x2={xt.x}
                      y2={scatterLayout.svgHeight - scatterLayout.padBottom}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x={xt.x}
                      y={scatterLayout.svgHeight - scatterLayout.padBottom + 16}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#475569"
                    >
                      {xt.label}
                    </text>
                  </g>
                ))}

                {/* 軸タイトル */}
                <text
                  x={scatterLayout.padLeft + scatterLayout.plotW / 2}
                  y={scatterLayout.svgHeight - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#334155"
                >
                  あなたの試算条件での月額目安（円・対数スケール／左ほど安価）
                </text>
                <text
                  x={14}
                  y={scatterLayout.padTop + scatterLayout.plotH / 2}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#334155"
                  transform={`rotate(-90 14 ${scatterLayout.padTop + scatterLayout.plotH / 2})`}
                >
                  性能スコア (0-100)
                </text>

                {/* パレート最適フロンティア折れ線 */}
                {scatterLayout.frontierPath && (
                  <path
                    d={scatterLayout.frontierPath}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                  />
                )}

                {/* 各モデルプロット */}
                {scatterLayout.mappedPoints.map((pt) => {
                  const vis = getProviderVisual(pt.row.provider)
                  const isSelected = activePoint?.row.id === pt.row.id
                  return (
                    <g
                      key={pt.row.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedModelId(pt.row.id)}
                    >
                      <title>
                        {`${pt.row.name} (${pt.row.provider}) — スコア: ${pt.score.toFixed(1)} / 月額: ${Math.round(pt.row.monthlyJpy).toLocaleString()}円`}
                      </title>
                      {/* タップ・クリック判定用の透明サークル */}
                      <circle cx={pt.cx} cy={pt.cy} r={16} fill="transparent" />
                      {pt.isParetoOptimal && (
                        <circle
                          cx={pt.cx}
                          cy={pt.cy}
                          r={isSelected ? 11 : 9}
                          fill="none"
                          stroke="#0284c7"
                          strokeOpacity={0.45}
                          strokeWidth={2}
                        />
                      )}
                      {renderMarkerGlyph(
                        vis.shape,
                        pt.cx,
                        pt.cy,
                        pt.isParetoOptimal ? 5.5 : 4.5,
                        vis.color,
                        isSelected
                      )}
                      {/* ラベル重なり防止のため、パレート最適または選択中モデルのみSVG上に白縁取りラベル表示 */}
                      {(pt.isParetoOptimal || isSelected) && (
                        <text
                          x={pt.labelX}
                          y={pt.labelY}
                          textAnchor={pt.labelAnchor}
                          fontSize="11"
                          fontWeight={isSelected ? '700' : '600'}
                          fill={isSelected ? '#0f172a' : '#334155'}
                          stroke="#f8fafc"
                          strokeWidth={3}
                          paintOrder="stroke"
                          className="hidden sm:block"
                        >
                          {pt.row.name}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          )}

          {/* 選択中モデル詳細カード */}
          {activePoint && (
            <div
              data-testid="scatter-selected-detail"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/50 px-3.5 py-2.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-600">
                  {activePoint.row.provider}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {activePoint.row.name}
                </span>
                {activePoint.isParetoOptimal && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">
                    <Award className="h-3 w-3" />
                    パレート最適（同予算帯で最高性能）
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                <span className="text-slate-700">
                  {activeMetricMeta.shortLabel}:{' '}
                  <strong className="text-slate-900">
                    {activePoint.score.toFixed(1)}
                  </strong>{' '}
                  / 100
                </span>
                <span className="text-slate-700">
                  試算月額:{' '}
                  <strong className="text-sky-900">
                    {Math.round(activePoint.row.monthlyJpy).toLocaleString()} 円
                  </strong>{' '}
                  (${activePoint.row.monthlyUsd.toFixed(2)})
                </span>
              </div>
            </div>
          )}

          {/* パレート最適モデル一覧（モバイルでも1タップで切替可能） */}
          <div>
            <p className="text-xs font-bold text-slate-700">
              パレート最適モデル（コスト効率フロンティア・安い順）
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {benchmarkData.paretoFrontier.map((pt) => {
                const isSelected = activePoint?.row.id === pt.row.id
                return (
                  <button
                    key={pt.row.id}
                    type="button"
                    onClick={() => setSelectedModelId(pt.row.id)}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-400'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{pt.row.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {pt.row.provider} · {Math.round(pt.row.monthlyJpy).toLocaleString()}円/月
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <span className="rounded-md bg-sky-100 px-2 py-0.5 font-bold text-sky-900">
                        {pt.score.toFixed(1)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {benchmarkData.unmeasured.length > 0 && (
            <p className="text-[11px] text-slate-500">
              同条件スコア未設定のためプロット対象外:{' '}
              {benchmarkData.unmeasured.map((u) => u.name).join('、')}
            </p>
          )}
        </div>
      )}

      {/* タブ3: ベンチマーク横棒グラフ比較（390pxスマホでも文字潰れゼロ） */}
      {resultTab === 'bars' && (
        <div
          data-testid="llm-bars-panel"
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {activeMetricMeta.label} ランキング（スコア順）
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              {activeMetricMeta.description}。右端に現在の入力条件での試算月額（円）を併記しています。
            </p>
          </div>

          <div className="space-y-2.5">
            {sortedByScoreDesc.map((pt, idx) => {
              const vis = getProviderVisual(pt.row.provider)
              return (
                <div
                  key={pt.row.id}
                  className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-slate-200/80 px-1 font-mono text-[11px] font-bold text-slate-700">
                        #{idx + 1}
                      </span>
                      <span className={`font-semibold ${vis.textClass}`}>
                        {pt.row.provider}
                      </span>
                      <span className="font-bold text-slate-900">{pt.row.name}</span>
                      {pt.isParetoOptimal && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                          <Award className="h-3 w-3" />
                          コスパ最適帯
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <span className="text-slate-600">
                        月額 {Math.round(pt.row.monthlyJpy).toLocaleString()}円
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {pt.score.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${pt.row.name} ${activeMetricMeta.shortLabel}`}
                    aria-valuenow={pt.score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80"
                  >
                    <div
                      className={`h-full rounded-full transition-all ${vis.bgClass}`}
                      style={{ width: `${Math.min(100, Math.max(2, pt.score))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {benchmarkData.unmeasured.length > 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              スコア未設定モデル（カスタム欄で任意入力可）:{' '}
              {benchmarkData.unmeasured.map((u) => u.name).join('、')}
            </div>
          )}
        </div>
      )}

      {/* 公式料金表・ベンチマーク出典リンク */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          表示中: {filteredRows.length} モデル（料金確認・性能参照: {PRICING_LAST_VERIFIED}）
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>一次ソース:</span>
          {Object.entries(OFFICIAL_PRICING_SOURCES).map(([provider, url]) => (
            <a
              key={provider}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-sky-700"
            >
              <span>{provider}</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
          <a
            href={OFFICIAL_BENCHMARK_SOURCE.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-sky-700"
          >
            <span>BenchLM (性能指数)</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
