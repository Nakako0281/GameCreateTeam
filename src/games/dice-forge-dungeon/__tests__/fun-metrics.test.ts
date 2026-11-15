import { describe, expect, it } from 'vitest'
import {
  monotoneBot,
  randomBot,
  simulateRun,
  skilledBot,
  strategyABot,
  strategyBBot,
  strategyCBot,
} from '../logic'
import type { Policy, RunResult, StarterClassId } from '../types'

const N = 120

function runMany(
  policy: Policy,
  seedOffset = 0,
  starterClass: StarterClassId = 'mage'
): RunResult[] {
  return Array.from({ length: N }, (_, i) =>
    simulateRun(1000 + seedOffset + i, policy, starterClass)
  )
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const clearRate = (rs: RunResult[]) =>
  rs.filter((r) => r.cleared).length / rs.length

describe('ダイス・フォージ・ダンジョン リトライ性＆バランス指標（Replayability Metrics）', () => {
  const random = runMany(randomBot, 0, 'mage')
  const monotone = runMany(monotoneBot, 1000, 'mage')
  const pro = runMany(skilledBot(0), 2000, 'mage')
  const good = runMany(skilledBot(0.3), 3000, 'mage')
  const rough = runMany(skilledBot(0.65), 4000, 'mage')
  const stratA = runMany(strategyABot, 5000, 'assassin')
  const stratB = runMany(strategyBBot, 6000, 'blacksmith')
  const stratC = runMany(strategyCBot, 7000, 'mage')

  const score = (rs: RunResult[]) => mean(rs.map((r) => r.score))

  it('実測値レポート出力', () => {
    const report = { random, monotone, pro, good, rough, stratA, stratB, stratC }
    for (const [name, rs] of Object.entries(report)) {
      console.log(
        `${name.padEnd(10)} score=${score(rs).toFixed(0)} clear=${(clearRate(rs) * 100).toFixed(1)}% ` +
          `nearMiss=${((rs.filter((r) => r.nearMiss).length / rs.length) * 100).toFixed(1)}% ` +
          `floors=${mean(rs.map((r) => r.floorsCleared)).toFixed(1)} ` +
          `medianTime=${median(rs.map((r) => r.durationSec)).toFixed(0)}s`
      )
    }
  })

  it('1. スキル・戦略差: 熟練ボットはランダムボットより明確に高いスコアを出す', () => {
    expect(score(good)).toBeGreaterThanOrEqual(score(random) * 1.4)
  })

  it('2. 戦略の多様性＆手抜き不可: 防御無視の単調ゴリ押しでは勝てず、3大ビルドすべてが成立する', () => {
    expect(score(monotone)).toBeLessThanOrEqual(score(good) * 0.65)
    expect(score(stratA)).toBeGreaterThan(score(random) * 1.3)
    expect(score(stratB)).toBeGreaterThan(score(random) * 1.3)
    expect(score(stratC)).toBeGreaterThan(score(random) * 1.3)

    const maxStrat = Math.max(score(stratA), score(stratB), score(stratC))
    const minStrat = Math.max(1, Math.min(score(stratA), score(stratB), score(stratC)))
    expect(maxStrat / minStrat).toBeLessThanOrEqual(2.0)
  })

  it('3. 上達の階段: 判断精度（ノイズ0 / 0.3 / 0.65）に応じてスコアが単調減少する', () => {
    expect(score(pro)).toBeGreaterThan(score(good))
    expect(score(good)).toBeGreaterThan(score(rough))
  })

  it('4. 適度な歯ごたえ: 熟練ボットでもクリア率が15%〜85%の範囲に収まる', () => {
    const rate = clearRate(good)
    expect(rate).toBeGreaterThanOrEqual(0.15)
    expect(rate).toBeLessThanOrEqual(0.85)
  })

  it('5. ニアミス率: 惜しい決着が10%以上発生する', () => {
    const all = [...good, ...rough, ...stratA, ...stratB, ...stratC]
    const nearMissRate = all.filter((r) => r.nearMiss).length / all.length
    expect(nearMissRate).toBeGreaterThanOrEqual(0.1)
  })

  it('6. 決定論的再現性: 同一シード・同一方針なら結果が完全一致する', () => {
    const p = skilledBot(0.3)
    expect(simulateRun(42, p, 'mage')).toEqual(simulateRun(42, p, 'mage'))
  })
})
