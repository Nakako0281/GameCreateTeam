import { describe, it, expect } from 'vitest'
import {
  SCANDAL_PROMPTS,
  ROUNDS,
  pickRandomScandal,
  computeBrakingStopAngle,
  stepBowPhysics,
  evaluateRoundStop,
  evaluateFinalPressResult,
  buildShareTweetUrl,
} from '../logic'

describe('緊急謝罪会見！ギリギリお辞儀チャレンジ コアロジック単体テスト', () => {
  it('不祥事お題が10種類定義されており、前回と異なるお題を抽選できること', () => {
    expect(SCANDAL_PROMPTS).toHaveLength(10)
    const first = SCANDAL_PROMPTS[0]
    const next = pickRandomScandal(first.id)
    expect(next.id).not.toBe(first.id)
  })

  it('慣性ブレーキの制動距離計算が正しく機能すること', () => {
    // 角度30°、速度100 deg/s、減速度200 deg/s^2 のとき、制動距離 = 100^2 / (2*200) = 25° ➔ 停止角度 55.0°
    const stopAngle = computeBrakingStopAngle(30, 100, 200)
    expect(stopAngle).toBe(55.0)
  })

  it('stepBowPhysicsで長押し中は加速し、指を離した後は減速して停止すること', () => {
    const r1 = ROUNDS[0]
    const held = stepBowPhysics(10, 40, 'holding', r1, 0.04)
    expect(held.angle).toBeGreaterThan(10)
    expect(held.velocity).toBeGreaterThan(40)
    expect(held.stopped).toBe(false)

    // 低速状態からブレーキをかけて停止するケース
    const braked = stepBowPhysics(44.8, 3, 'braking', r1, 0.04)
    expect(braked.stopped).toBe(true)
    expect(braked.velocity).toBe(0)
  })

  it('evaluateRoundStopが黄金角度ピタリ・浅すぎ逆ギレ・床貫通・大回転を正しく判定すること', () => {
    const r1 = ROUNDS[0] // target: 45°
    const r3 = ROUNDS[2] // target: 135°

    // 45.2° -> miracle (誤差0.2°)
    const miracle = evaluateRoundStop(r1, 45.2)
    expect(miracle.grade).toBe('miracle')
    expect(miracle.isAccident).toBe(false)

    // 10.0° -> defiant_accident (仁王立ち逆ギレ)
    const defiant = evaluateRoundStop(r1, 10.0)
    expect(defiant.grade).toBe('defiant_accident')
    expect(defiant.isAccident).toBe(true)

    // 160.0° -> floor_drill_accident (床めり込み)
    const floor = evaluateRoundStop(r3, 160.0)
    expect(floor.grade).toBe('floor_drill_accident')
    expect(floor.isAccident).toBe(true)

    // 210.0° -> mantle_accident (マントル・ブラジル貫通)
    const mantle = evaluateRoundStop(r3, 210.0)
    expect(mantle.grade).toBe('mantle_accident')
    expect(mantle.isAccident).toBe(true)

    // 310.0° -> windmill_accident (ブレイクダンス)
    const windmill = evaluateRoundStop(r3, 310.0)
    expect(windmill.grade).toBe('windmill_accident')
    expect(windmill.isAccident).toBe(true)
  })

  it('evaluateFinalPressResultとbuildShareTweetUrlが号外見出し・称号・XシェアURLを正しく生成すること', () => {
    const accidentRecord = evaluateRoundStop(ROUNDS[1], 215.4)
    const accidentResult = evaluateFinalPressResult([accidentRecord])
    expect(accidentResult.isClearedAllRounds).toBe(false)
    expect(accidentResult.titleBadge).toContain('地底謝罪師')

    const clearRecords = [
      evaluateRoundStop(ROUNDS[0], 45.0),
      evaluateRoundStop(ROUNDS[1], 90.4),
      evaluateRoundStop(ROUNDS[2], 134.8),
    ]
    const clearResult = evaluateFinalPressResult(clearRecords)
    expect(clearResult.isClearedAllRounds).toBe(true)
    expect(clearResult.titleBadge).toContain('絶対角度神')

    const shareUrl = buildShareTweetUrl(
      SCANDAL_PROMPTS[0],
      accidentResult,
      'https://nakako0281.github.io/GameCreateTeam/games/shazai-angle-challenge'
    )
    expect(shareUrl).toContain('https://twitter.com/intent/tweet?text=')
    expect(decodeURIComponent(shareUrl)).toContain('#緊急謝罪会見')
    expect(decodeURIComponent(shareUrl)).toContain('215.4°')
  })
})
