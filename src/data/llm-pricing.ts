/**
 * 主要LLM APIの参考料金テーブル（USD / 100万トークンあたり）
 * PRICING_LAST_VERIFIED は scripts/audit-org-memory.mjs --time-sensitive（日次監査および本ファイル変更PRのCI）で
 * 14日以内の鮮度と priceEffectiveUntil が強制チェックされます。
 * 本ファイルを更新する際は、検証日・確認した公式URL・確認者（AIセッション）をコミットまたはPR本文に明記してください。
 */
export const PRICING_LAST_VERIFIED = '2026-11-22'
export const MAX_PRICING_AGE_DAYS = 14
export const DEFAULT_USD_TO_JPY = 159

export const OFFICIAL_PRICING_SOURCES = {
  OpenAI: 'https://platform.openai.com/docs/pricing',
  Anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing',
  Google: 'https://ai.google.dev/gemini-api/docs/pricing',
  DeepSeek: 'https://api-docs.deepseek.com/quick_start/pricing',
} as const

export type LlmProvider = keyof typeof OFFICIAL_PRICING_SOURCES

export interface ScheduledModelPrice {
  effectiveFrom: string
  inputPerMillionUsd: number
  outputPerMillionUsd: number
  cachedInputPerMillionUsd: number
  notes: string
}

export interface LlmModelPrice {
  id: string
  provider: LlmProvider
  name: string
  tier: 'flagship' | 'balanced' | 'economy'
  releasedAt: string
  inputPerMillionUsd: number
  outputPerMillionUsd: number
  cachedInputPerMillionUsd: number
  supportsBatch50: boolean
  priceEffectiveUntil?: string
  scheduledPricing?: ScheduledModelPrice
  sourceUrl: string
  notes: string
}

export const LLM_MODELS: LlmModelPrice[] = [
  {
    id: 'gpt-6-luna',
    provider: 'OpenAI',
    name: 'GPT-6 Luna',
    tier: 'economy',
    releasedAt: '2026-09',
    inputPerMillionUsd: 0.1,
    outputPerMillionUsd: 0.5,
    cachedInputPerMillionUsd: 0.01,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.OpenAI,
    notes: '大量抽出・分類・定型処理向けのOpenAI軽量低単価モデル',
  },
  {
    id: 'gpt-6-1-terra',
    provider: 'OpenAI',
    name: 'GPT-6.1 Terra',
    tier: 'balanced',
    releasedAt: '2026-10',
    inputPerMillionUsd: 1.0,
    outputPerMillionUsd: 5.0,
    cachedInputPerMillionUsd: 0.05,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.OpenAI,
    notes: '標準業務ワークフロー・コストと精度の均衡をとる中核モデル',
  },
  {
    id: 'gpt-6-2-sol',
    provider: 'OpenAI',
    name: 'GPT-6.2 Sol',
    tier: 'balanced',
    releasedAt: '2026-11',
    inputPerMillionUsd: 2.0,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 0.1,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.OpenAI,
    notes: '日常開発・コーディング・自律エージェントの主力モデル（272K超長文で単価加算）',
  },
  {
    id: 'gpt-6-2-astra',
    provider: 'OpenAI',
    name: 'GPT-6.2 Astra',
    tier: 'flagship',
    releasedAt: '2026-11',
    inputPerMillionUsd: 8.0,
    outputPerMillionUsd: 40.0,
    cachedInputPerMillionUsd: 0.4,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.OpenAI,
    notes: '高難度設計・複雑推論向けのOpenAI最上位フラッグシップ',
  },
  {
    id: 'claude-haiku-5-5',
    provider: 'Anthropic',
    name: 'Claude Haiku 5.5',
    tier: 'economy',
    releasedAt: '2026-10',
    inputPerMillionUsd: 0.1,
    outputPerMillionUsd: 0.5,
    cachedInputPerMillionUsd: 0.01,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.Anthropic,
    notes: '100K以下入力時の単価（100K超の長文は入力$0.50/出力$2.50）。高速・高コスパ',
  },
  {
    id: 'claude-sonnet-5-5',
    provider: 'Anthropic',
    name: 'Claude Sonnet 5.5',
    tier: 'balanced',
    releasedAt: '2026-10',
    inputPerMillionUsd: 2.0,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 0.1,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.Anthropic,
    notes: '日本語実務文書・コード生成の主力帯（キャッシュ読込95%割引）',
  },
  {
    id: 'claude-opus-5-5',
    provider: 'Anthropic',
    name: 'Claude Opus 5.5',
    tier: 'flagship',
    releasedAt: '2026-10',
    inputPerMillionUsd: 4.0,
    outputPerMillionUsd: 20.0,
    cachedInputPerMillionUsd: 0.2,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.Anthropic,
    notes: '長期自律エージェント・複雑コードベース設計向けの上位推論帯',
  },
  {
    id: 'claude-fable-5-2',
    provider: 'Anthropic',
    name: 'Claude Fable 5.2',
    tier: 'flagship',
    releasedAt: '2026-11',
    inputPerMillionUsd: 8.0,
    outputPerMillionUsd: 40.0,
    cachedInputPerMillionUsd: 0.2,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.Anthropic,
    notes: '最先端の深い推論・研究用途向けAnthropic最上位モデル（キャッシュ読込97.5%引）',
  },
  {
    id: 'gemini-3-5-flash-lite',
    provider: 'Google',
    name: 'Gemini 3.5 Flash-Lite',
    tier: 'economy',
    releasedAt: '2026-08',
    inputPerMillionUsd: 0.3,
    outputPerMillionUsd: 2.5,
    cachedInputPerMillionUsd: 0.03,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.Google,
    notes: '大量バッチ分類・低レイテンシ処理向けの軽量Geminiモデル',
  },
  {
    id: 'gemini-3-8-flash',
    provider: 'Google',
    name: 'Gemini 3.8 Flash',
    tier: 'balanced',
    releasedAt: '2026-10',
    inputPerMillionUsd: 0.75,
    outputPerMillionUsd: 3.75,
    cachedInputPerMillionUsd: 0.075,
    supportsBatch50: true,
    priceEffectiveUntil: '2026-12-31',
    scheduledPricing: {
      effectiveFrom: '2027-01-01',
      inputPerMillionUsd: 1.5,
      outputPerMillionUsd: 7.5,
      cachedInputPerMillionUsd: 0.15,
      notes: '2027/1/1改定後の標準単価（思考トークン含む・キャッシュ90%引）',
    },
    sourceUrl: OFFICIAL_PRICING_SOURCES.Google,
    notes: '2026/12/31まで導入価格（2027/1/1から$1.50/$7.50へ自動切替・思考トークン含む）',
  },
  {
    id: 'gemini-4-hydrogen',
    provider: 'Google',
    name: 'Gemini 4 Hydrogen',
    tier: 'balanced',
    releasedAt: '2026-11',
    inputPerMillionUsd: 1.5,
    outputPerMillionUsd: 7.5,
    cachedInputPerMillionUsd: 0.075,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.Google,
    notes: 'Gemini 4高速実務帯・暗黙キャッシュ95%引対応（思考トークン含む）',
  },
  {
    id: 'gemini-4-argon',
    provider: 'Google',
    name: 'Gemini 4 Argon',
    tier: 'flagship',
    releasedAt: '2026-11',
    inputPerMillionUsd: 2.0,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 0.1,
    supportsBatch50: true,
    priceEffectiveUntil: '2026-11-30',
    scheduledPricing: {
      effectiveFrom: '2026-12-01',
      inputPerMillionUsd: 4.0,
      outputPerMillionUsd: 20.0,
      cachedInputPerMillionUsd: 0.2,
      notes: '2026/12/1改定後の標準単価（思考トークン含む・暗黙キャッシュ95%引）',
    },
    sourceUrl: OFFICIAL_PRICING_SOURCES.Google,
    notes: '2026/11/30まで導入価格（12/1から$4.00/$20.00へ自動切替・思考トークン含む）',
  },
  {
    id: 'gemini-4-neon',
    provider: 'Google',
    name: 'Gemini 4 Neon',
    tier: 'flagship',
    releasedAt: '2026-11',
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
    cachedInputPerMillionUsd: 0.15,
    supportsBatch50: true,
    sourceUrl: OFFICIAL_PRICING_SOURCES.Google,
    notes: 'Gemini 4上位推論・バランス主力帯・暗黙キャッシュ95%引（思考トークン含む）',
  },
  {
    id: 'deepseek-flash',
    provider: 'DeepSeek',
    name: 'DeepSeek-V4.1-Flash',
    tier: 'economy',
    releasedAt: '2026-10',
    inputPerMillionUsd: 0.3,
    outputPerMillionUsd: 1.2,
    cachedInputPerMillionUsd: 0.006,
    supportsBatch50: false,
    sourceUrl: OFFICIAL_PRICING_SOURCES.DeepSeek,
    notes: 'Peak単価基準（Off-Peak時間帯は半額 $0.15/$0.60・自動キャッシュ対応）',
  },
  {
    id: 'deepseek-v4-pro',
    provider: 'DeepSeek',
    name: 'DeepSeek-V4-Pro',
    tier: 'balanced',
    releasedAt: '2026-08',
    inputPerMillionUsd: 1.32,
    outputPerMillionUsd: 3.96,
    cachedInputPerMillionUsd: 0.044,
    supportsBatch50: false,
    sourceUrl: OFFICIAL_PRICING_SOURCES.DeepSeek,
    notes: 'Peak単価基準（Off-Peak時間帯は半額 $0.66/$1.98・機密データは送信先規約に注意）',
  },
]
