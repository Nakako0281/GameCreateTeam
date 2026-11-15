# リトライ性 ＆ ゲームバランス指標（Replayability & Fun Metrics）テスト

AIチームは感覚だけで「リトライ性が高い」と主張するのではなく、**純粋関数で実装したゲームロジック（`logic.ts`）に対して複数の戦略ボットを数百回ずつ走らせ、リトライ性の高いゲームが満たすべき統計的性質** を数値で証明します。

このテストは **Milestone 1（M1: コアロジック＆ボット検証）** の完了ゲートとして必ず実装・通過させます。

---

## 1. 検証する6つのコア指標

> ※ プレイ時間（`durationSec` またはターン数）の合格レンジは、**人間（最高責任者）が承認した企画書（`docs/proposals/<game-id>.md`）の想定プレイ時間** に基づいて設定します。

| # | 指標 | 検証する意味 | 既定の合格ライン |
| :- | :--- | :--- | :--- |
| **1** | **スキル・戦略差**<br>*(Skill & Strategy Gap)* | 状況を見て適切に判断・ビルド構築するプレイヤーは、でたらめな入力より明確に高い成果を出す | 熟練ボットの平均スコア ≥ ランダムボットの **1.5倍**（またはクリア率/到達度で **+30pt以上**） |
| **2** | **戦略の多様性・手抜き不可**<br>*(Strategy Diversity & Anti-Cheese)* | 1つの単調操作（連打・放置・単一選択のゴリ押し）では勝てず、かつ複数の異なる戦略/ビルド方針が成立する | ① 単調ボットの平均 ≤ 熟練ボットの **0.6倍**<br>② 異なる戦略ボット（例：戦略A / 戦略B）がいずれもランダムボットを有意に上回り、特定戦略の1強独占になっていないこと |
| **3** | **上達の階段**<br>*(Mastery Curve)* | プレイヤースキル（判断精度・先読み・シナジー理解）が上がるにつれて、段階的に結果が良くなる | 判断精度（ノイズ `0.0` / `0.3` / `0.6`）のボット間で平均スコアが **単調減少** する |
| **4** | **適度な歯ごたえ（天井設計）**<br>*(Challenge Ceiling)* | 上手い人でも初回で簡単に完全制覇・カンストせず、繰り返し挑戦する余地がある | 標準熟練ボット（ノイズ `0.3`）の完全クリア率（または目標達成率）が **20%〜85%** の範囲にある |
| **5** | **ニアミス・接戦の創発**<br>*(Near-Miss / Tension)* | 「あと1手・あと少しで次の段階やハイスコアに届いた！」という悔しさが頻繁に起きる | 全試行のうちニアミス判定（目標や次段階の±10〜15%圏内での決着）が **10%以上** |
| **6** | **プレイ時間・決定論的再現性**<br>*(Pacing & Determinism)* | 企画書で定めた想定プレイ時間（またはターン数）に収まり、同一シード・同一方針で完全に同じ結果が再現される | ① 企画書の想定時間レンジ内<br>② `simulateRun(seed, policy)` の結果が完全に決定論的（再現性100%） |

---

## 2. `logic.ts` に必須の公開API設計

UI（React / Canvas）とボットテストが **完全に同一のゲームロジック** を共有できるよう、`src/games/<game-id>/logic.ts` は副作用のない純粋関数として設計します。

```ts
// src/games/<game-id>/logic.ts

/** シード付き乱数（mulberry32）。ロジック内で Math.random() は絶対に使わない */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** プレイヤー（およびボット）が観測できるゲーム状態 */
export interface Observation {
  /* 盤面、手札、所持リソース、現在のウェーブ/ターン、選択肢など */
}

/** プレイヤーが行うアクション（コマンドまたはリアルタイム入力） */
export type Action = unknown

/** ボットの方針関数: 観測状態と手ブレ用RNGを受け取り、Actionを返す */
export type Policy = (obs: Observation, rng: () => number) => Action

export interface RunResult {
  score: number          // 最終スコア・到達点
  cleared: boolean       // 目標クリア（またはステージ突破）判定
  nearMiss: boolean      // 「惜しい！」判定（クリアラインや自己ベスト更新寸前での決着）
  durationSec: number    // 想定プレイ時間（ターン制の場合は推定秒数またはターン数換算）
  buildArchetype?: string // 選択された主要ビルド・戦略系統（多様性検証用）
}

/** 1プレイ（1ラン）を最初から最後まで高速シミュレーションする */
export function simulateRun(seed: number, policy: Policy): RunResult {
  throw new Error('implement me')
}
```

---

## 3. テストテンプレート（`__tests__/fun-metrics.test.ts`）

```ts
// src/games/<game-id>/__tests__/fun-metrics.test.ts
import { describe, it, expect } from 'vitest'
import { simulateRun, type Policy, type RunResult } from '../logic'

// ゲームの計算量に応じて 200〜500 回に設定（テスト実行時間が数秒以内に収まるように）
const N = 300

function runMany(policy: Policy, seedOffset = 0): RunResult[] {
  return Array.from({ length: N }, (_, i) => simulateRun(1000 + seedOffset + i, policy))
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const clearRate = (rs: RunResult[]) => rs.filter((r) => r.cleared).length / rs.length

// ---- ボット定義 ----
const randomBot: Policy = (_obs, rng) => {
  throw new Error('implement randomBot')
}

const monotoneBot: Policy = (_obs) => {
  throw new Error('implement monotoneBot (常に一番左を選ぶ / 連打する等の思考停止ボット)')
}

const skilledBot = (noise: number): Policy => (_obs, rng) => {
  throw new Error('implement skilledBot (noiseに応じた判断ブレを持つ熟練ボット)')
}

// 戦略多様性テスト用（企画書のビルド系統A / 系統B を優先するボット）
const strategyABot: Policy = (_obs, rng) => {
  throw new Error('implement strategyABot')
}
const strategyBBot: Policy = (_obs, rng) => {
  throw new Error('implement strategyBBot')
}

describe('リトライ性＆バランス指標（Replayability Metrics）', () => {
  const random = runMany(randomBot)
  const monotone = runMany(monotoneBot)
  const pro = runMany(skilledBot(0))
  const good = runMany(skilledBot(0.3))
  const rough = runMany(skilledBot(0.6))
  const stratA = runMany(strategyABot, 5000)
  const stratB = runMany(strategyBBot, 6000)
  const score = (rs: RunResult[]) => mean(rs.map((r) => r.score))

  it('1. スキル・戦略差: 熟練ボットはランダムより明確に高い成果を出す', () => {
    expect(score(good)).toBeGreaterThanOrEqual(score(random) * 1.5)
  })

  it('2. 戦略の多様性＆手抜き不可: 思考停止では勝てず、複数の戦略が成立する', () => {
    expect(score(monotone)).toBeLessThanOrEqual(score(good) * 0.6)
    expect(score(stratA)).toBeGreaterThan(score(random) * 1.25)
    expect(score(stratB)).toBeGreaterThan(score(random) * 1.25)
    // 一方の戦略が他方の2.5倍以上になるような極端な1強バランスでないこと
    const ratio = Math.max(score(stratA), score(stratB)) / Math.max(1, Math.min(score(stratA), score(stratB)))
    expect(ratio).toBeLessThanOrEqual(2.2)
  })

  it('3. 上達の階段: 判断精度が高いほどスコアが伸びる', () => {
    expect(score(pro)).toBeGreaterThan(score(good))
    expect(score(good)).toBeGreaterThan(score(rough))
  })

  it('4. 適度な歯ごたえ: 熟練者でも毎回簡単には完全制覇できない', () => {
    const rate = clearRate(good)
    expect(rate).toBeGreaterThanOrEqual(0.15)
    expect(rate).toBeLessThanOrEqual(0.85)
  })

  it('5. ニアミス率: 惜しい決着が10%以上発生する', () => {
    const all = [...good, ...rough, ...stratA, ...stratB]
    const nearMissRate = all.filter((r) => r.nearMiss).length / all.length
    expect(nearMissRate).toBeGreaterThanOrEqual(0.1)
  })

  it('6. 決定論的再現性: 同一シード・同一方針なら完全一致する', () => {
    const p = skilledBot(0.3)
    expect(simulateRun(42, p)).toEqual(simulateRun(42, p))
  })

  it('実測値レポート出力', () => {
    const report = { random, monotone, pro, good, rough, stratA, stratB }
    for (const [name, rs] of Object.entries(report)) {
      console.log(
        `${name.padEnd(10)} score=${score(rs).toFixed(1)} clear=${(clearRate(rs) * 100).toFixed(0)}% ` +
          `nearMiss=${((rs.filter((r) => r.nearMiss).length / rs.length) * 100).toFixed(0)}% ` +
          `medianTime=${median(rs.map((r) => r.durationSec)).toFixed(1)}s`
      )
    }
  })
})
```
