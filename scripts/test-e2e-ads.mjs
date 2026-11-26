#!/usr/bin/env node
/**
 * 広告(AdSense)・アクセス解析(GA4)有効ビルドでの入力データ漏洩ゼロ検証ランナー
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const OUT_DIR = 'dist-ads'
const OUT_ABS = path.join(ROOT, OUT_DIR)
const DUMMY_ADSENSE_CLIENT = 'ca-pub-0000000000000000'
const DUMMY_GA_ID = 'G-TEMOTOBOXTEST'

const astroBin = path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs')
const playwrightBin = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js')

function runNodeScript(scriptPath, args, env) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env,
  })
  if (res.error) {
    throw res.error
  }
  if (res.status !== 0) {
    throw new Error(
      `Command failed with exit code ${res.status}: ${path.basename(scriptPath)} ${args.join(' ')}`
    )
  }
}

try {
  fs.rmSync(OUT_ABS, { recursive: true, force: true })

  const buildEnv = {
    ...process.env,
    ASTRO_OUT_DIR: OUT_DIR,
    PUBLIC_ADSENSE_CLIENT: DUMMY_ADSENSE_CLIENT,
    PUBLIC_GA_ID: DUMMY_GA_ID,
  }

  console.log(
    `[test:e2e:ads] Building ad/analytics-enabled site into ${OUT_DIR}/ ...`
  )
  runNodeScript(astroBin, ['build'], buildEnv)

  const indexHtmlPath = path.join(OUT_ABS, 'index.html')
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`[test:e2e:ads] Missing built HTML: ${indexHtmlPath}`)
  }
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8')
  if (!indexHtml.includes(`adsbygoogle.js?client=${DUMMY_ADSENSE_CLIENT}`)) {
    throw new Error(
      '[test:e2e:ads] Built dist-ads/index.html is missing AdSense script tag.'
    )
  }
  if (!indexHtml.includes(`gtag/js?id=${DUMMY_GA_ID}`)) {
    throw new Error(
      '[test:e2e:ads] Built dist-ads/index.html is missing GA4 script tag.'
    )
  }

  console.log('[test:e2e:ads] Running Playwright leakage-zero proof...')
  runNodeScript(
    playwrightBin,
    ['test', '--config', 'playwright.ads.config.ts'],
    {
      ...process.env,
      ASTRO_OUT_DIR: OUT_DIR,
    }
  )

  console.log('[test:e2e:ads] PASSED.')
} finally {
  fs.rmSync(OUT_ABS, { recursive: true, force: true })
}
