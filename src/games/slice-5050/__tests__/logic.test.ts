import { describe, it, expect } from 'vitest'
import {
  calculatePolygonArea,
  calculatePolygonCentroid,
  splitPolygonByLine,
  executeSlice,
  createStages,
  transformPoints,
  createSeededRandom,
  dateStringToSeed,
} from '../logic'

describe('slice-5050 幾何・物理ロジック単体＆ボット検証テスト', () => {
  it('正方形ポリゴンの面積と重心が正確に算出され、中央切断で 50.0% : 50.0% になること', () => {
    const square = [
      { x: -100, y: -100 },
      { x: 100, y: -100 },
      { x: 100, y: 100 },
      { x: -100, y: 100 },
    ]
    expect(calculatePolygonArea(square)).toBeCloseTo(40000, 1)
    const centroid = calculatePolygonCentroid(square)
    expect(centroid.x).toBeCloseTo(0, 3)
    expect(centroid.y).toBeCloseTo(0, 3)

    const { leftPolygon, rightPolygon } = splitPolygonByLine(
      square,
      { x: 0, y: -200 },
      { x: 0, y: 200 }
    )
    expect(leftPolygon.length).toBeGreaterThanOrEqual(4)
    expect(rightPolygon.length).toBeGreaterThanOrEqual(4)
    expect(calculatePolygonArea(leftPolygon)).toBeCloseTo(20000, 1)
    expect(calculatePolygonArea(rightPolygon)).toBeCloseTo(20000, 1)
  })

  it('任意の斜め直線でポリゴンを分割した際も、左右の面積和が元の面積と一致すること', () => {
    const stages = createStages(20261108)
    for (const stage of stages) {
      const originalArea = calculatePolygonArea(stage.vertices)
      const { leftPolygon, rightPolygon } = splitPolygonByLine(
        stage.vertices,
        { x: -180, y: -90 },
        { x: 180, y: 75 }
      )
      const splitArea =
        calculatePolygonArea(leftPolygon) + calculatePolygonArea(rightPolygon)
      expect(splitArea).toBeCloseTo(originalArea, 1)
    }
  })

  it('超硬鉄芯（💀）を通るラインで切った場合は即座に IRON_CRASH（刀身粉砕）になること', () => {
    const stages = createStages(20261108)
    const stage3 = stages[2] // 中央(0,0)に鉄芯があるステージ
    const res = executeSlice(
      stage3,
      stage3.vertices,
      stage3.cores,
      { x: 0, y: -160 },
      { x: 0, y: 160 }
    )
    expect(res.hitIron).toBe(true)
    expect(res.outcome).toBe('IRON_CRASH')
    expect(res.scoreDelta).toBe(0)
  })

  it('【単調作業防止テスト】中央を縦に切るだけのボット（x=0固定スワイプ）では全5ステージを絶対に突破できないこと', () => {
    const stages = createStages(20261108)
    let survivedAll = true
    const outcomes: string[] = []

    for (const stage of stages) {
      const res = executeSlice(
        stage,
        stage.vertices,
        stage.cores,
        { x: 0, y: -180 },
        { x: 0, y: 180 }
      )
      outcomes.push(res.outcome)
      if (res.outcome === 'CATAPULT_CRASH' || res.outcome === 'IRON_CRASH') {
        survivedAll = false
      }
    }

    expect(survivedAll).toBe(false)
    // Stage 2（非対称L字）でCATAPULT_CRASH、Stage 3（中央鉄芯）でIRON_CRASHが発生すること
    expect(outcomes[1]).toBe('CATAPULT_CRASH')
    expect(outcomes[2]).toBe('IRON_CRASH')
  })

  it('【乱数ボット500回試行テスト】ランダムな始点・終点で500回斬撃してもNaNや計算破綻が一切起きないこと', () => {
    const rand = createSeededRandom(dateStringToSeed('2026-11-08'))
    const stages = createStages(99999)

    let perfectCount = 0
    let goodCount = 0
    let crashCount = 0

    for (let i = 0; i < 500; i++) {
      const stage = stages[i % stages.length]
      const angle = rand() * Math.PI * 2
      const center = { x: (rand() - 0.5) * 40, y: (rand() - 0.5) * 40 }
      const worldVerts = transformPoints(stage.vertices, center, angle)
      const worldCores = stage.cores.map((c) => {
        const [tp] = transformPoints([c], center, angle)
        return { ...c, x: tp.x, y: tp.y }
      })

      const start = {
        x: (rand() - 0.5) * 300,
        y: (rand() - 0.5) * 300,
      }
      const end = {
        x: (rand() - 0.5) * 300,
        y: (rand() - 0.5) * 300,
      }

      const res = executeSlice(stage, worldVerts, worldCores, start, end)

      expect(Number.isNaN(res.leftRatio)).toBe(false)
      expect(Number.isNaN(res.rightRatio)).toBe(false)
      expect(res.leftRatio + res.rightRatio).toBeCloseTo(100, 1)

      if (res.outcome === 'PERFECT') perfectCount++
      else if (res.outcome === 'GOOD') goodCount++
      else crashCount++
    }

    // ランダム入力では大半が失敗しつつも、一部で成功やニアミスが発生する健全な分布であること
    expect(crashCount).toBeGreaterThan(200)
    expect(perfectCount + goodCount).toBeGreaterThan(10)
  })
})

