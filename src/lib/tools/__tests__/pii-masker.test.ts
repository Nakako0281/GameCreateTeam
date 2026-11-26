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

    // 法人名と氏名が助詞「の」で分離され、それぞれ独立したトークンになること
    expect(res.maskedText).toContain('[ORG_1]の[PERSON_1]')
    expect(res.countsByCategory.organization).toBe(1)
    expect(res.countsByCategory.personName).toBe(1)
    expect(res.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          token: '[ORG_1]',
          original: '株式会社テスト工業',
          category: 'organization',
        }),
        expect.objectContaining({
          token: '[PERSON_1]',
          original: '山田花子様',
          category: 'personName',
        }),
      ])
    )
  })

  it('masks and fully restores the UI sample business text including [ORG_1] and [PERSON_1]', () => {
    const sampleText = [
      'お疲れ様です。株式会社サンプル商事の佐藤太郎様（sato.taro@example.co.jp / 090-1234-5678 / 〒100-0001）から、新サーバー 192.168.10.25 への接続エラーについて問い合わせがありました。',
      '顧客番号 1234-5678-9012 のログを確認したところ、以下のテスト用キーが出力されていたため原因を整理して回答文を作成してください。',
      'Authorization: Bearer test_bearer_token_sample_1234567890',
      'API_KEY=sk-proj-example1234567890abcdef',
    ].join('\n')

    const res = maskPiiText(sampleText, DEFAULT_MASK_OPTIONS)
    expect(res.maskedText).toContain('[ORG_1]の[PERSON_1]')
    expect(res.maskedText).toContain('[EMAIL_1]')
    expect(res.maskedText).toContain('[TEL_1]')
    expect(res.maskedText).toContain('[ZIP_1]')
    expect(res.maskedText).toContain('[IP_1]')
    expect(res.maskedText).toContain('[ID12_1]')
    expect(res.maskedText).toContain('[SECRET_1]')
    expect(res.maskedText).toContain('[SECRET_2]')

    const aiReply = `[ORG_1]の[PERSON_1]宛ての返信案です。\nご連絡先（[EMAIL_1] / [TEL_1]）および端末 [IP_1] での事象を確認いたしました。漏洩したキー（[SECRET_2]）は直ちに無効化してください。`
    const restored = restoreMaskedText(aiReply, res.entries)

    expect(restored.restoredCount).toBe(6)
    expect(restored.unresolvedTokens).toEqual([])
    expect(restored.restoredText).toContain('株式会社サンプル商事の佐藤太郎様宛て')
    expect(restored.restoredText).toContain('sato.taro@example.co.jp')
    expect(restored.restoredText).toContain('090-1234-5678')
    expect(restored.restoredText).toContain('192.168.10.25')
    expect(restored.restoredText).toContain('sk-proj-example1234567890abcdef')
    expect(restored.restoredText).not.toMatch(/\[[A-Z0-9]+_\d+\]/)
  })

  it('extracts prefix and suffix Japanese organization names accurately without swallowing particles or person names', () => {
    const sample = [
      '株式会社はてなの佐藤様と株式会社みずほ銀行の鈴木様に共有。',
      '株式会社さくらインターネットから連絡がありました。',
      '弊社とサンプル商事株式会社の契約、これはテスト工業株式会社です。',
      '取引先株式会社サンプル商事様御中、取引先のはてな株式会社から受領。',
    ].join('\n')

    const res = maskPiiText(sample, DEFAULT_MASK_OPTIONS)
    const orgOriginals = res.entries
      .filter((e) => e.category === 'organization')
      .map((e) => e.original)
    const personOriginals = res.entries
      .filter((e) => e.category === 'personName')
      .map((e) => e.original)

    expect(orgOriginals).toEqual([
      '株式会社はてな',
      '株式会社みずほ銀行',
      '株式会社さくらインターネット',
      'サンプル商事株式会社',
      'テスト工業株式会社',
      '株式会社サンプル商事',
      'はてな株式会社',
    ])
    expect(personOriginals).toEqual(['佐藤様', '鈴木様'])
  })

  it('detects person names after Japanese particles, with iteration mark 々, katakana middle dot, and role titles without crossing newlines', () => {
    const sample = [
      '担当は鈴木一郎さん、承認は佐々木 健一様、確認は山本部長と新井社長と前田部長です。',
      '森様、林 太郎様、博多様、健一様、ジョン・スミス様、マイケル・ミラーさんにも送信。',
      '報告\n佐藤様',
    ].join('\n')

    const res = maskPiiText(sample, DEFAULT_MASK_OPTIONS)
    const persons = res.entries
      .filter((e) => e.category === 'personName')
      .map((e) => e.original)

    expect(persons).toEqual([
      '鈴木一郎さん',
      '佐々木 健一様',
      '山本部長',
      '新井社長',
      '前田部長',
      '森様',
      '林 太郎様',
      '博多様',
      '健一様',
      'ジョン・スミス様',
      'マイケル・ミラーさん',
      '佐藤様',
    ])
    expect(res.maskedText).toContain('報告\n[PERSON_12]')
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

  it('does not mask generic stopwords, idioms, role-only titles, or generic org phrases', () => {
    const safeTexts = [
      'お疲れ様です。',
      'お客様へのご案内です。',
      'ご担当者様へ。',
      'ご苦労様でした。',
      'システム仕様や基本仕様を確認し、前回同様に処理します。多様な意見と花模様と本人氏名、様式、様子。',
      '営業部長、開発本部長、副社長、弊社社長、前社長、部長さんに確認。',
      '株式会社または有限会社について、株式会社の担当者',
    ]

    for (const txt of safeTexts) {
      const res = maskPiiText(txt, DEFAULT_MASK_OPTIONS)
      expect(res.maskedText, `Unexpected mask in: ${txt}`).toBe(txt)
      expect(res.totalReplacements, `Expected 0 replacements in: ${txt}`).toBe(0)
    }
  })

  it('restores full-width bracketed or markdown-escaped tokens and reports unresolved tokens', () => {
    const res = maskPiiText(
      '株式会社サンプル商事の佐藤太郎様へ連絡します。',
      DEFAULT_MASK_OPTIONS
    )

    const aiReplyWithVariants =
      '［ORG_1］の\\[PERSON\\_1\\]宛てにご案内します。未登録の [PERSON_9] も残ります。'
    const restored = restoreMaskedText(aiReplyWithVariants, res.entries)
    expect(restored.restoredCount).toBe(2)
    expect(restored.restoredText).toBe(
      '株式会社サンプル商事の佐藤太郎様宛てにご案内します。未登録の [PERSON_9] も残ります。'
    )
    expect(restored.unresolvedTokens).toEqual(['[PERSON_9]'])

    const emptyDictRestore = restoreMaskedText(
      '[ORG_1]の[PERSON_1]宛てです。',
      []
    )
    expect(emptyDictRestore.restoredCount).toBe(0)
    expect(emptyDictRestore.unresolvedTokens).toEqual(['[ORG_1]', '[PERSON_1]'])
  })

  it('preserves leading backslashes, avoids existing token collisions, and detects PKCS#8 keys and org connectors accurately', () => {
    const backslashInput = '\\sato@example.com と [EMAIL_1] と tanaka@example.jp'
    const res1 = maskPiiText(backslashInput, DEFAULT_MASK_OPTIONS)
    expect(res1.maskedText).toBe('\\[EMAIL_2] と [EMAIL_1] と [EMAIL_3]')
    const restored1 = restoreMaskedText(res1.maskedText, res1.entries)
    expect(restored1.restoredText).toBe(backslashInput)

    const edgeOrgAndPem =
      '有限会社あけぼの工務店と株式会社みずほリサーチ間の契約に -----BEGIN PRIVATE KEY-----\nMIIE_DUMMY\n-----END PRIVATE KEY----- を含める'
    const res2 = maskPiiText(edgeOrgAndPem, DEFAULT_MASK_OPTIONS)
    expect(res2.entries.map((e) => e.original)).toEqual([
      '有限会社あけぼの工務店',
      '株式会社みずほリサーチ',
      '-----BEGIN PRIVATE KEY-----\nMIIE_DUMMY\n-----END PRIVATE KEY-----',
    ])
    expect(restoreMaskedText(res2.maskedText, res2.entries).restoredText).toBe(
      edgeOrgAndPem
    )
  })
})
