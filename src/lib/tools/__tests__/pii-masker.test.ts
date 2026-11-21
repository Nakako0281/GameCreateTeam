import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MASK_OPTIONS,
  maskPiiText,
  passesLuhnCheck,
  restoreMaskedText,
} from '../pii-masker'

describe('pii-masker', () => {
  it('detects and deterministically masks emails, phones, postal codes, IPv4, API keys, and org/person names', () => {
    const input = [
      '株式会社テスト工業の山田花子様（yamada@test.co.jp / 03-1234-5678 / 〒100-0005）より連絡。',
      '再送先も yamada@test.co.jp、接続元は 10.20.30.40、キーは sk-proj-abcdefghijklmnopqrstuvwxyz123456 です。',
    ].join('\n')

    const res = maskPiiText(input, DEFAULT_MASK_OPTIONS)

    expect(res.maskedText).not.toContain('yamada@test.co.jp')
    expect(res.maskedText).not.toContain('03-1234-5678')
    expect(res.maskedText).not.toContain('100-0005')
    expect(res.maskedText).not.toContain('10.20.30.40')
    expect(res.maskedText).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456')
    expect(res.maskedText).not.toContain('株式会社テスト工業')
    expect(res.maskedText).not.toContain('山田花子様')

    // 同一メールは同じトークンにマップされること
    const emailTokens = res.maskedText.match(/\[EMAIL_\d+\]/g)
    expect(emailTokens).toEqual(['[EMAIL_1]', '[EMAIL_1]'])
    expect(res.countsByCategory.email).toBe(2)
    expect(res.totalReplacements).toBeGreaterThanOrEqual(7)
  })

  it('validates credit card candidates with Luhn check and avoids false positives on arbitrary 16-digit ids', () => {
    // 4111111111111111 passes Luhn; 4111111111111112 fails Luhn
    expect(passesLuhnCheck('4111111111111111')).toBe(true)
    expect(passesLuhnCheck('4111111111111112')).toBe(false)

    const res = maskPiiText(
      'カード: 4111-1111-1111-1111 と 伝票番号: 4111-1111-1111-1112',
      { ...DEFAULT_MASK_OPTIONS, myNumber: false }
    )
    expect(res.maskedText).toContain('[CARD_1]')
    expect(res.maskedText).toContain('4111-1111-1111-1112')
  })

  it('masks custom terms cleanly and restores AI outputs without nested re-replacement', () => {
    const res = maskPiiText(
      '極秘プロジェクトApolloの担当者（sato@corp.example）に連絡してください。',
      {
        ...DEFAULT_MASK_OPTIONS,
        customTerms: ['極秘プロジェクトApollo'],
      }
    )
    expect(res.maskedText).toContain('[CUSTOM_1]')
    expect(res.maskedText).toContain('[EMAIL_1]')

    const aiReply =
      '[CUSTOM_1]の件、[EMAIL_1]宛てに承知しました。再度 [CUSTOM_1] を確認します。'
    const restored = restoreMaskedText(aiReply, res.entries)
    expect(restored.restoredCount).toBe(3)
    expect(restored.restoredText).toBe(
      '極秘プロジェクトApolloの件、sato@corp.example宛てに承知しました。再度 極秘プロジェクトApollo を確認します。'
    )
  })

  it('does not mask generic stopwords like お客様', () => {
    const res = maskPiiText('お客様へのご案内です。', DEFAULT_MASK_OPTIONS)
    expect(res.maskedText).toBe('お客様へのご案内です。')
    expect(res.totalReplacements).toBe(0)
  })
})
