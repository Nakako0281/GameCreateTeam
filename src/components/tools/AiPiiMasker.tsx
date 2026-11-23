import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  DEFAULT_MASK_OPTIONS,
  maskPiiText,
  restoreMaskedText,
  type MaskOptions,
  type PiiCategory,
} from '../../lib/tools/pii-masker'

const STORAGE_KEY_CUSTOM_TERMS = 'temotobox.ai-pii-masker.custom-terms.v1'
const LEGACY_STORAGE_KEY_CUSTOM_TERMS = 'localbox.ai-pii-masker.custom-terms.v1'

const SAMPLE_BUSINESS_TEXT = `お疲れ様です。株式会社サンプル商事の佐藤太郎様（sato.taro@example.co.jp / 090-1234-5678 / 〒100-0001）から、新サーバー 192.168.10.25 への接続エラーについて問い合わせがありました。
顧客番号 1234-5678-9012 のログを確認したところ、以下のテスト用キーが出力されていたため原因を整理して回答文を作成してください。
Authorization: Bearer test_bearer_token_sample_1234567890
API_KEY=sk-proj-example1234567890abcdef`

const CATEGORY_LABELS: { key: keyof Omit<MaskOptions, 'customTerms'>; label: string }[] = [
  { key: 'apiKey', label: 'APIキー・秘密鍵' },
  { key: 'email', label: 'メールアドレス' },
  { key: 'phone', label: '電話番号' },
  { key: 'creditCard', label: 'カード番号' },
  { key: 'myNumber', label: '12桁番号' },
  { key: 'postalCode', label: '郵便番号' },
  { key: 'ipv4', label: 'IPv4アドレス' },
  { key: 'organization', label: '法人名' },
  { key: 'personName', label: '氏名＋敬称' },
]

const CATEGORY_BADGE_NAME: Record<PiiCategory, string> = {
  apiKey: '秘密情報',
  email: 'メール',
  phone: '電話',
  postalCode: '郵便番号',
  ipv4: 'IP',
  creditCard: 'カード',
  myNumber: '12桁ID',
  organization: '法人名',
  personName: '氏名',
  custom: 'カスタム',
}

export default function AiPiiMasker() {
  const [sourceText, setSourceText] = useState('')
  const [aiResponseText, setAiResponseText] = useState('')
  const [options, setOptions] = useState<MaskOptions>(DEFAULT_MASK_OPTIONS)
  const [customTermsInput, setCustomTermsInput] = useState('')
  const [rememberCustomTerms, setRememberCustomTerms] = useState(false)
  const [copiedKey, setCopiedKey] = useState<'masked' | 'restored' | null>(null)

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem(STORAGE_KEY_CUSTOM_TERMS) ??
        window.localStorage.getItem(LEGACY_STORAGE_KEY_CUSTOM_TERMS)
      if (saved) {
        setCustomTermsInput(saved)
        setRememberCustomTerms(true)
      }
    } catch {
      // localStorage無効環境では無視
    }
  }, [])

  useEffect(() => {
    try {
      if (rememberCustomTerms) {
        window.localStorage.setItem(STORAGE_KEY_CUSTOM_TERMS, customTermsInput)
      } else {
        window.localStorage.removeItem(STORAGE_KEY_CUSTOM_TERMS)
        window.localStorage.removeItem(LEGACY_STORAGE_KEY_CUSTOM_TERMS)
      }
    } catch {
      // ignore storage errors
    }
  }, [rememberCustomTerms, customTermsInput])

  const parsedCustomTerms = useMemo(
    () =>
      customTermsInput
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2),
    [customTermsInput]
  )

  const maskResult = useMemo(() => {
    return maskPiiText(sourceText, {
      ...options,
      customTerms: parsedCustomTerms,
    })
  }, [sourceText, options, parsedCustomTerms])

  const restoreResult = useMemo(() => {
    return restoreMaskedText(aiResponseText, maskResult.entries)
  }, [aiResponseText, maskResult.entries])

  const activeCategoryCount = useMemo(
    () => CATEGORY_LABELS.filter((item) => options[item.key]).length,
    [options]
  )

  const toggleOption = (key: keyof Omit<MaskOptions, 'customTerms'>) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleCopy = async (value: string, target: 'masked' | 'restored') => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(target)
      window.setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // クリップボードAPI不可環境でもエラーを投げない
    }
  }

  const handleLoadSample = () => {
    setSourceText(SAMPLE_BUSINESS_TEXT)
    setAiResponseText(
      `[ORG_1]の[PERSON_1]宛ての返信案です。\nご連絡先（[EMAIL_1] / [TEL_1]）および端末 [IP_1] での事象を確認いたしました。漏洩したキー（[SECRET_2]）は直ちに無効化してください。`
    )
  }

  const handleClearAll = () => {
    setSourceText('')
    setAiResponseText('')
  }

  return (
    <div className="space-y-5">
      {/* コンパクトアクションバー */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <span
          data-testid="pii-replacement-count"
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tabular-nums text-slate-700"
        >
          <KeyRound className="h-3.5 w-3.5 text-sky-700" />
          置換 {maskResult.totalReplacements} 箇所 / 辞書 {maskResult.entries.length} 件
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            サンプル文を試す
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            すべて消去
          </button>
        </div>
      </div>

      {/* Step 1: 元の文章 ⇔ マスク済み */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label
            htmlFor="pii-source-textarea"
            className="block text-xs font-bold text-slate-800"
          >
            1. 元の文章を貼り付け
          </label>
          <textarea
            id="pii-source-textarea"
            rows={7}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="社外秘メール、問い合わせ文、エラーログなどを貼り付けてください..."
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="pii-masked-textarea"
              className="text-xs font-bold text-slate-800"
            >
              2. AI貼り付け用（マスク済み）
            </label>
            <button
              type="button"
              onClick={() => handleCopy(maskResult.maskedText, 'masked')}
              disabled={!maskResult.maskedText}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {copiedKey === 'masked' ? (
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
          </div>
          <textarea
            id="pii-masked-textarea"
            rows={7}
            readOnly
            value={maskResult.maskedText}
            placeholder="ここに [EMAIL_1] や [TEL_1] へ置換された文章が表示されます..."
            className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 font-mono text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <div
            data-testid="pii-manual-review-notice"
            role="note"
            className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-950"
          >
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <span>
              自動検出には漏れの可能性があります（敬称のない個人名や社内固有の案件名など）。AIへ送信する前にマスク結果を目視で確認し、漏れがあれば下の「カスタム語設定」へ追加してください。
            </span>
          </div>
        </div>
      </div>

      {/* 置換辞書チップ一覧（置換がある時のみ展開表示、0件時は控えめな1行） */}
      {maskResult.entries.length === 0 ? (
        <p className="text-xs text-slate-500">
          テキストを入力すると検出された項目と仮名トークンの対応表が表示されます。
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {maskResult.entries.map((entry) => (
              <div
                key={entry.token}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono font-bold text-sky-800">{entry.token}</span>
                  <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                    {CATEGORY_BADGE_NAME[entry.category]}
                  </span>
                  <p className="mt-0.5 truncate font-mono text-slate-600" title={entry.original}>
                    {entry.original}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                  x{entry.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 検出対象・カスタム語設定（折りたたみ） */}
      <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-sky-700" />
            検出カテゴリ（{activeCategoryCount}/{CATEGORY_LABELS.length}）・カスタム語設定
            {parsedCustomTerms.length > 0 && `（登録 ${parsedCustomTerms.length} 件）`}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-slate-200 bg-white p-4 rounded-b-xl">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_LABELS.map((item) => {
              const active = options[item.key]
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleOption(item.key)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label
                htmlFor="custom-terms-input"
                className="block text-xs font-semibold text-slate-700"
              >
                独自に隠したい固有名詞（カンマまたは改行区切り・2文字以上）
              </label>
              <input
                id="custom-terms-input"
                type="text"
                value={customTermsInput}
                onChange={(e) => setCustomTermsInput(e.target.value)}
                placeholder="例: プロジェクトX, 取引先A社"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={rememberCustomTerms}
                onChange={(e) => setRememberCustomTerms(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600"
              />
              ブラウザに記憶
            </label>
          </div>
        </div>
      </details>

      {/* Step 2: AIの回答復元 */}
      <div className="border-t border-slate-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-900">
              3. AIの回答を復元
            </h2>
          </div>
          <span className="text-xs font-semibold tabular-nums text-emerald-800">
            復元箇所: {restoreResult.restoredCount} 件
          </span>
        </div>

        {restoreResult.unresolvedTokens.length > 0 && (
          <div
            data-testid="pii-unresolved-warning"
            role="status"
            className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              未復元トークン: {restoreResult.unresolvedTokens.join(', ')}（元の文章の置換辞書に一致する項目がありません）
            </span>
          </div>
        )}

        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <label
              htmlFor="ai-response-input"
              className="block text-xs font-semibold text-slate-700"
            >
              AIの回答を貼り付け
            </label>
            <textarea
              id="ai-response-input"
              rows={5}
              value={aiResponseText}
              onChange={(e) => setAiResponseText(e.target.value)}
              placeholder="[EMAIL_1] や [PERSON_1] を含むAIの返答を貼り付け..."
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ai-restored-output"
                className="text-xs font-semibold text-slate-700"
              >
                復元済みテキスト
              </label>
              <button
                type="button"
                onClick={() => handleCopy(restoreResult.restoredText, 'restored')}
                disabled={!restoreResult.restoredText}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {copiedKey === 'restored' ? (
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
            </div>
            <textarea
              id="ai-restored-output"
              rows={5}
              readOnly
              value={restoreResult.restoredText}
              placeholder="トークンが元の文字列へ自動復元されます..."
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
