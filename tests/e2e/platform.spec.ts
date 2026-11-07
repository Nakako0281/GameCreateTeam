import { test, expect } from '@playwright/test'

test.describe('プラットフォーム＆全5ゲーム モバイルE2E検証', () => {
  test('トップ画面にモックが存在せず、実ゲーム5本が表示されること', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('注文の多すぎる違法建築ハンバーガー')).toBeVisible()
    await expect(page.getByText('深夜3時の黒歴史ポエム防衛')).toBeVisible()
    await expect(page.getByText('17:59 定時退社パリィ！')).toBeVisible()
    await expect(page.getByText('緊急謝罪会見！ギリギリお辞儀チャレンジ')).toBeVisible()
    await expect(page.getByText('キャンディ・ポップ・リバーシ')).toBeVisible()
    await expect(page.locator('a[href="/games/sample-01"]')).toHaveCount(0)
  })

  test('第5弾：注文の多すぎる違法建築ハンバーガーで具材落下＆上バンズ納品利確・レシートリザルト・Xシェアが動作すること', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/games/ihou-kenchiku-burger')
    await page.getByRole('button', { name: /違法建築クッキング開始/ }).click()

    const dropBtn = page.getByRole('button', { name: /具材を落とす/ })
    await expect(dropBtn).toBeEnabled()
    await dropBtn.click()

    const deliverBtn = page.getByRole('button', { name: /上バンズ納品/ })
    await expect(deliverBtn).toBeEnabled()
    await deliverBtn.click()

    await expect(page.getByText('違法建築ダイナー お会計票')).toBeVisible()
    await expect(page.getByRole('button', { name: /𝕏 で結果をシェア/ })).toBeVisible()

    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth ||
        document.documentElement.scrollHeight > document.documentElement.clientHeight
    )
    expect(hasOverflow).toBe(false)
    expect(errors).toEqual([])
  })

  test('第4弾：深夜3時の黒歴史ポエム防衛で仕分け・流出カルテリザルト・Xシェアが動作すること', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/games/midnight-poem-defense')
    await page.getByRole('button', { name: /深夜3時のスマホ防衛開始/ }).click()

    // 1枚目の黒歴史ポエムをあえて誤送信して流出トーク画面リザルトを確認
    const sendBtn = page.getByRole('button', { name: /そのまま送信/ })
    await expect(sendBtn).toBeEnabled()
    await sendBtn.click()

    await expect(page.getByText(/流出トーク画面 兼 黒歴史カルテ/)).toBeVisible()
    await expect(page.getByRole('button', { name: /𝕏 で結果をシェア/ })).toBeVisible()

    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth ||
        document.documentElement.scrollHeight > document.documentElement.clientHeight
    )
    expect(hasOverflow).toBe(false)
    expect(errors).toEqual([])
  })

  test('第3弾：17:59 定時退社パリィ！でパリィ＆タイムカードリザルト・Xシェアが動作すること', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/games/teiji-taisha-parry')
    await page.getByRole('button', { name: /17:59 退勤バトル開始/ }).click()

    const bowBtn = page.getByRole('button', { name: /お辞儀スルー/ })
    await expect(bowBtn).toBeEnabled()

    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth ||
        document.documentElement.scrollHeight > document.documentElement.clientHeight
    )
    expect(hasOverflow).toBe(false)
    expect(errors).toEqual([])
  })

  test('第2弾：緊急謝罪会見！ギリギリお辞儀チャレンジがエラーなく動作すること', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/games/shazai-angle-challenge')
    const startBtn = page.getByRole('button', { name: /長押しでお辞儀スタート/ })
    await expect(startBtn).toBeVisible()
    await startBtn.dispatchEvent('pointerdown')

    const releaseBtn = page.getByRole('button', { name: /指を離してブレーキ/ })
    await expect(releaseBtn).toBeVisible()
    await releaseBtn.dispatchEvent('pointerup')

    await expect(page.getByText('AI Game Lab スクープ日報')).toBeVisible({ timeout: 5000 })
    expect(errors).toEqual([])
  })
})
