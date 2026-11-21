import { useMemo, useState } from 'react'
import {
  Calculator,
  CalendarClock,
  Download,
  ExternalLink,
  Info,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import {
  DEFAULT_USD_TO_JPY,
  OFFICIAL_PRICING_SOURCES,
  PRICING_LAST_VERIFIED,
  type LlmProvider,
} from '../../data/llm-pricing'
import {
  calculateAllModelCosts,
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

function formatUsdRate(value: number): string {
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '')
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  if (!month || !day) return isoDate
  return `${Number(month)}/${Number(day)}`
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

  const [useCustomModel, setUseCustomModel] = useState(false)
  const [customName, setCustomName] = useState('自社想定モデル')
  const [customInputPrice, setCustomInputPrice] = useState(1.0)
  const [customOutputPrice, setCustomOutputPrice] = useState(4.0)
  const [customCachePrice, setCustomCachePrice] = useState(0.25)

  const tokenEstimate = useMemo(() => estimateTokens(promptText), [promptText])

  const effectiveInputTokens = useMemo(() => {
    const parsed = Number(overrideInputTokens)
    if (overrideInputTokens.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed)
    }
    return tokenEstimate.estimatedTokens
  }, [overrideInputTokens, tokenEstimate.estimatedTokens])

  const rows = useMemo(() => {
    return calculateAllModelCosts({
      inputTokens: effectiveInputTokens,
      outputTokens,
      monthlyRequests,
      cacheHitRatePercent: cacheHitRate,
      useBatchApi,
      usdToJpy,
      customModel: useCustomModel
        ? {
            name: customName,
            inputPerMillionUsd: customInputPrice,
            outputPerMillionUsd: customOutputPrice,
            cachedInputPerMillionUsd: customCachePrice,
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
    useCustomModel,
    customName,
    customInputPrice,
    customOutputPrice,
    customCachePrice,
  ])

  const filteredRows = useMemo(() => {
    if (providerFilter === 'ALL') return rows
    return rows.filter(
      (row) => row.provider === providerFilter || row.provider === 'Custom'
    )
  }, [rows, providerFilter])

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
    <div className="space-y-6">
      <div className="space-y-2.5 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs text-sky-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <Info className="h-4 w-4 shrink-0 text-sky-700" />
            <span>
              料金データ確認日: {PRICING_LAST_VERIFIED}（主要4社・最新{rows.length}モデル比較。日次自動監査対象）
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPromptText(SAMPLE_JP_PROMPT)
                setOverrideInputTokens('')
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              日本語業務プロンプト
            </button>
            <button
              type="button"
              onClick={() => {
                setPromptText(SAMPLE_CODE_PROMPT)
                setOverrideInputTokens('')
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              英語コードレビュー
            </button>
            <button
              type="button"
              onClick={() => {
                setPromptText('')
                setOverrideInputTokens('')
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              クリア
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-sky-200/70 pt-2 text-[11px] text-sky-800">
          <span className="font-semibold">公式料金表:</span>
          {Object.entries(OFFICIAL_PRICING_SOURCES).map(([provider, url]) => (
            <a
              key={provider}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline decoration-sky-400 underline-offset-2 hover:text-sky-950"
            >
              <span>{provider}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </div>

      {/* プロンプト入力 & トークン内訳 */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <label
            htmlFor="llm-prompt-input"
            className="block text-sm font-bold text-slate-900"
          >
            入力プロンプト（日本語・英語・ソースコード）
          </label>
          <textarea
            id="llm-prompt-input"
            rows={5}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="ここにシステムプロンプトや想定入力テキストを貼り付けてください..."
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Calculator className="h-4 w-4 text-sky-700" />
            <span>ローカル推定トークン内訳</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
              <dt className="text-slate-500">計算に使う入力トークン</dt>
              <dd
                data-testid="effective-input-tokens"
                className="mt-0.5 text-lg font-bold text-sky-800"
              >
                {effectiveInputTokens.toLocaleString()}
              </dd>
            </div>
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
              <dt className="text-slate-500">総文字数</dt>
              <dd className="mt-0.5 text-lg font-bold text-slate-900">
                {tokenEstimate.totalChars.toLocaleString()}
              </dd>
            </div>
            <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
              <dt className="text-slate-500">漢字 / かな</dt>
              <dd className="mt-0.5 font-semibold text-slate-800">
                {tokenEstimate.kanjiChars} / {tokenEstimate.kanaChars}
              </dd>
            </div>
            <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
              <dt className="text-slate-500">半角英数・記号</dt>
              <dd className="mt-0.5 font-semibold text-slate-800">
                {tokenEstimate.asciiChars}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* 条件パラメータ */}
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label
            htmlFor="override-tokens"
            className="block text-xs font-semibold text-slate-700"
          >
            入力トークン直接指定（任意）
          </label>
          <input
            id="override-tokens"
            type="number"
            min={0}
            value={overrideInputTokens}
            onChange={(e) => setOverrideInputTokens(e.target.value)}
            placeholder={`自動: ${tokenEstimate.estimatedTokens}`}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="output-tokens"
            className="block text-xs font-semibold text-slate-700"
          >
            1回の出力トークン数
          </label>
          <input
            id="output-tokens"
            type="number"
            min={0}
            value={outputTokens}
            onChange={(e) => setOutputTokens(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="monthly-requests"
            className="block text-xs font-semibold text-slate-700"
          >
            月間リクエスト回数
          </label>
          <input
            id="monthly-requests"
            type="number"
            min={1}
            value={monthlyRequests}
            onChange={(e) => setMonthlyRequests(Math.max(1, Number(e.target.value) || 1))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="cache-hit-rate"
            className="block text-xs font-semibold text-slate-700"
          >
            キャッシュヒット率: {cacheHitRate}%
          </label>
          <input
            id="cache-hit-rate"
            type="range"
            min={0}
            max={90}
            step={10}
            value={cacheHitRate}
            onChange={(e) => setCacheHitRate(Number(e.target.value))}
            className="mt-3 w-full accent-sky-700"
          />
        </div>
        <div>
          <label
            htmlFor="usd-jpy"
            className="block text-xs font-semibold text-slate-700"
          >
            想定為替レート (円/USD)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="usd-jpy"
              type="number"
              min={50}
              max={400}
              value={usdToJpy}
              onChange={(e) =>
                setUsdToJpy(Math.max(50, Number(e.target.value) || DEFAULT_USD_TO_JPY))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 追加オプション行 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-800">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={useBatchApi}
              onChange={(e) => setUseBatchApi(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-700"
            />
            Batch API（非同期50%割引・対応モデルのみ）を適用
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={useCustomModel}
              onChange={(e) => setUseCustomModel(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-700"
            />
            カスタム単価モデルを比較表に追加
          </label>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" />
          試算結果をCSVダウンロード
        </button>
      </div>

      {useCustomModel && (
        <div className="grid gap-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4 sm:grid-cols-4">
          <div>
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
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">キャッシュ入力 $/1M</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={customCachePrice}
              onChange={(e) => setCustomCachePrice(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>
      )}

      {/* プロバイダ絞り込み */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
        <span className="text-xs font-medium text-slate-500">
          表示中: {filteredRows.length} モデル（月額安い順）
        </span>
      </div>

      {/* 比較表 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-700">
            <tr>
              <th className="px-4 py-3">モデル</th>
              <th className="px-4 py-3">単価 (入/出 $/1M)</th>
              <th className="px-4 py-3">1回あたり (USD)</th>
              <th className="px-4 py-3">月額 (USD)</th>
              <th className="px-4 py-3">月額目安 (円)</th>
              <th className="px-4 py-3">特徴・注記</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
            {filteredRows.map((row, idx) => (
              <tr key={row.id} className={idx === 0 ? 'bg-emerald-50/40' : ''}>
                <td className="px-4 py-3 font-semibold text-slate-900">
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
                <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                  ${formatUsdRate(row.inputPerMillionUsd)} / ${formatUsdRate(row.outputPerMillionUsd)}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                  ${row.perRequestUsd.toFixed(5)}
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                  ${row.monthlyUsd.toFixed(2)}
                </td>
                <td className="px-4 py-3 font-mono font-bold text-sky-900 whitespace-nowrap">
                  {Math.round(row.monthlyJpy).toLocaleString()} 円
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
