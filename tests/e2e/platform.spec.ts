import { test, expect } from '@playwright/test'

test.describe('プラットフォーム＆ゲーム画面 モバイルE2E検証', () => {
  test('ホーム画面からキャンディ・ポップ・リバーシへ遷移し、実際に対局操作・モード切替・待ったがエラーなく動くこと', async ({
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
    await expect(page.locator('h1')).toContainText('AI Game Lab')

    // キャンディ・ポップ・リバーシのカードをクリックして遷移
    const gameCard = page.locator('a[href="/games/candy-pop-reversi"]')
    await expect(gameCard).toBeVisible()
    await gameCard.click()

    await expect(page).toHaveURL(/\/games\/candy-pop-reversi/)
    await expect(page.getByRole('link', { name: 'ホーム' })).toBeVisible()

    // 2人対戦モードに切り替えて1手目を指し、「待った」が機能するか確認
    await page.getByRole('button', { name: '👥2人' }).click()
    const moveCell = page.getByRole('button', { name: '行3列4' })
    await expect(moveCell).toBeEnabled()
    await moveCell.click()

    // 「待った」ボタンが有効になり、押すと初期状態に戻ること
    const undoBtn = page.getByRole('button', { name: '待った' })
    await expect(undoBtn).toBeEnabled()
    await undoBtn.click()
    await expect(undoBtn).toBeDisabled()

    // クラシックモード切替とガイドON/OFF切替がエラーなく動作すること
    await page.getByRole('button', { name: '👑 クラシック' }).click()
    await page.getByRole('button', { name: /ガイド/ }).click()

    // 遊び方モーダルの開閉確認
    const helpBtn = page.getByTitle('遊び方・紹介')
    await helpBtn.click()
    await expect(
      page.getByRole('button', { name: 'ゲームに戻る' })
    ).toBeVisible()
    await page.getByRole('button', { name: 'ゲームに戻る' }).click()

    // スマホ縦画面（390x844）で横スクロールや縦スクロールのはみ出しが発生していないこと
    const hasOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth ||
        document.documentElement.scrollHeight >
          document.documentElement.clientHeight
      )
    })
    expect(hasOverflow).toBe(false)

    // コンソールエラー・ページエラーが0件であること
    expect(errors).toEqual([])
  })
})
