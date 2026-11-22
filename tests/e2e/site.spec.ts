import { expect, test, type Page } from '@playwright/test'

const ALL_ROUTES = [
  '/',
  '/about/',
  '/privacy/',
  '/terms/',
  '/contact/',
  '/tools/ai-pii-masker/',
  '/tools/llm-cost-calculator/',
  '/tools/csv-encoding-fixer/',
  '/tools/image-exif-cleaner/',
  '/tools/ai-markdown-formatter/',
  '/tools/config-sanitizer/',
]

function trackRuntimeAndNetwork(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const externalRequests: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })
  page.on('pageerror', (err) => {
    pageErrors.push(err.message)
  })
  page.on('request', (req) => {
    const url = req.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    const parsed = new URL(url)
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      externalRequests.push(url)
    }
  })

  return { consoleErrors, pageErrors, externalRequests }
}

for (const vp of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`renders all pages cleanly without errors, horizontal overflow, or mid-word heading splits (${vp.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    const tracker = trackRuntimeAndNetwork(page)

    for (const route of ALL_ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' })
      const h1Count = await page.locator('h1').count()
      expect(h1Count).toBe(1)

      const overflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
        )
      })
      expect(overflow, `Horizontal overflow on ${route} (${vp.name})`).toBeLessThanOrEqual(1)

      // Issue #43: ビルド時自動バージョン表示とメタ情報の検証
      const metaVersion = await page
        .locator('meta[name="app-version"]')
        .getAttribute('content')
      expect(metaVersion, `Missing/invalid app-version meta on ${route}`).toMatch(
        /^v\d+\.\d+\.\d+\+[0-9a-z]+$/i
      )
      const footerVersion = page.getByTestId('app-version')
      await expect(footerVersion).toBeVisible()
      await expect(footerVersion).toHaveText(/^v\d+\.\d+\.\d+ \([0-9a-z]+\)$/i)

      // Issue #46: h1 内フレーズおよびカタカナ/英数字単語が途中で折り返されないことを物理座標で検証
      const typographyResult = await page.evaluate(() => {
        const h1 = document.querySelector('h1')
        if (!h1) return { phraseCount: 0, violations: ['h1 missing'] }

        const countLines = (range: Range) => {
          const rects = Array.from(range.getClientRects()).filter(
            (r) => r.width > 0.5 && r.height > 0.5
          )
          const lineBuckets = new Set(rects.map((r) => Math.round(r.top / 6)))
          return lineBuckets.size
        }

        const violations: string[] = []
        const phrases = Array.from(h1.querySelectorAll('.heading-phrase'))
        for (const el of phrases) {
          const range = document.createRange()
          range.selectNodeContents(el)
          const lines = countLines(range)
          if (lines !== 1) {
            violations.push(`Phrase wrapped across ${lines} lines: "${el.textContent}"`)
          }
        }

        const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT)
        let node: Node | null
        while ((node = walker.nextNode())) {
          const text = node.textContent || ''
          const wordRegex = /[ァ-ヶー]{2,}|[A-Za-z0-9]{2,}/g
          for (const match of text.matchAll(wordRegex)) {
            if (match.index === undefined) continue
            const range = document.createRange()
            range.setStart(node, match.index)
            range.setEnd(node, match.index + match[0].length)
            const lines = countLines(range)
            if (lines !== 1) {
              violations.push(`Word split across ${lines} lines: "${match[0]}"`)
            }
          }
        }

        return { phraseCount: phrases.length, violations }
      })

      expect(
        typographyResult.phraseCount,
        `Expected h1 .heading-phrase elements on ${route} (${vp.name})`
      ).toBeGreaterThan(0)
      expect(
        typographyResult.violations,
        `Heading word/phrase wrap violations on ${route} (${vp.name})`
      ).toEqual([])
    }

    // Issue #41: /contact/ の主要導線がユーザー用フィードバックテンプレート専用であることを検証
    await page.goto('/contact/', { waitUntil: 'networkidle' })
    const feedbackCta = page.getByRole('link', { name: /不具合報告フォームを開く/ })
    await expect(feedbackCta).toBeVisible()
    const feedbackHref = await feedbackCta.getAttribute('href')
    expect(feedbackHref).toContain('template=user_feedback.md')

    expect(tracker.consoleErrors).toEqual([])
    expect(tracker.pageErrors).toEqual([])
    expect(tracker.externalRequests).toEqual([])
  })
}

test('proves zero external transmission across interactive execution of all 6 published tools', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const tracker = trackRuntimeAndNetwork(page)

  // 1. AI PII Masker
  await page.goto('/tools/ai-pii-masker/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'サンプル文を試す' }).click()
  const maskedVal = await page.locator('#pii-masked-textarea').inputValue()
  expect(maskedVal).toContain('[ORG_1]の[PERSON_1]')
  expect(maskedVal).toContain('[EMAIL_1]')
  expect(maskedVal).toContain('[TEL_1]')
  expect(maskedVal).toContain('[ZIP_1]')
  expect(maskedVal).toContain('[IP_1]')
  expect(maskedVal).toContain('[ID12_1]')
  expect(maskedVal).toContain('[SECRET_1]')
  expect(maskedVal).toContain('[SECRET_2]')
  expect(maskedVal).not.toContain('株式会社サンプル商事')
  expect(maskedVal).not.toContain('佐藤太郎様')
  expect(maskedVal).not.toContain('sato.taro@example.co.jp')
  expect(maskedVal).not.toContain('090-1234-5678')
  expect(maskedVal).not.toContain('sk-proj-example1234567890abcdef')

  const restoredVal = await page.locator('#ai-restored-output').inputValue()
  expect(restoredVal).toContain('株式会社サンプル商事の佐藤太郎様宛て')
  expect(restoredVal).toContain('sato.taro@example.co.jp')
  expect(restoredVal).toContain('090-1234-5678')
  expect(restoredVal).toContain('192.168.10.25')
  expect(restoredVal).toContain('sk-proj-example1234567890abcdef')
  expect(restoredVal).not.toMatch(/\[[A-Z0-9]+_\d+\]/)
  await expect(page.getByTestId('pii-unresolved-warning')).toHaveCount(0)

  // 2. LLM Cost Calculator
  await page.goto('/tools/llm-cost-calculator/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '英語コードレビュー' }).click()
  await page.locator('#monthly-requests').fill('5000')
  await page.getByLabel('Batch API（50%割引・対応モデル）').check()
  await expect(page.getByText('Batch 50%OFF').first()).toBeVisible()
  const costTable = page.locator('table')
  await expect(costTable.getByText('GPT-6.2 Sol', { exact: true })).toBeVisible()
  await expect(costTable.getByText('Claude Sonnet 5.5', { exact: true })).toBeVisible()
  await expect(costTable.getByText('Gemini 4 Argon', { exact: true })).toBeVisible()
  await expect(costTable.getByText('DeepSeek-V4.1-Flash', { exact: true })).toBeVisible()

  const filterGroup = page.getByRole('group', { name: 'プロバイダ絞り込み' })
  await filterGroup.getByRole('button', { name: 'Google' }).click()
  await expect(costTable.getByText('Gemini 4 Argon', { exact: true })).toBeVisible()
  await expect(costTable.getByText('GPT-6.2 Sol', { exact: true })).toHaveCount(0)
  await filterGroup.getByRole('button', { name: 'すべて' }).click()
  await expect(costTable.getByText('GPT-6.2 Sol', { exact: true })).toBeVisible()

  const tokensText = await page.getByTestId('effective-input-tokens').textContent()
  expect(Number((tokensText || '0').replace(/,/g, ''))).toBeGreaterThan(20)

  // 3. CSV Encoding Fixer
  await page.goto('/tools/csv-encoding-fixer/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Shift-JIS サンプルCSVを試す' }).click()
  await expect(page.getByTestId('csv-detected-encoding')).toContainText('SJIS')
  await expect(page.getByText('佐藤 花子')).toBeVisible()
  await page.getByLabel('氏名の扱い').selectOption('mask')
  await expect(page.getByRole('cell', { name: '***' }).first()).toBeVisible()

  // 4. Image EXIF Cleaner
  await page.goto('/tools/image-exif-cleaner/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'GPS/EXIF入りサンプル画像で検証' }).click()
  const card = page.getByTestId('cleaned-image-card').first()
  await expect(card).toBeVisible()
  await expect(card).toContainText('GPS位置情報IFD (0x8825)')
  await expect(card).toContainText('削除後再検査: 検出 0 件 (安全)')

  // 5. AI Markdown Formatter
  await page.goto('/tools/ai-markdown-formatter/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'サンプルを試す' }).click()
  const wordPreview = page.getByTestId('md-word-preview')
  await expect(wordPreview).toContainText('四半期業務改善レポート案')
  await expect(wordPreview).toContainText('営業企画')
  await expect(wordPreview).toContainText('# このコードブロック内の # や ** や | は変換されません')

  const mdInput = page.locator('#md-source-input')
  const sampleVal = await mdInput.inputValue()
  await mdInput.fill(
    `${sampleVal}\n\n![tracker](https://example.invalid/pixel.png)\n[xss](javascript:alert(1))`
  )
  const securityNotice = page.getByTestId('md-security-notice')
  await expect(securityNotice).toBeVisible()
  await expect(securityNotice).toContainText('外部画像の自動読み込み（1件）')
  await expect(securityNotice).toContainText('安全でないリンクスキーム（1件）')
  await expect(wordPreview.locator('img')).toHaveCount(0)

  const targetGroup = page.getByRole('group', { name: '出力先の選択' })
  await targetGroup.getByRole('button', { name: /Excel表抽出/ }).click()
  const tableCard = page.getByTestId('extracted-table-card').first()
  await expect(tableCard).toBeVisible()
  await expect(tableCard).toContainText('営業企画')
  await expect(tableCard).toContainText('00124')

  await targetGroup.getByRole('button', { name: 'Slack' }).click()
  const slackVal = await page.locator('#md-slack-output').inputValue()
  expect(slackVal).toContain('*高い効果*')
  expect(slackVal).toContain('<https://example.com/docs/guide?section=2|公式ガイドライン>')
  expect(slackVal).not.toContain('utm_source')

  await targetGroup.getByRole('button', { name: 'メール・平文' }).click()
  const plainVal = await page.locator('#md-plain-output').inputValue()
  expect(plainVal).toContain('■ 四半期業務改善レポート案')
  expect(plainVal).toContain('status=**ok**')
  expect(plainVal).not.toContain('**高い効果**')

  // 6. Config Sanitizer
  await page.goto('/tools/config-sanitizer/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'サンプルを試す' }).click()
  const sanitizerOut = page.locator('#config-sanitized-output')
  const envSanitized = await sanitizerOut.inputValue()
  expect(envSanitized).toContain('NODE_ENV=production')
  expect(envSanitized).toContain(
    'TEMPLATE_DSN=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/app'
  )
  expect(envSanitized).toContain('export API_KEY="<REDACTED>"')
  expect(envSanitized).not.toContain('demo_api_key_sample_99112233')
  expect(envSanitized).not.toContain('p@ss#word123')
  expect(envSanitized).not.toContain('MIIEvQIBADANBgkqhkiG9w0')

  const auditSummary = page.getByTestId('config-audit-summary')
  await expect(auditSummary).toBeVisible()
  await expect(auditSummary).toContainText('マスク合計')
  await auditSummary.click()
  const findingsTable = page.getByTestId('config-findings-table')
  await expect(findingsTable).toBeVisible()
  const findingsText = (await findingsTable.textContent()) || ''
  expect(findingsText).not.toContain('demo_api_key_sample_99112233')
  expect(findingsText).not.toContain('p@ss#word123')

  const styleGroup = page.getByRole('group', { name: '置換スタイル' })
  await styleGroup.getByRole('button', { name: '.env.example' }).click()
  expect(await sanitizerOut.inputValue()).toContain('JWT_SECRET=YOUR_JWT_SECRET')

  const outputFormatGroup = page.getByRole('group', { name: '出力形式' })
  await outputFormatGroup.getByRole('button', { name: 'YAML' }).click()
  expect(await sanitizerOut.inputValue()).toContain('JWT_SECRET: YOUR_JWT_SECRET')

  await outputFormatGroup.getByRole('button', { name: 'JSON' }).click()
  const convertedJson = JSON.parse(await sanitizerOut.inputValue()) as Record<string, string>
  expect(convertedJson.NODE_ENV).toBe('production')
  expect(convertedJson.JWT_SECRET).toBe('YOUR_JWT_SECRET')

  await styleGroup.getByRole('button', { name: '<REDACTED>' }).click()
  await page.getByLabel('サンプル種別').selectOption('yaml')
  const yamlSanitized = await sanitizerOut.inputValue()
  expect(yamlSanitized).toContain('app.conf: <REDACTED>')
  expect(yamlSanitized).not.toContain('---\n---')
  expect(yamlSanitized).not.toContain('YXBpX2tleT1kZW1vX3NlY3JldF92YWx1ZV8yMDI2Cg==')
  expect(yamlSanitized).not.toContain('c2FtcGxlX2s4c190b2tlbl8yMDI2')

  // 全ツール実操作中、外部送信が0件であることを確認
  expect(tracker.consoleErrors).toEqual([])
  expect(tracker.pageErrors).toEqual([])
  expect(tracker.externalRequests).toEqual([])
})
