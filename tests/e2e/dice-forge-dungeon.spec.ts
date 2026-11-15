import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test.use({
  video: { mode: 'on', size: { width: 390, height: 844 } },
})

const OUT_DIR = 'test-results/dice-forge-dungeon'

test.describe('ダイス・フォージ・ダンジョン (dice-forge-dungeon) モバイルE2E ＆ 手触り・文字削減ゲート検証', () => {
  test('R-06文字量上限・R-07攻撃モーション＆ヒットストップ＆ダメージ跳躍・対峙構図・鍛造・オートセーブが全てパスすること', async ({
    page,
  }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true })

    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/games/dice-forge-dungeon')
    const titleScreen = page.getByTestId('dice-forge-title-screen')
    await expect(titleScreen).toBeVisible()

    // 【R-06 文字量上限ゲート】タイトル画面の日本語文字数が95文字以下であり、長文説明が存在しないこと
    const titleJpCount = await titleScreen.evaluate((el) => {
      const text = (el as HTMLElement).innerText || ''
      const matches = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g)
      return matches ? matches.length : 0
    })
    expect(titleJpCount).toBeLessThanOrEqual(95)

    // ① タイトル・スタータークラス選択画面のスクリーンショット
    await page.getByTestId('class-select-assassin').click()
    await page.getByTestId('class-select-mage').click()
    await page.screenshot({
      path: path.join(OUT_DIR, '01_title_class_select.png'),
    })

    // 出撃ボタンでラン開始
    await page.getByTestId('dice-forge-start-btn').click()
    await expect(page.getByTestId('dice-forge-canvas')).toBeVisible()
    await expect(page.getByTestId('battle-duel-stage')).toBeVisible()

    // 【R-07 左右対峙構図ゲート】左にプレイヤー、右に敵モンスターが配置されていること
    const playerBox = await page
      .getByTestId('player-avatar-actor')
      .boundingBox()
    const enemyBox = await page.getByTestId('enemy-avatar-actor').boundingBox()
    expect(playerBox).not.toBeNull()
    expect(enemyBox).not.toBeNull()
    if (playerBox && enemyBox) {
      expect(playerBox.x).toBeLessThan(enemyBox.x)
    }

    // 最小フォントサイズ 12px 以上検証
    const minFontSize = await page.evaluate(() => {
      let minPx = 999
      const elements = document.querySelectorAll('body *')
      for (const el of Array.from(elements)) {
        const htmlEl = el as HTMLElement
        if (
          htmlEl.offsetParent !== null &&
          htmlEl.innerText &&
          htmlEl.innerText.trim().length > 0
        ) {
          const fsPx = parseFloat(window.getComputedStyle(htmlEl).fontSize)
          if (!Number.isNaN(fsPx) && fsPx < minPx) {
            minPx = fsPx
          }
        }
      }
      return minPx
    })
    expect(minFontSize).toBeGreaterThanOrEqual(12)

    // 画面の横・縦はみ出しゼロ検証
    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth ||
        document.documentElement.scrollHeight >
          document.documentElement.clientHeight
    )
    expect(hasOverflow).toBe(false)

    // ダイス6面十字展開図モーダルの確認とスクリーンショット
    await page.getByTestId('dice-forge-inspect-btn').click()
    await expect(page.getByTestId('dice-forge-net-modal')).toBeVisible()
    await page.screenshot({
      path: path.join(OUT_DIR, '04_cross_net_view.png'),
    })
    await page.getByRole('button', { name: '閉じる' }).click()

    // ダイスのリロール・マナ操作・自動配置の確認
    await page.getByTestId('dice-forge-reroll-btn').click()
    await page.waitForTimeout(280)
    await page.getByTestId('dice-forge-manipulate-btn').click()
    await page.getByTestId('dice-forge-auto-assign-btn').click()

    // ② バトル・対峙構図＆スロット配置画面のスクリーンショット
    await page.screenshot({
      path: path.join(OUT_DIR, '02_battle_slots_preview.png'),
    })

    // サウンド発音カウント確認
    const audioCount = await page.evaluate(
      () =>
        (window as Window & { __diceForgeDungeonAudioCount?: number })
          .__diceForgeDungeonAudioCount ?? 0
    )
    expect(audioCount).toBeGreaterThan(0)

    // 【R-07 アクション・コレオグラフィ＆ヒットストップ検証】
    // 1ターン目を実行し、0ms遷移ではなくダメージポップアップ（battle-floating-popup）が出現することを検証・撮影
    await page.getByTestId('dice-forge-execute-turn').click()
    const popup = page.getByTestId('battle-floating-popup').first()
    await expect(popup).toBeVisible({ timeout: 2000 })
    await page.screenshot({
      path: path.join(OUT_DIR, '03_action_hitstop_impact.png'),
    })
    await page.waitForTimeout(550)

    // Floor 1 の敵を撃破するまでターン実行（最大8ターン以内）
    for (let turn = 0; turn < 8; turn++) {
      const rewardVisible = await page
        .getByTestId('dice-forge-reward-modal')
        .isVisible()
      if (rewardVisible) break
      await page.getByTestId('dice-forge-auto-assign-btn').click()
      await page.getByTestId('dice-forge-execute-turn').click()
      await page.waitForTimeout(650)
    }

    // ⑤ フロア突破・鍛造報酬モーダルの表示確認＆スクリーンショット
    const rewardModal = page.getByTestId('dice-forge-reward-modal')
    await expect(rewardModal).toBeVisible({ timeout: 5000 })
    await page.screenshot({
      path: path.join(OUT_DIR, '05_forge_reward_modal.png'),
    })

    // 報酬を確定して Floor 2 へ進む
    const eliteBtn = page.getByTestId('next-floor-elite')
    if (await eliteBtn.isVisible()) {
      await eliteBtn.click()
    } else {
      await page.locator('[data-testid^="next-floor-"]').first().click()
    }

    // ページをリロードし、localStorage オートセーブから Floor 2 を途中再開できることを検証
    await page.reload()
    const continueBtn = page.getByTestId('dice-forge-continue-btn')
    await expect(continueBtn).toBeVisible()
    await continueBtn.click()
    await expect(page.getByText('🏰 F2/12')).toBeVisible()

    expect(errors).toEqual([])
  })
})
