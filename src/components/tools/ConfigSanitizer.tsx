import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileCode2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  buildSanitizedFilename,
  DEFAULT_SANITIZE_OPTIONS,
  MAX_INPUT_BYTES,
  REASON_LABELS,
  SAMPLES,
  sanitizeConfig,
  validateRawInput,
  type DetectedFormat,
  type FindingReason,
  type InputFormat,
  type OutputFormat,
  type PlaceholderStyle,
  type SampleKind,
  type SanitizeOptions,
} from '../../lib/tools/config-sanitizer'

const INPUT_FORMAT_BUTTONS: Array<{ id: InputFormat; label: string }> = [
  { id: 'auto', label: '自動判定' },
  { id: 'env', label: '.env' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'log', label: 'ログ' },
]

const PLACEHOLDER_STYLE_BUTTONS: Array<{ id: PlaceholderStyle; label: string }> = [
  { id: 'redacted', label: '<REDACTED>' },
  { id: 'example', label: '.env.example' },
  { id: 'indexed', label: '<SECRET_1>' },
]

const OUTPUT_FORMAT_BUTTONS: Array<{ id: OutputFormat; label: string }> = [
  { id: 'same', label: '元の形式' },
  { id: 'env', label: '.env' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
]

const FORMAT_LABELS: Record<DetectedFormat, string> = {
  env: '.env',
  json: 'JSON',
  jsonl: 'JSONL',
  yaml: 'YAML',
  log: 'ログ',
}

function parseKeyListInput(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 100)
}

export default function ConfigSanitizer() {
  const [sourceText, setSourceText] = useState('')
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [selectedSample, setSelectedSample] = useState<SampleKind>('env')
  const [options, setOptions] = useState<SanitizeOptions>(DEFAULT_SANITIZE_OPTIONS)
  const [customKeysInput, setCustomKeysInput] = useState('')
  const [ignoreKeysInput, setIgnoreKeysInput] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const customSecretKeys = useMemo(
    () => parseKeyListInput(customKeysInput),
    [customKeysInput]
  )
  const ignoreKeys = useMemo(
    () => parseKeyListInput(ignoreKeysInput),
    [ignoreKeysInput]
  )

  const result = useMemo(() => {
    return sanitizeConfig(sourceText, {
      ...options,
      customSecretKeys,
      ignoreKeys,
    })
  }, [sourceText, options, customSecretKeys, ignoreKeys])

  const loadFile = async (file: File) => {
    setFileError(null)
    if (file.size > MAX_INPUT_BYTES) {
      setFileError(
        `ファイルサイズが上限（2MB）を超えています（${(
          file.size /
          (1024 * 1024)
        ).toFixed(2)} MB）。分割して読み込んでください。`
      )
      return
    }
    try {
      const text = await file.text()
      const err = validateRawInput(text)
      if (err) {
        setFileError(err)
        return
      }
      setSourceText(text)
      setSourceFileName(file.name)
    } catch {
      setFileError('ファイルの読み込みに失敗しました。UTF-8 テキストを指定してください。')
    }
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await loadFile(file)
  }

  const handleDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await loadFile(file)
  }

  const handleLoadSample = (kind: SampleKind = selectedSample) => {
    setFileError(null)
    const sample = SAMPLES[kind]
    setSourceText(sample.content)
    setSourceFileName(sample.filename)
    setOptions((prev) => ({
      ...prev,
      inputFormat: 'auto',
      outputFormat: 'same',
    }))
  }

  const handleClear = () => {
    setSourceText('')
    setSourceFileName(null)
    setFileError(null)
    setCustomKeysInput('')
    setIgnoreKeysInput('')
    setCopied(false)
  }

  const handleCopy = async () => {
    if (!result.output) return
    try {
      await navigator.clipboard.writeText(result.output)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API制限環境でも例外を送出しない
    }
  }

  const handleDownload = () => {
    if (!result.output) return
    const mime =
      result.effectiveOutputFormat === 'json'
        ? 'application/json;charset=utf-8'
        : 'text/plain;charset=utf-8'
    const blob = new Blob([result.output], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = buildSanitizedFilename(
      sourceFileName,
      result.effectiveOutputFormat
    )
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const activeError = fileError || result.error
  const lineCount = sourceText ? sourceText.split(/\r?\n/).length : 0
  const activeReasonEntries = (
    Object.entries(result.countsByReason) as Array<[FindingReason, number]>
  ).filter(([, count]) => count > 0)

  return (
    <div className="space-y-3.5">
      {/* 上部操作バー（1〜2行に集約） */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="入力形式の選択"
            className="flex flex-wrap items-center gap-1"
          >
            {INPUT_FORMAT_BUTTONS.map((btn) => {
              const active = options.inputFormat === btn.id
              return (
                <button
                  key={btn.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setOptions((prev) => ({ ...prev, inputFormat: btn.id }))
                  }
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? 'bg-sky-700 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {btn.label}
                </button>
              )
            })}
          </div>

          {sourceText.trim().length > 0 && (
            <span
              data-testid="config-detected-format"
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800"
            >
              <FileCode2 className="h-3 w-3" />
              判定: {FORMAT_LABELS[result.detectedFormat]}
              {result.usedJsoncFallback ? ' (JSONC)' : ''}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="サンプル種別"
            value={selectedSample}
            onChange={(e) => {
              const nextKind = e.target.value as SampleKind
              setSelectedSample(nextKind)
              if (sourceText.trim().length > 0) {
                handleLoadSample(nextKind)
              }
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none"
          >
            {(Object.keys(SAMPLES) as SampleKind[]).map((key) => (
              <option key={key} value={key}>
                {SAMPLES[key].label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleLoadSample(selectedSample)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
          >
            <Sparkles className="h-3.5 w-3.5" />
            サンプルを試す
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".env,.json,.jsonc,.jsonl,.yaml,.yml,.log,.txt,.conf,.ini"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5" />
            ファイル読込
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={!sourceText && !fileError && !customKeysInput && !ignoreKeysInput}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            クリア
          </button>
        </div>
      </div>

      {/* 2行目: 置換プレースホルダスタイル */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">
            置換スタイル:
          </span>
          <div
            role="group"
            aria-label="置換スタイル"
            className="flex flex-wrap items-center gap-1"
          >
            {PLACEHOLDER_STYLE_BUTTONS.map((btn) => {
              const active = options.placeholderStyle === btn.id
              return (
                <button
                  key={btn.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setOptions((prev) => ({
                      ...prev,
                      placeholderStyle: btn.id,
                    }))
                  }
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? 'bg-slate-800 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {btn.label}
                </button>
              )
            })}
          </div>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          常時サニタイズON・入力データは非保存
        </span>
      </div>

      {/* エラー・サイズ超過バナー（生の機密行は絶対に出さない） */}
      {activeError && (
        <div
          data-testid="config-error-banner"
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{activeError}</span>
          </div>
          {result.error && options.inputFormat !== 'log' && (
            <button
              type="button"
              onClick={() =>
                setOptions((prev) => ({ ...prev, inputFormat: 'log' }))
              }
              className="rounded-md bg-rose-700 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-800"
            >
              ログモードで強制サニタイズ
            </button>
          )}
        </div>
      )}

      {/* メイン2ペイン */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左ペイン: 入力（ファイルD&D兼用） */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="config-source-input"
              className="text-xs font-semibold text-slate-700"
            >
              設定ファイル・ログを貼付（ファイルを直接ドロップ可）
            </label>
            <span className="text-[11px] tabular-nums text-slate-500">
              {sourceFileName ? `${sourceFileName} / ` : ''}
              {sourceText.length.toLocaleString()}字・{lineCount.toLocaleString()}行
            </span>
          </div>
          <textarea
            id="config-source-input"
            rows={14}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            value={sourceText}
            onChange={(e) => {
              setFileError(null)
              setSourceText(e.target.value)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            placeholder=".env / JSON / JSONC / YAML（Kubernetesマニフェスト含む）/ サーバーログを貼り付けるか、ファイルをドロップしてください（最大2MB）..."
            className={`mt-1.5 w-full rounded-xl border p-3 font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none sm:text-[13px] ${
              isDragging
                ? 'border-sky-500 bg-sky-50/60 ring-2 ring-sky-200'
                : 'border-slate-300 bg-white'
            }`}
          />
        </div>

        {/* 右ペイン: サニタイズ済み出力 ＆ 相互変換 */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <label
                htmlFor="config-sanitized-output"
                className="text-xs font-semibold text-slate-700"
              >
                出力:
              </label>
              {result.canConvert ? (
                <div
                  role="group"
                  aria-label="出力形式"
                  className="flex flex-wrap items-center gap-1"
                >
                  {OUTPUT_FORMAT_BUTTONS.map((btn) => {
                    const active = options.outputFormat === btn.id
                    return (
                      <button
                        key={btn.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setOptions((prev) => ({
                            ...prev,
                            outputFormat: btn.id,
                          }))
                        }
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                          active
                            ? 'bg-sky-700 text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {btn.label}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  ログ形式のまま出力
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!result.output}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    コピー完了
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    コピー
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!result.output}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                保存
              </button>
            </div>
          </div>

          <textarea
            id="config-sanitized-output"
            rows={14}
            readOnly
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            value={result.output}
            placeholder="機密値をマスクした安全な設定ファイル・ログがここにリアルタイム出力されます..."
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-[13px]"
          />

          {result.warning && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800">
              注意: {result.warning}
            </p>
          )}
        </div>
      </div>

      {/* 1行監査サマリー ＋ 折りたたみ詳細検出テーブル（肩越し覗き見防止：生値は非出力） */}
      {sourceText.trim().length > 0 && !activeError && (
        <details className="group rounded-xl border border-slate-200 bg-slate-50/70">
          <summary
            data-testid="config-audit-summary"
            className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-800"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-emerald-800">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                マスク合計 {result.totalMasked}件
              </span>
              {activeReasonEntries.map(([reason, count]) => (
                <span
                  key={reason}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700"
                >
                  {REASON_LABELS[reason]}: {count}
                </span>
              ))}
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              検出内訳（伏せ字プレビュー）
              <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
            </span>
          </summary>

          <div className="border-t border-slate-200 bg-white p-3">
            {result.findings.length === 0 ? (
              <p className="text-xs text-slate-500">
                現在の設定ではマスク対象となる機密パターンは検出されませんでした。念のため目視確認のうえご利用ください。
              </p>
            ) : (
              <div className="max-h-60 overflow-auto">
                <table
                  data-testid="config-findings-table"
                  className="w-full border-collapse text-left text-xs"
                >
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                      <th className="py-1.5 pr-3 font-semibold">場所</th>
                      <th className="py-1.5 pr-3 font-semibold">検出理由</th>
                      <th className="py-1.5 pr-3 font-semibold">伏せ字プレビュー</th>
                      <th className="py-1.5 pr-3 font-semibold">置換後</th>
                      <th className="py-1.5 text-right font-semibold">件数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.findings.map((f) => (
                      <tr key={f.id}>
                        <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-800">
                          {f.location}
                        </td>
                        <td className="py-1.5 pr-3 text-[11px] text-slate-700">
                          {REASON_LABELS[f.reason]}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-500">
                          {f.maskedPreview}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11px] font-semibold text-sky-800">
                          {f.replacement}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-[11px] text-slate-600">
                          {f.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      )}

      {/* 詳細設定（初期折りたたみ・localStorage非保存） */}
      <details className="group rounded-xl border border-slate-200 bg-slate-50/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-800">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
            詳細検出ルール・除外キー・.env.example 設定
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-slate-200 bg-white p-3.5 text-xs text-slate-700">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={options.exampleEmptyValue}
                onChange={() =>
                  setOptions((prev) => ({
                    ...prev,
                    exampleEmptyValue: !prev.exampleEmptyValue,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <span>.env.example 時に空値（KEY=）で出力</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={options.maskEmails}
                onChange={() =>
                  setOptions((prev) => ({
                    ...prev,
                    maskEmails: !prev.maskEmails,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <span>メールアドレスをマスク</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={options.maskIpv4}
                onChange={() =>
                  setOptions((prev) => ({
                    ...prev,
                    maskIpv4: !prev.maskIpv4,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <span>IPv4アドレスをマスク（127.0.0.1除く）</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={options.maskHighEntropy}
                onChange={() =>
                  setOptions((prev) => ({
                    ...prev,
                    maskHighEntropy: !prev.maskHighEntropy,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <span>高エントロピー疑似ランダム文字列を検出</span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={options.protectPublicKeys}
                onChange={() =>
                  setOptions((prev) => ({
                    ...prev,
                    protectPublicKeys: !prev.protectPublicKeys,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              <span>公開設定キー保護（NODE_ENV / PORT 等）</span>
            </label>
          </div>

          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <div>
              <label
                htmlFor="config-custom-keys"
                className="block text-[11px] font-semibold text-slate-700"
              >
                追加で必ずマスクするキー名（カンマ・改行区切り）
              </label>
              <input
                id="config-custom-keys"
                type="text"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                value={customKeysInput}
                onChange={(e) => setCustomKeysInput(e.target.value)}
                placeholder="例: INTERNAL_TENANT_CODE, X_PARTNER_ID"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="config-ignore-keys"
                className="block text-[11px] font-semibold text-slate-700"
              >
                マスク除外するキー名（非機密ホワイトリスト）
              </label>
              <input
                id="config-ignore-keys"
                type="text"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                value={ignoreKeysInput}
                onChange={(e) => setIgnoreKeysInput(e.target.value)}
                placeholder="例: OAUTH_TOKEN_ENDPOINT, PUBLIC_TENANT_KEY"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
