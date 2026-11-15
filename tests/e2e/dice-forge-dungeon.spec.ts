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

    // ③ 戦闘画面 (Issue #25-2,3,6,7,8)
    await page.getByTestId('dice-forge-start-btn').click()
    const battleViewport = page.getByTestId('dice-forge-canvas')
    await expect(battleViewport).toBeVisible()
    await expect(page.getByText('STAGE 1/12')).toBeVisible()
    await expect(page.getByText('Lv.1')).toBeVisible()
    await expect(page.getByTestId('always-visible-abilities')).toBeVisible()
    await expect(page.getByTestId('always-visible-abilities')).toContainText('星見の魔導書')

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

    // リロール＆マナ操作
    await page.getByTestId('dice-forge-reroll-btn').click()
    await page.waitForTimeout(260)
    await page.getByTestId('dice-forge-manipulate-btn').click()

    // 1ダイス＝1即時発動（まず鉄壁盾をタップした瞬間にポップアップが出てダイスが「済」になる）
    await page.getByTestId('slot-guard_1').click()
    await expect(page.getByTestId('battle-floating-popup')).toBeVisible()
    await expect(page.getByTestId('die-card-0')).toContainText('済')
    await page.screenshot({
      path: path.join(OUT_DIR, '02_battle_slots_preview.png'),
    })

    // 2手目で毒連撃をタップして敵が生存した状態の攻撃ヒットストップ＆数値非重複を検証・撮影
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

    // Stage 1 の敵を撃破するまで技をタップし続ける（最大4ターン分）
    for (let stepIdx = 0; stepIdx < 20; stepIdx++) {
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
      if (stepIdx % 4 === 2) {
        await page.getByTestId('slot-guard_1').click()
      } else if (stepIdx % 4 === 1) {
        await page.getByTestId('slot-strike_2').click()
      } else {
        await page.getByTestId('slot-strike_1').click()
      }
      await page.waitForTimeout(120)
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
    await continueBtn.click()
    await expect(page.getByText('STAGE 2/12')).toBeVisible()
    await expect(page.getByText('Lv.2')).toBeVisible()
    await assertZeroEmojiAndZeroSentenceOnPage()

    expect(errors).toEqual([])
  })
})
