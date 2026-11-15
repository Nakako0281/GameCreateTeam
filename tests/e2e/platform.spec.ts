import { test, expect } from '@playwright/test'

test.describe('プラットフォーム モバイルE2E検証', () => {
  test('トップ画面に新体制のゲーム（ダイス・フォージ・ダンジョン）のみが表示され、過去作品やモックが存在しないこと', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await expect(
      page.getByText('ダイス・フォージ・ダンジョン：魔導刻印と運命の塔')
    ).toBeVisible()
    await expect(page.getByText('1 GAMES')).toBeVisible()

    // 旧体制の過去6作品およびモックが存在しないことを確認
    await expect(page.locator('a[href="/games/sample-01"]')).toHaveCount(0)
    await expect(page.locator('a[href="/games/slice-5050"]')).toHaveCount(0)
    await expect(
      page.locator('a[href="/games/ihou-kenchiku-burger"]')
    ).toHaveCount(0)
    await expect(
      page.locator('a[href="/games/midnight-poem-defense"]')
    ).toHaveCount(0)
    await expect(
      page.locator('a[href="/games/teiji-taisha-parry"]')
    ).toHaveCount(0)
    await expect(
      page.locator('a[href="/games/shazai-angle-challenge"]')
    ).toHaveCount(0)
    await expect(
      page.locator('a[href="/games/candy-pop-reversi"]')
    ).toHaveCount(0)

    // トップ画面のカードからゲーム画面へ遷移できることを確認
    await page.locator('a[href="/games/dice-forge-dungeon"]').first().click()
    await expect(page.getByTestId('dice-forge-title-screen')).toBeVisible()
    expect(errors).toEqual([])
  })
})
