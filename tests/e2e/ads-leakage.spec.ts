import { expect, test, type Page } from '@playwright/test'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const EXPECTED_ADSENSE_CLIENT = 'ca-pub-0000000000000000'
const EXPECTED_GA_ID = 'G-TEMOTOBOXTEST'

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'region1.google-analytics.com',
  'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'adservice.google.com',
])

const CANARY_SECRETS = [
  'canary-pii-9911@secret-corp.example',
  'secret-corp.example',
  'sk-proj-canary991122334455667788',
  '株式会社カナリア機密工業',
  '機密太郎',
  '090-9911-2233',
  'CANARY_LLM_PROMPT_CONFIDENTIAL_7744',
  'hanako@example.co.jp',
  'ichiro@example.co.jp',
  'misaki@example.co.jp',
  '佐藤 花子',
  'CANARY_MD_BOARD_MEMO_5533',
  'CANARY_MD_TRACKER_5533',
  'evil.example.invalid',
  'demo_api_key_sample_99112233',
  'p@ss#word123',
  'MIIEvQIBADANBgkqhkiG9w0',
  'SUPER_SECRET_CANARY_KEY',
  'canary_secret_token_8822991100',
  'CANARY_PDF_SECRET_CONFIDENTIAL_8811',
  'canary-pdf-8811@secret-corp.example',
  '090-8811-2233',
  'sk-proj-canarypdf88112233445566',
  'CanaryPdfAuthor_8811',
]

interface RecordedRequest {
  url: string
  hostname: string
  isExternal: boolean
  method: string
  headersSerialized: string
  postData: string
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function buildCanaryVariants(secrets: string[]): { secret: string; variant: string }[] {
  const variants: { secret: string; variant: string }[] = []
  for (const secret of secrets) {
    const rawSet = new Set<string>([
      secret,
      secret.toLowerCase(),
      encodeURIComponent(secret),
      encodeURIComponent(secret).toLowerCase(),
    ])
    if (/^[\x20-\x7e]+$/.test(secret) && secret.length >= 8) {
      const b64 = Buffer.from(secret, 'utf-8').toString('base64')
      const b64NoPad = b64.replace(/=+$/, '')
      rawSet.add(b64)
      rawSet.add(b64NoPad)
    }
    for (const v of rawSet) {
      if (v) variants.push({ secret, variant: v })
    }
  }
  return variants
}

function isExpectedBlockedResourceConsoleError(text: string, locationUrl: string): boolean {
  if (!/net::ERR_(?:BLOCKED_BY_CLIENT|FAILED)|Failed to load resource/i.test(text)) {
    return false
  }
  if (!locationUrl) return true
  try {
    const host = new URL(locationUrl).hostname
    return ALLOWED_EXTERNAL_HOSTS.has(host)
  } catch {
    return false
  }
}

async function setupAdSandbox(page: Page) {
  const requests: RecordedRequest[] = []
  const externalHosts = new Set<string>()
  const unexpectedConsoleErrors: string[] = []
  const pageErrors: string[] = []
  const dataLayerSnapshots: { route: string; serialized: string }[] = []

  page.on('pageerror', (err) => {
    pageErrors.push(err.message)
  })

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      const locUrl = msg.location()?.url || ''
      if (!isExpectedBlockedResourceConsoleError(text, locUrl)) {
        unexpectedConsoleErrors.push(`${text} (${locUrl || 'unknown'})`)
      }
    }
  })

  await page.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      await route.continue()
      return
    }

    const parsed = new URL(url)
    const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    const isExternal = !isLocal
    const headers = req.headers()

    requests.push({
      url,
      hostname: parsed.hostname,
      isExternal,
      method: req.method(),
      headersSerialized: JSON.stringify(headers),
      postData: req.postData() || '',
    })

    if (isExternal) {
      externalHosts.add(parsed.hostname)
      await route.abort('blockedbyclient')
      return
    }

    await route.continue()
  })

  const snapshotDataLayer = async (routePath: string) => {
    const serialized = await page.evaluate(() => {
      const dl = (window as unknown as { dataLayer?: unknown[] }).dataLayer || []
      try {
        return JSON.stringify(dl)
      } catch {
        return String(dl)
      }
    })
    dataLayerSnapshots.push({ route: routePath, serialized })
  }

  return {
    requests,
    externalHosts,
    unexpectedConsoleErrors,
    pageErrors,
    dataLayerSnapshots,
    snapshotDataLayer,
  }
}

test('proves zero input data leakage across all 7 tools even when AdSense and GA4 scripts are enabled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const sandbox = await setupAdSandbox(page)

  // 0. トップページで AdSense / GA4 スクリプト有効化および dataLayer 初期化を検証
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(
    page.locator(
      `script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${EXPECTED_ADSENSE_CLIENT}"]`
    )
  ).toHaveCount(1)
  await expect(
    page.locator(`script[src*="googletagmanager.com/gtag/js?id=${EXPECTED_GA_ID}"]`)
  ).toHaveCount(1)
  await sandbox.snapshotDataLayer('/')
  expect(sandbox.dataLayerSnapshots[0].serialized).toContain(EXPECTED_GA_ID)

  // 1. AI PII Masker
  await page.goto('/tools/ai-pii-masker/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'サンプル文を試す' }).click()
  await page
    .locator('#pii-source-textarea')
    .fill(
      '株式会社カナリア機密工業の機密太郎様 (canary-pii-9911@secret-corp.example / 090-9911-2233) API_KEY=sk-proj-canary991122334455667788'
    )
  const piiMasked = await page.locator('#pii-masked-textarea').inputValue()
  expect(piiMasked).toContain('[ORG_1]の[PERSON_1]')
  expect(piiMasked).toContain('[EMAIL_1]')
  expect(piiMasked).toContain('[TEL_1]')
  expect(piiMasked).toContain('[SECRET_1]')
  expect(piiMasked).not.toContain('canary-pii-9911@secret-corp.example')
  await sandbox.snapshotDataLayer('/tools/ai-pii-masker/')

  // 2. LLM Cost Calculator
  await page.goto('/tools/llm-cost-calculator/', { waitUntil: 'networkidle' })
  await page
    .locator('#llm-prompt-input')
    .fill('CANARY_LLM_PROMPT_CONFIDENTIAL_7744 システム要件定義プロンプト検証')
  const tokensText = await page.getByTestId('effective-input-tokens').textContent()
  expect(Number((tokensText || '0').replace(/,/g, ''))).toBeGreaterThan(10)
  await sandbox.snapshotDataLayer('/tools/llm-cost-calculator/')

  // 3. CSV Encoding Fixer
  await page.goto('/tools/csv-encoding-fixer/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Shift-JIS サンプルCSVを試す' }).click()
  await expect(page.getByText('佐藤 花子')).toBeVisible()
  await page.getByLabel('氏名の扱い').selectOption('mask')
  await expect(page.getByRole('cell', { name: '***' }).first()).toBeVisible()
  await sandbox.snapshotDataLayer('/tools/csv-encoding-fixer/')

  // 4. Image EXIF Cleaner
  await page.goto('/tools/image-exif-cleaner/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'GPS/EXIF入りサンプル画像で検証' }).click()
  const card = page.getByTestId('cleaned-image-card').first()
  await expect(card).toContainText('GPS位置情報IFD (0x8825)')
  await expect(card).toContainText('削除後再検査: 検出 0 件 (安全)')
  await sandbox.snapshotDataLayer('/tools/image-exif-cleaner/')

  // 5. AI Markdown Formatter（外部トラッカー画像も挿入して遮断証明）
  await page.goto('/tools/ai-markdown-formatter/', { waitUntil: 'networkidle' })
  await page
    .locator('#md-source-input')
    .fill(
      '# CANARY_MD_BOARD_MEMO_5533\n\n| 項目 | 値 |\n| :--- | :--- |\n| 区分 | 社外秘 |\n\n![leak](https://evil.example.invalid/pixel?token=CANARY_MD_TRACKER_5533)'
    )
  await expect(page.getByTestId('md-security-notice')).toContainText(
    '外部画像の自動読み込み（1件）'
  )
  const targetGroup = page.getByRole('group', { name: '出力先の選択' })
  await targetGroup.getByRole('button', { name: /Excel表抽出/ }).click()
  await targetGroup.getByRole('button', { name: 'Slack' }).click()
  await targetGroup.getByRole('button', { name: 'メール・平文' }).click()
  expect(await page.locator('#md-plain-output').inputValue()).toContain(
    'CANARY_MD_BOARD_MEMO_5533'
  )
  await sandbox.snapshotDataLayer('/tools/ai-markdown-formatter/')

  // 6. Config Sanitizer
  await page.goto('/tools/config-sanitizer/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'サンプルを試す' }).click()
  await page
    .locator('#config-source-input')
    .fill('NODE_ENV=production\nSUPER_SECRET_CANARY_KEY=canary_secret_token_8822991100')
  const configOut = await page.locator('#config-sanitized-output').inputValue()
  expect(configOut).toContain('SUPER_SECRET_CANARY_KEY="<REDACTED>"')
  expect(configOut).not.toContain('canary_secret_token_8822991100')
  const outputFormatGroup = page.getByRole('group', { name: '出力形式' })
  await outputFormatGroup.getByRole('button', { name: 'YAML' }).click()
  await outputFormatGroup.getByRole('button', { name: 'JSON' }).click()
  await sandbox.snapshotDataLayer('/tools/config-sanitizer/')

  // 7. PDF Redactor（カナリア文字列＋Authorメタデータ入りPDFを実アップロードして墨消し・再検査）
  const canaryPdfDoc = await PDFDocument.create()
  canaryPdfDoc.setTitle('CANARY_PDF_SECRET_CONFIDENTIAL_8811')
  canaryPdfDoc.setAuthor('CanaryPdfAuthor_8811')
  const pdfFont = await canaryPdfDoc.embedFont(StandardFonts.Helvetica)
  const pdfPage = canaryPdfDoc.addPage([595, 842])
  pdfPage.drawText(
    'Email: canary-pdf-8811@secret-corp.example Tel: 090-8811-2233 Key: sk-proj-canarypdf88112233445566',
    { x: 40, y: 740, size: 11, font: pdfFont, color: rgb(0, 0, 0) }
  )
  const canaryPdfBytes = await canaryPdfDoc.save()

  await page.goto('/tools/pdf-redactor/', { waitUntil: 'networkidle' })
  await page.getByTestId('pdf-file-input').setInputFiles({
    name: 'CANARY_PDF_SECRET_CONFIDENTIAL_8811.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(canaryPdfBytes),
  })
  await expect(page.getByTestId('pdf-before-summary')).toBeVisible()
  await page.getByRole('button', { name: /PII候補を一括黒塗り/ }).click()
  await page.getByTestId('generate-redacted-pdf-btn').click()
  await expect(page.getByTestId('pdf-redacted-result')).toBeVisible({ timeout: 20000 })
  await expect(page.getByTestId('pdf-after-text-chars')).toContainText('0 文字')
  await expect(page.getByTestId('pdf-after-metadata-count')).toContainText('0 件')
  await sandbox.snapshotDataLayer('/tools/pdf-redactor/')

  // 検証1: AdSense と GA4 の外部リクエスト試行が実際に発生・捕捉されていること
  expect(
    sandbox.externalHosts.has('pagead2.googlesyndication.com'),
    'Expected AdSense script request attempt to be captured'
  ).toBe(true)
  expect(
    sandbox.externalHosts.has('www.googletagmanager.com'),
    'Expected GA4 script request attempt to be captured'
  ).toBe(true)

  // 検証2: 許可された解析・広告ホスト以外（evil.example.invalid 等）への通信試行が 0 件であること
  for (const host of sandbox.externalHosts) {
    expect(
      ALLOWED_EXTERNAL_HOSTS.has(host),
      `Unexpected external host contacted: ${host}`
    ).toBe(true)
  }

  // 検証3: 全リクエスト（ローカル・外部）および window.dataLayer にカナリア入力値が一切漏洩していないこと
  const canaryVariants = buildCanaryVariants(CANARY_SECRETS)
  for (const req of sandbox.requests) {
    const decodedUrl = safeDecode(req.url)
    const haystack = [
      req.url,
      decodedUrl,
      req.headersSerialized,
      req.postData,
      safeDecode(req.postData),
    ].join('\n')

    for (const { secret, variant } of canaryVariants) {
      expect(
        haystack.includes(variant),
        `Canary secret "${secret}" (variant "${variant}") leaked in ${req.method} ${req.url}`
      ).toBe(false)
    }
  }

  for (const snap of sandbox.dataLayerSnapshots) {
    for (const { secret, variant } of canaryVariants) {
      expect(
        snap.serialized.includes(variant),
        `Canary secret "${secret}" leaked in window.dataLayer on ${snap.route}`
      ).toBe(false)
    }
  }

  // 検証4: 予期しないJSエラー・コンソールエラー0件
  expect(sandbox.pageErrors).toEqual([])
  expect(sandbox.unexpectedConsoleErrors).toEqual([])
})
