import { test, expect } from '@playwright/test'

test.describe('プラットフォーム＆ゲーム画面 モバイルE2E検証', () => {
  test('ホーム画面からゲームへ遷移し、コンソールエラーや画面はみ出しがないこと', async ({
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

    // 最初のゲームカードをクリックして遷移
    const firstCard = page.locator('a[href^="/games/"]').first()
    await expect(firstCard).toBeVisible()
    await firstCard.click()

    await expect(page).toHaveURL(/\/games\/.+/)

    // 共通ヘッダーの「ホーム」リンクが表示されていること
    await expect(page.getByRole('link', { name: 'ホーム' })).toBeVisible()

    // 遊び方モーダルの開閉確認
    const helpBtn = page.getByTitle('遊び方・紹介')
    await helpBtn.click()
    await expect(
      page.getByRole('button', { name: 'ゲームに戻る' })
    ).toBeVisible()
    await page.getByRole('button', { name: 'ゲームに戻る' }).click()

    // リスタートボタンの動作確認
    const restartBtn = page.getByTitle('リスタート')
    await restartBtn.click()

    // スマホ横幅（390px）からはみ出して横スクロールが発生していないこと
    const hasHorizontalOverflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      )
    })
    expect(hasHorizontalOverflow).toBe(false)

    // コンソールエラー・ページエラーが0件であること
    expect(errors).toEqual([])
  })
})
