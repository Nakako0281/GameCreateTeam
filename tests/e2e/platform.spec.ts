import { test, expect } from '@playwright/test'

test.describe('プラットフォーム＆ゲーム画面 モバイルE2E検証', () => {
  test('緊急謝罪会見！ギリギリお辞儀チャレンジへ遷移し、お辞儀操作・号外新聞リザルト・Xシェアボタンがエラーなく表示されること', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      errors.push(err.message)
    })

    await page.goto('/')
    const gameCard = page.locator('a[href="/games/shazai-angle-challenge"]')
    await expect(gameCard).toBeVisible()
    await gameCard.click()

    await expect(page).toHaveURL(/\/games\/shazai-angle-challenge/)
    await expect(page.getByText('LIVE 緊急謝罪会見')).toBeVisible()

    // 長押しお辞儀ボタンを押し始めてから指を離し、放送事故号外リザルトを出す
    const startBtn = page.getByRole('button', { name: /長押しでお辞儀スタート/ })
    await expect(startBtn).toBeVisible()
    await startBtn.dispatchEvent('pointerdown')

    const releaseBtn = page.getByRole('button', { name: /指を離してブレーキ/ })
    await expect(releaseBtn).toBeVisible()
    await releaseBtn.dispatchEvent('pointerup')

    // 号外リザルトとXシェアボタンが表示されること
    await expect(page.getByText('AI Game Lab スクープ日報')).toBeVisible({
      timeout: 5000,
    })
    await expect(
      page.getByRole('link', { name: /𝕏 で会見結果をシェアする/ })
    ).toBeVisible()

    // 「別の不祥事で再会見！」ボタンで即リトライできること
    await page
      .getByRole('button', { name: /別の不祥事で再会見/ })
      .click()
    await expect(
      page.getByRole('button', { name: /長押しでお辞儀スタート/ })
    ).toBeVisible()

    // スマホ縦画面（390x844）で縦横スクロールのはみ出しがないこと
    const hasOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth ||
        document.documentElement.scrollHeight >
          document.documentElement.clientHeight
      )
    })
    expect(hasOverflow).toBe(false)
    expect(errors).toEqual([])
  })

  test('キャンディ・ポップ・リバーシへ遷移し、対局操作・モード切替・待ったがエラーなく動くこと', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    page.on('pageerror', (err) => {
      errors.push(err.message)
    })

    await page.goto('/games/candy-pop-reversi')
    await expect(page.getByRole('link', { name: 'ホーム' })).toBeVisible()

    await page.getByRole('button', { name: '👥2人' }).click()
    const moveCell = page.getByRole('button', { name: '行3列4' })
    await expect(moveCell).toBeEnabled()
    await moveCell.click()

    const undoBtn = page.getByRole('button', { name: '待った' })
    await expect(undoBtn).toBeEnabled()
    await undoBtn.click()
    await expect(undoBtn).toBeDisabled()

    expect(errors).toEqual([])
  })
})
