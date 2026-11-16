import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

test.use({
  video: { mode: 'on', size: { width: 390, height: 844 } },
})

const OUT_DIR = 'test-results/dice-forge-dungeon'

test.describe('ダイス・フォージ・ダンジョン モバイルE2E ＆ Issue #25/#26 抜本改善検証', () => {
  test('タイトル画面・固定3ゾーン高さ一致・キャラ明確差別化・能力常時表示・1ダイス即発動・報酬明示がすべてパスすること', async ({
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

    const assertMinFontAndNoOverflow = async () => {
      const check = await page.evaluate(() => {
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
        const overflow =
          document.documentElement.scrollWidth >
            document.documentElement.clientWidth ||
          document.documentElement.scrollHeight >
            document.documentElement.clientHeight
        return { minPx, overflow }
      })
      expect(check.minPx).toBeGreaterThanOrEqual(12)
      expect(check.overflow).toBe(false)
    }

    const getThreeZoneBounds = async () => {
      const topBox = await page.getByTestId('layout-zone-top').boundingBox()
      const stageBox = await page.getByTestId('layout-zone-stage').boundingBox()
      const bottomBox = await page.getByTestId('layout-zone-bottom').boundingBox()
      expect(topBox).not.toBeNull()
      expect(stageBox).not.toBeNull()
      expect(bottomBox).not.toBeNull()
      return {
        top: topBox!,
        stage: stageBox!,
        bottom: bottomBox!,
      }
    }

    const assertSameThreeZoneHeights = (
      a: Awaited<ReturnType<typeof getThreeZoneBounds>>,
      b: Awaited<ReturnType<typeof getThreeZoneBounds>>
    ) => {
      expect(Math.abs(a.top.y - b.top.y)).toBeLessThanOrEqual(1.5)
      expect(Math.abs(a.top.height - b.top.height)).toBeLessThanOrEqual(1.5)
      expect(Math.abs(a.stage.y - b.stage.y)).toBeLessThanOrEqual(1.5)
      expect(Math.abs(a.stage.height - b.stage.height)).toBeLessThanOrEqual(1.5)
      expect(Math.abs(a.bottom.y - b.bottom.y)).toBeLessThanOrEqual(1.5)
      expect(Math.abs(a.bottom.height - b.bottom.height)).toBeLessThanOrEqual(1.5)
    }

    // ① タイトル画面 (Issue #26)
    await page.goto('/games/dice-forge-dungeon')
    await expect(page.getByTestId('dice-forge-title-screen')).toBeVisible()
    await expect(page.getByTestId('title-hero-panel')).toBeVisible()
    await expect(page.getByTestId('title-start-btn')).toBeVisible()
    await assertZeroEmojiAndZeroSentenceOnPage()
    await assertMinFontAndNoOverflow()
    const titleZones = await getThreeZoneBounds()
    await page.screenshot({
      path: path.join(OUT_DIR, '00_title_screen.png'),
    })

    // ② キャラクター選択画面 (Issue #25-1: 3クラスの明確なステータス・得意出目・特性差)
    await page.getByTestId('title-start-btn').click()
    await expect(page.getByTestId('class-select-panel')).toBeVisible()
    await expect(page.getByTestId('class-select-mage')).toContainText('得意: 5・6')
    await expect(page.getByTestId('class-select-assassin')).toContainText('得意: 1・2')
    await expect(page.getByTestId('class-select-blacksmith')).toContainText('得意: 2・4・6')
    await assertZeroEmojiAndZeroSentenceOnPage()
    await assertMinFontAndNoOverflow()
    const classSelectZones = await getThreeZoneBounds()
    assertSameThreeZoneHeights(titleZones, classSelectZones)

    await page.getByTestId('class-select-assassin').click()
    await page.getByTestId('class-select-mage').click()
    await page.screenshot({
      path: path.join(OUT_DIR, '01_title_class_select.png'),
    })

    // ③ 戦闘画面 & Issue #29 ダイスロール順次演出検証
    await page.getByTestId('dice-forge-start-btn').click()
    const battleViewport = page.getByTestId('dice-forge-canvas')
    await expect(battleViewport).toBeVisible()
    await expect(page.getByText('STAGE 1/12')).toBeVisible()
    await expect(page.getByText('Lv.1')).toBeVisible()
    await expect(page.getByTestId('always-visible-abilities')).toBeVisible()
    await expect(page.getByTestId('always-visible-abilities')).toContainText('星見の魔導書')

    // バトル開始直後にダイスロール演出が発火していること（その後自動確定する）
    await expect(page.getByTestId('dice-rolling-banner')).toBeVisible()
    await page.waitForTimeout(80)
    await page.screenshot({
      path: path.join(OUT_DIR, '02a_dice_rolling.png'),
    })
    await expect(page.getByTestId('dice-rolling-banner')).toHaveCount(0, {
      timeout: 2000,
    })

    // 上部能力バー内のバッジが親コンテナ右端でクリップ（見切れ）されていないこと (R-15)
    const noAbilityClip = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="always-visible-abilities"]')
      if (!container) return false
      const cRect = container.getBoundingClientRect()
      const children = Array.from(container.querySelectorAll('span'))
      return children.every((el) => {
        const r = el.getBoundingClientRect()
        return r.right <= cRect.right + 1 && r.left >= cRect.left - 1
      })
    })
    expect(noAbilityClip).toBe(true)

    // 下部操作デッキ内のボタン文字が横見切れ（scrollWidth > clientWidth）していないこと (R-15)
    const noBottomClip = await page.evaluate(() => {
      const bottom = document.querySelector('[data-testid="layout-zone-bottom"]')
      if (!bottom) return false
      const spans = Array.from(bottom.querySelectorAll('button span'))
      return spans.every((el) => el.scrollWidth <= el.clientWidth + 2)
    })
    expect(noBottomClip).toBe(true)

    // 重複ボタン（「自動」「一斉攻撃」）が撤廃されていること
    await expect(page.getByTestId('dice-forge-auto-assign-btn')).toHaveCount(0)
    await expect(page.getByTestId('dice-forge-execute-turn')).toHaveCount(0)

    await assertZeroEmojiAndZeroSentenceOnPage()
    await assertMinFontAndNoOverflow()
    const battleZones = await getThreeZoneBounds()
    assertSameThreeZoneHeights(titleZones, battleZones)

    // 能力詳細モーダルも正常に開閉できること
    await page.getByTestId('dice-forge-inspect-btn').click()
    await expect(page.getByTestId('dice-forge-net-modal')).toBeVisible()
    await assertZeroEmojiAndZeroSentenceOnPage()
    await page.screenshot({
      path: path.join(OUT_DIR, '04_cross_net_view.png'),
    })
    await page.getByRole('button', { name: '閉じる' }).click()

    // リロール（演出発火 -> 完了待機）＆マナ操作
    await page.getByTestId('dice-forge-reroll-btn').click()
    await expect(page.getByTestId('dice-rolling-banner')).toBeVisible()
    await expect(page.getByTestId('dice-rolling-banner')).toHaveCount(0, {
      timeout: 2000,
    })
    await page.getByTestId('dice-forge-manipulate-btn').click()

    // ④ Issue #30: 1タップ照準比較(未消費) -> 別技切替 -> 再タップ発動 -> Undo戻し -> ドラッグ即発動
    // 1タップ目（鉄壁盾）：照準ロックされるがダイスは未消費のまま
    await page.getByTestId('slot-guard_1').click()
    await expect(page.getByTestId('slot-guard_1')).toHaveAttribute('data-armed', 'true')
    await expect(page.getByTestId('aim-status-banner')).toBeVisible()
    await expect(page.getByTestId('die-card-0')).not.toContainText('済')

    // 別の技（強斬撃）へ1タップでノーリスク比較切替
    await page.getByTestId('slot-strike_1').click()
    await expect(page.getByTestId('slot-guard_1')).toHaveAttribute('data-armed', 'false')
    await expect(page.getByTestId('slot-strike_1')).toHaveAttribute('data-armed', 'true')
    await page.screenshot({
      path: path.join(OUT_DIR, '02_battle_slots_preview.png'),
    })

    // 同じ技（強斬撃）を2タップ目で即発動！ダイス0が「済」になりポップアップ発生
    await page.getByTestId('slot-strike_1').click()
    await expect(page.getByTestId('battle-floating-popup')).toBeVisible()
    await expect(page.getByTestId('die-card-0')).toContainText('済')

    // 1手戻す(Undo)でダイス0の消費を安全に巻き戻せること
    await expect(page.getByTestId('dice-forge-undo-btn')).toBeEnabled()
    await page.getByTestId('dice-forge-undo-btn').click()
    await expect(page.getByTestId('die-card-0')).not.toContainText('済')

    // ダイス0を「鉄壁盾」へドラッグ＆ドロップすると1ジェスチャーで即発動すること
    const die0Box = await page.getByTestId('die-card-0').boundingBox()
    const guardBox = await page.getByTestId('slot-guard_1').boundingBox()
    expect(die0Box).not.toBeNull()
    expect(guardBox).not.toBeNull()
    await page.mouse.move(
      die0Box!.x + die0Box!.width / 2,
      die0Box!.y + die0Box!.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      guardBox!.x + guardBox!.width / 2,
      guardBox!.y + guardBox!.height / 2,
      { steps: 8 }
    )
    await page.mouse.up()
    await expect(page.getByTestId('die-card-0')).toContainText('済')

    // 2手目で毒連撃をダブルタップ（照準 -> 発動）してヒットストップ＆数値非重複を撮影
    await page.getByTestId('slot-strike_2').click()
    await page.getByTestId('slot-strike_2').click()
    await expect(page.getByTestId('dice-forge-reward-modal')).toHaveCount(0)
    await expect(page.getByTestId('battle-floating-popup')).toBeVisible()
    await page.screenshot({
      path: path.join(OUT_DIR, '03_action_hitstop_impact.png'),
    })

    // サウンド発音確認
    const audioCount = await page.evaluate(
      () =>
        (window as Window & { __diceForgeDungeonAudioCount?: number })
          .__diceForgeDungeonAudioCount ?? 0
    )
    expect(audioCount).toBeGreaterThan(0)

    // Stage 1 の敵を撃破するまで技をダブルタップし続ける（最大4ターン分）
    for (let stepIdx = 0; stepIdx < 24; stepIdx++) {
      const rewardVisible = await page
        .getByTestId('dice-forge-reward-modal')
        .isVisible()
      if (rewardVisible) break
      const strikeBtn = page.getByTestId('slot-strike_1')
      if ((await strikeBtn.count()) === 0) {
        await page.waitForTimeout(150)
        continue
      }
      const strikeDisabled = await strikeBtn.isDisabled()
      if (strikeDisabled) {
        await page.waitForTimeout(420)
        continue
      }
      const targetSlot =
        stepIdx % 4 === 2
          ? page.getByTestId('slot-guard_1')
          : stepIdx % 4 === 1
            ? page.getByTestId('slot-strike_2')
            : strikeBtn
      await targetSlot.click()
      if (await targetSlot.isVisible().catch(() => false)) {
        const armed = await targetSlot.getAttribute('data-armed').catch(() => null)
        if (armed === 'true') {
          await targetSlot.click()
        }
      }
      await page.waitForTimeout(100)
    }

    // ④ ステージクリア報酬画面（Zone C内固定、省略なしの具体的な効果説明）
    const rewardPanel = page.getByTestId('dice-forge-reward-modal')
    await expect(rewardPanel).toBeVisible({ timeout: 5000 })
    await expect(rewardPanel.getByText(/LEVEL UP!/)).toBeVisible()
    await expect(rewardPanel.getByText('STAGE 1 CLEAR')).toBeVisible()
    await expect(rewardPanel).toContainText('ダイス面強化')
    await expect(rewardPanel).toContainText('遺物効果:')
    await assertZeroEmojiAndZeroSentenceOnPage()
    await assertMinFontAndNoOverflow()
    const rewardZones = await getThreeZoneBounds()
    assertSameThreeZoneHeights(titleZones, rewardZones)

    await page.screenshot({
      path: path.join(OUT_DIR, '05_forge_reward_modal.png'),
    })

    // 強化を確定して Stage 2 へ進み、リロード後のオートセーブ再開を確認
    await page.getByTestId('reward-engraving-1').click()
    await page.getByTestId('next-floor-elite').click()
    await expect(page.getByText('STAGE 2/12')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('dice-forge-title-screen')).toBeVisible()
    const continueBtn = page.getByTestId('dice-forge-continue-btn')
    await expect(continueBtn).toBeVisible()
    const continueTitleZones = await getThreeZoneBounds()
    assertSameThreeZoneHeights(titleZones, continueTitleZones)
    await page.screenshot({
      path: path.join(OUT_DIR, '06_title_continue.png'),
    })
    await continueBtn.click()
    await expect(page.getByText('STAGE 2/12')).toBeVisible()
    await expect(page.getByText('Lv.2')).toBeVisible()
    const stage2Zones = await getThreeZoneBounds()
    assertSameThreeZoneHeights(titleZones, stage2Zones)
    await assertZeroEmojiAndZeroSentenceOnPage()

    expect(errors).toEqual([])
  })
})
