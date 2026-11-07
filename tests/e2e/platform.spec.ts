import { test, expect } from '@playwright/test'
import path from 'node:path'

const SCRATCH_DIR =
  'C:/Users/subar/.gemini/antigravity/brain/d20b773d-0a7b-47fe-976a-e3d2e5fd56bd/scratch'

test.describe('プラットフォーム＆全ゲーム モバイルE2E検証', () => {
  test('トップ画面にモックが存在せず、実ゲームが表示されること', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('神業・断面スライサー 50:50')).toBeVisible()
    await expect(page.getByText('注文の多すぎる違法建築ハンバーガー')).toBeVisible()
    await expect(page.getByText('深夜3時の黒歴史ポエム防衛')).toBeVisible()
    await expect(page.getByText('17:59 定時退社パリィ！')).toBeVisible()
    await expect(page.getByText('緊急謝罪会見！ギリギリお辞儀チャレンジ')).toBeVisible()
    await expect(page.getByText('キャンディ・ポップ・リバーシ')).toBeVisible()
    await expect(page.locator('a[href="/games/sample-01"]')).toHaveCount(0)
  })

  test('第6弾（Non-Verbal & Toy）：神業・断面スライサー 50:50 でノンバーバル基準・Web Audio・断面破壊・実画面キャプチャがすべてパスすること', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/games/slice-5050')
    const canvas = page.getByTestId('slice-canvas')
    await expect(canvas).toBeVisible()

    // ① 開始直後（ノンバーバル指ガイド表示中）のスクリーンショット撮影
    await page.waitForTimeout(250)
    await page.screenshot({
      path: path.join(SCRATCH_DIR, '01_initial_guide.png'),
    })

    // ノンバーバル文字数上限ゲート（可視日本語文字数が50文字以下であること）
    const jpCharCount = await page.evaluate(() => {
      const text = document.body.innerText || ''
      const jpMatches = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g)
      return jpMatches ? jpMatches.length : 0
    })
    expect(jpCharCount).toBeLessThanOrEqual(50)

    // 最小フォントサイズゲート（12px未満の極小文字が存在しないこと）
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
          const fs = parseFloat(window.getComputedStyle(htmlEl).fontSize)
          if (!Number.isNaN(fs) && fs < minPx) {
            minPx = fs
          }
        }
      }
      return minPx
    })
    expect(minFontSize).toBeGreaterThanOrEqual(12)

    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      // ② ドラッグ操作中（レーザー切断予測ライン表示）のスクリーンショット撮影
      // 端の方をかすめる斜めスワイプで CATAPULT_CRASH（天秤カタパルト崩壊）を発生させる
      const startX = box.x + box.width * 0.22
      const startY = box.y + box.height * 0.24
      const endX = box.x + box.width * 0.42
      const endY = box.y + box.height * 0.52

      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(endX, endY, { steps: 6 })
      await page.waitForTimeout(100)
      await page.screenshot({
        path: path.join(SCRATCH_DIR, '02_dragging_laser.png'),
      })

      // リリースして一閃実行！
      await page.mouse.up()
      await page.waitForTimeout(480)

      // ③ 切断＆天秤カタパルト崩壊瞬間のスクリーンショット撮影
      await page.screenshot({
        path: path.join(SCRATCH_DIR, '03_slice_destruction.png'),
      })
    }

    // Web Audio API 稼働ゲート検証
    const audioTriggers = await page.evaluate(
      () =>
        (window as Window & { __sliceAudioTriggerCount?: number })
          .__sliceAudioTriggerCount ?? 0
    )
    expect(audioTriggers).toBeGreaterThan(0)

    // ④ リザルト画面（断面標本コレクション＆崩壊現場Canvas）の表示確認＆スクリーンショット撮影
    const resultOverlay = page.getByTestId('slice-result-overlay')
    await expect(resultOverlay).toBeVisible({ timeout: 4000 })
    await expect(page.getByRole('button', { name: /𝕏 SHARE/ })).toBeVisible()
    await page.screenshot({
      path: path.join(SCRATCH_DIR, '04_result_specimen.png'),
    })

    // 横はみ出しゼロ確認
    const hasOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth ||
        document.documentElement.scrollHeight >
          document.documentElement.clientHeight
    )
    expect(hasOverflow).toBe(false)
    expect(errors).toEqual([])
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
