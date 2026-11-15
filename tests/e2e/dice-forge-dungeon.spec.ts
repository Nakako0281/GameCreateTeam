import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test.use({
  video: { mode: 'on', size: { width: 390, height: 844 } },
})

const OUT_DIR = 'test-results/dice-forge-dungeon'

test.describe('ダイス・フォージ・ダンジョン (dice-forge-dungeon) モバイルE2E ＆ R-09絵文字ゼロ・R-10直感ダイレクト戦闘検証', () => {
  test('R-09絵文字完全禁止・R-10説明ゼロ超低文字量＆ダイレクト武器攻撃・Canvas戦場・鍛造・オートセーブが全てパスすること', async ({
    page,
  }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true })

    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    const assertZeroEmojiAndZeroSentenceOnPage = async () => {
      const result = await page.evaluate(() => {
        const text = document.body.innerText || ''
        const hasEmoji =
          /[\p{Extended_Pictographic}\u2600-\u26FF\u2700-\u27BF]/u.test(text)
        const hasLongSentence = text.includes('。')
        return { hasEmoji, hasLongSentence }
      })
      expect(result.hasEmoji).toBe(false)
      expect(result.hasLongSentence).toBe(false)
    }

    await page.goto('/games/dice-forge-dungeon')
    const titleScreen = page.getByTestId('dice-forge-title-screen')
    await expect(titleScreen).toBeVisible()

    // 【R-09 絵文字完全禁止 ＆ R-10 説明文ゼロゲート】
    await assertZeroEmojiAndZeroSentenceOnPage()

    // 【R-10 説明ゼロ直感UIゲート】タイトル画面の日本語文字数が20文字以下（クラス名＋ボタンのみ）であること
    const titleJpCount = await titleScreen.evaluate((el) => {
      const text = (el as HTMLElement).innerText || ''
      const matches = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g)
      return matches ? matches.length : 0
    })
    expect(titleJpCount).toBeLessThanOrEqual(20)

    // ① タイトル・スタータークラス選択画面のスクリーンショット
    await page.getByTestId('class-select-assassin').click()
    await page.getByTestId('class-select-mage').click()
    await page.screenshot({
      path: path.join(OUT_DIR, '01_title_class_select.png'),
    })

    // 出撃ボタンでラン開始
    await page.getByTestId('dice-forge-start-btn').click()
    const battleViewport = page.getByTestId('dice-forge-canvas')
    await expect(battleViewport).toBeVisible()
    await expect(page.getByTestId('battle-duel-stage')).toBeVisible()
    await expect(page.getByText('STAGE 1/12')).toBeVisible()
    await expect(page.getByText('Lv.1', { exact: true })).toBeVisible()

    // 【R-09 & R-10 バトル画面の絵文字ゼロ＆説明文ゼロ＆超コンパクト文字量検証】
    await assertZeroEmojiAndZeroSentenceOnPage()
    const battleJpCount = await battleViewport.evaluate((el) => {
      const text = (el as HTMLElement).innerText || ''
      const matches = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g)
      return matches ? matches.length : 0
    })
    expect(battleJpCount).toBeLessThanOrEqual(50)

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

    // ステータスモーダルの確認とスクリーンショット（絵文字ゼロ・句点ゼロ）
    await page.getByTestId('dice-forge-inspect-btn').click()
    await expect(page.getByTestId('dice-forge-net-modal')).toBeVisible()
    await assertZeroEmojiAndZeroSentenceOnPage()
    await page.screenshot({
      path: path.join(OUT_DIR, '04_cross_net_view.png'),
    })
    await page.getByRole('button', { name: '閉じる' }).click()

    // ダイスのリロール・マナ操作確認
    await page.getByTestId('dice-forge-reroll-btn').click()
    await page.waitForTimeout(260)
    await page.getByTestId('dice-forge-manipulate-btn').click()

    // 【R-10 & R-12 ダイレクト・コマンドカード連打＆即時アクション検証】
    // 斬撃を連打しても解除ではなく次のダイスが自動割り当てされて連続アクションが発動すること！
    await page.getByTestId('slot-strike_1').click()
    await expect(page.getByTestId('battle-floating-popup')).toBeVisible()
    await page.waitForTimeout(140)
    await page.getByTestId('slot-strike_1').click()
    await page.waitForTimeout(140)
    await page.getByTestId('slot-guard_1').click()

    // ② バトル・ダイレクトコマンド＆3Dピップダイス画面のスクリーンショット
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

    // 【R-07 一斉攻撃フィニッシャー＆敵反撃コレオグラフィ検証】
    if (!(await page.getByTestId('dice-forge-reward-modal').isVisible())) {
      await page.getByTestId('dice-forge-execute-turn').click()
      await expect(page.getByTestId('battle-floating-popup')).toBeVisible()
      await page.screenshot({
        path: path.join(OUT_DIR, '03_action_hitstop_impact.png'),
      })
      await page.waitForTimeout(450)
    }

    // Stage 1 の敵を撃破するまでターン実行（最大8ターン以内）
    for (let turn = 0; turn < 8; turn++) {
      const rewardVisible = await page
        .getByTestId('dice-forge-reward-modal')
        .isVisible()
      if (rewardVisible) break
      await page.getByTestId('dice-forge-auto-assign-btn').click()
      await page.getByTestId('dice-forge-execute-turn').click()
      await page.waitForTimeout(450)
    }

    // ⑤ ステージ突破・LEVEL UP!（3択スキル）モーダルの表示確認＆スクリーンショット
    const rewardModal = page.getByTestId('dice-forge-reward-modal')
    await expect(rewardModal).toBeVisible({ timeout: 5000 })
    await expect(rewardModal.getByText(/LEVEL UP!/)).toBeVisible()
    await expect(rewardModal.getByText('STAGE 1 CLEAR')).toBeVisible()
    await assertZeroEmojiAndZeroSentenceOnPage()
    await page.screenshot({
      path: path.join(OUT_DIR, '05_forge_reward_modal.png'),
    })

    // 24面手動選択なしでスキルを選び、1タップで次のステージ(Stage 2)へ進む
    await page.getByTestId('reward-engraving-1').click()
    await page.getByTestId('next-floor-elite').click()

    // ページをリロードし、localStorage オートセーブから STAGE 2 / Lv.2 を途中再開できることを検証
    await page.reload()
    const continueBtn = page.getByTestId('dice-forge-continue-btn')
    await expect(continueBtn).toBeVisible()
    await continueBtn.click()
    await expect(page.getByText('STAGE 2/12')).toBeVisible()
    await expect(page.getByText('Lv.2', { exact: true })).toBeVisible()
    await assertZeroEmojiAndZeroSentenceOnPage()

    expect(errors).toEqual([])
  })
})
