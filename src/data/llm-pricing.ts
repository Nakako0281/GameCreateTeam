/**
 * 主要LLM APIの参考料金テーブル（USD / 100万トークンあたり）
 * PRICING_LAST_VERIFIED は scripts/audit-org-memory.mjs により45日以内の鮮度が機械チェックされます。
 */
export const PRICING_LAST_VERIFIED = '2026-11-21'

export interface LlmModelPrice {
  id: string
  provider: string
  name: string
  tier: 'flagship' | 'balanced' | 'economy'
  inputPerMillionUsd: number
  outputPerMillionUsd: number
  cachedInputPerMillionUsd: number
  supportsBatch50: boolean
  notes: string
}

export const LLM_MODELS: LlmModelPrice[] = [
  {
    id: 'gpt-4o-mini',
    provider: 'OpenAI',
    name: 'GPT-4o mini',
    tier: 'economy',
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    cachedInputPerMillionUsd: 0.075,
    supportsBatch50: true,
    notes: '軽量タスク・大量分類・定型要約向けの標準軽量モデル',
  },
  {
    id: 'gpt-4.1-nano',
    provider: 'OpenAI',
    name: 'GPT-4.1 nano',
    tier: 'economy',
    inputPerMillionUsd: 0.1,
    outputPerMillionUsd: 0.4,
    cachedInputPerMillionUsd: 0.025,
    supportsBatch50: true,
    notes: '超低単価・高速レスポンス用途の参考設定',
  },
  {
    id: 'gpt-4.1',
    provider: 'OpenAI',
    name: 'GPT-4.1',
    tier: 'flagship',
    inputPerMillionUsd: 2.0,
    outputPerMillionUsd: 8.0,
    cachedInputPerMillionUsd: 0.5,
    supportsBatch50: true,
    notes: '高精度コーディング・長文コンテキスト向け参考設定',
  },
  {
    id: 'gpt-4o',
    provider: 'OpenAI',
    name: 'GPT-4o',
    tier: 'flagship',
    inputPerMillionUsd: 2.5,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 1.25,
    supportsBatch50: true,
    notes: '汎用マルチモーダル標準モデルの参考設定',
  },
  {
    id: 'claude-3-5-haiku',
    provider: 'Anthropic',
    name: 'Claude Haiku (標準軽量帯)',
    tier: 'economy',
    inputPerMillionUsd: 0.8,
    outputPerMillionUsd: 4.0,
    cachedInputPerMillionUsd: 0.08,
    supportsBatch50: true,
    notes: '日本語の自然な文章生成と高速処理を両立する軽量帯参考設定',
  },
  {
    id: 'claude-sonnet-4',
    provider: 'Anthropic',
    name: 'Claude Sonnet (主力帯)',
    tier: 'balanced',
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
    cachedInputPerMillionUsd: 0.3,
    supportsBatch50: true,
    notes: '実務文書・プログラミング主力帯の参考設定（キャッシュ90%引き想定）',
  },
  {
    id: 'claude-opus-4',
    provider: 'Anthropic',
    name: 'Claude Opus (最上位帯)',
    tier: 'flagship',
    inputPerMillionUsd: 15.0,
    outputPerMillionUsd: 75.0,
    cachedInputPerMillionUsd: 1.5,
    supportsBatch50: true,
    notes: '高難度設計・複雑な推論タスク向け最上位帯参考設定',
  },
  {
    id: 'gemini-2-5-flash-lite',
    provider: 'Google',
    name: 'Gemini Flash-Lite (軽量帯)',
    tier: 'economy',
    inputPerMillionUsd: 0.1,
    outputPerMillionUsd: 0.4,
    cachedInputPerMillionUsd: 0.025,
    supportsBatch50: true,
    notes: '大量処理・低コストバッチ向けの参考設定',
  },
  {
    id: 'gemini-2-5-flash',
    provider: 'Google',
    name: 'Gemini Flash (標準バランス帯)',
    tier: 'balanced',
    inputPerMillionUsd: 0.3,
    outputPerMillionUsd: 2.5,
    cachedInputPerMillionUsd: 0.075,
    supportsBatch50: true,
    notes: '高コスパ・長文コンテキスト処理向けの参考設定',
  },
  {
    id: 'gemini-2-5-pro',
    provider: 'Google',
    name: 'Gemini Pro (上位推論帯)',
    tier: 'flagship',
    inputPerMillionUsd: 1.25,
    outputPerMillionUsd: 10.0,
    cachedInputPerMillionUsd: 0.3125,
    supportsBatch50: true,
    notes: '標準200k以内入力帯の参考設定（長大入力時は公式単価要確認）',
  },
  {
    id: 'deepseek-chat',
    provider: 'DeepSeek',
    name: 'DeepSeek Chat (V3参考帯)',
    tier: 'economy',
    inputPerMillionUsd: 0.27,
    outputPerMillionUsd: 1.1,
    cachedInputPerMillionUsd: 0.07,
    supportsBatch50: false,
    notes: '低単価APIの比較参考設定（機密データは利用規約と送信先に注意）',
  },
]
