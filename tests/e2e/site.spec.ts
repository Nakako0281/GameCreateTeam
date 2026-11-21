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
  test(`renders all pages cleanly without errors or horizontal overflow (${vp.name})`, async ({
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
    }

    expect(tracker.consoleErrors).toEqual([])
    expect(tracker.pageErrors).toEqual([])
    expect(tracker.externalRequests).toEqual([])
  })
}

test('proves zero external transmission across interactive execution of all 4 Wave 1 tools', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const tracker = trackRuntimeAndNetwork(page)

  // 1. AI PII Masker
  await page.goto('/tools/ai-pii-masker/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'サンプル文を試す' }).click()
  const maskedVal = await page.locator('#pii-masked-textarea').inputValue()
  expect(maskedVal).toContain('[EMAIL_1]')
  expect(maskedVal).not.toContain('tanaka.taro@example.co.jp')
  const restoredVal = await page.locator('#ai-restored-output').inputValue()
  expect(restoredVal).toContain('tanaka.taro@example.co.jp')
  expect(restoredVal).toContain('株式会社サンプル商事')

  // 2. LLM Cost Calculator
  await page.goto('/tools/llm-cost-calculator/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '英語コードレビュー' }).click()
  await page.locator('#monthly-requests').fill('5000')
  await page
    .getByLabel('Batch API（非同期50%割引・対応モデルのみ）を適用')
    .check()
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

  // 全ツール実操作中、外部送信が0件であることを確認
  expect(tracker.consoleErrors).toEqual([])
  expect(tracker.pageErrors).toEqual([])
  expect(tracker.externalRequests).toEqual([])
})
