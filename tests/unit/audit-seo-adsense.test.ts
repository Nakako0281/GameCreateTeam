import { describe, expect, it } from 'vitest'
import { findUnqualifiedZeroSendClaims } from '../../scripts/audit-seo-adsense.mjs'

describe('audit-seo-adsense zero-send claim accuracy (Issue #53 / L-14)', () => {
  it('flags unconditional one-byte or unqualified zero-transmission claims', () => {
    const badSamples = [
      '入力テキストやファイルを 1 バイトもサーバーへ送信せず処理します。',
      'TemotoBox | ブラウザ完結・ゼロ送信 実務Webツール集',
      '2. ご自身の目で「外部通信ゼロ」を検証する3ステップ',
      'ブラウザ完結・外部送信なし',
      'サーバー送信ゼロで動作します。',
      '通信が発生しないため、社内ネットワークでも利用できます。',
      '外部通信が0件であることを確認できます。',
      '外部通信を行わないサイト設計です。',
    ]

    for (const sample of badSamples) {
      const hits = findUnqualifiedZeroSendClaims(sample)
      expect(hits.length, `Expected violation for: ${sample}`).toBeGreaterThan(0)
    }
  })

  it('allows input-scoped zero-send wording and legal/telecommunications terms', () => {
    const goodSamples = [
      'TemotoBox | 入力データ送信ゼロのブラウザ完結・実務ワークベンチ',
      'ブラウザ完結・入力データ送信なし',
      '入力データの外部送信は一切発生せず、そのまま持ち帰れます。',
      '処理を実行してもツール由来のAPI通信（POST送信等）が一切発生しないことを確認できます。',
      '電気通信事業法「外部送信規律」に基づく公表事項（Google Analytics 4 / Google AdSense）',
      '入力内容を含む外部送信は発生しません。',
      '入力ファイルの内容が外部へ送信されることなく変換できます。',
    ]

    for (const sample of goodSamples) {
      const hits = findUnqualifiedZeroSendClaims(sample)
      expect(hits, `Unexpected violation for: ${sample}`).toEqual([])
    }
  })
})
