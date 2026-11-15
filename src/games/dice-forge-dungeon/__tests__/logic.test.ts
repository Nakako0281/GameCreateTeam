import { describe, expect, it, vi } from 'vitest'
import {
  calculateTurnPreview,
  canForgeEngravingOnDie,
  evaluateFormation,
  initGameState,
  step,
} from '../logic'
import {
  clearActiveRun,
  loadActiveRun,
  loadMetaProfile,
  recordRunCompletion,
  saveActiveRun,
} from '../storage'

describe('ダイス・フォージ・ダンジョン (dice-forge-dungeon) コアロジック単体テスト', () => {
  it('初期状態がクラスごとに正しく生成され、ダイス4個・24面を持つこと', () => {
    const mage = initGameState(123, 'mage', 0)
    expect(mage.dice).toHaveLength(4)
    expect(mage.dice[0].faces).toHaveLength(6)
    expect(mage.relics).toContain('relic_star_grimoire')
    expect(mage.floor).toBe(1)

    const assassin = initGameState(123, 'assassin', 0)
    expect(assassin.relics).toContain('relic_assassin_thimble')

    const smith = initGameState(123, 'blacksmith', 0)
    expect(smith.relics).toContain('relic_barricade_core')
  })

  it('共鳴役（Formation）の判定と倍率が正しく計算されること', () => {
    const pair = evaluateFormation([2, 2, 3, 5], false)
    expect(pair.id).toBe('one_pair')
    expect(pair.baseMult).toBe(1.25)

    const twoPairEven = evaluateFormation([2, 2, 4, 4], false)
    expect(twoPairEven.id).toBe('two_pair')
    expect(twoPairEven.isAllEven).toBe(true)
    expect(twoPairEven.totalMult).toBeCloseTo(1.85, 2)

    const straight = evaluateFormation([2, 3, 4, 5], false)
    expect(straight.id).toBe('straight')
    expect(straight.baseMult).toBe(1.75)

    const fourKindOverload = evaluateFormation([6, 6, 6, 6], false)
    expect(fourKindOverload.id).toBe('four_kind')
    expect(fourKindOverload.isOverload20).toBe(true)
    expect(fourKindOverload.totalMult).toBeGreaterThan(3.0)
  })

  it('同一特殊刻印の1ダイス2面制限（1強ハメ防止ルール）が機能すること', () => {
    const state = initGameState(42, 'assassin', 0)
    const die = state.dice[0]
    die.faces[0].engravingId = 'assassin_poison_dart_1'
    die.faces[1].engravingId = 'assassin_poison_dart_1'

    // すでに2面あるため、3面目（index 2）には彫れない
    expect(canForgeEngravingOnDie(die, 'assassin_poison_dart_1', 2)).toBe(false)
    // 既存の面（index 0）の上書きや、別の特殊刻印なら可能
    expect(canForgeEngravingOnDie(die, 'assassin_poison_dart_1', 0)).toBe(true)
    expect(canForgeEngravingOnDie(die, 'assassin_twin_fang_2', 2)).toBe(true)
  })

  it('ダイスのスロット配置・リアルタイム予測・ターン実行が整合すること', () => {
    let state = initGameState(100, 'mage', 0)
    state = step(state, { type: 'ASSIGN_DIE', dieId: 0, slotId: 'strike_1' })
    state = step(state, { type: 'ASSIGN_DIE', dieId: 1, slotId: 'strike_2' })
    state = step(state, { type: 'ASSIGN_DIE', dieId: 2, slotId: 'guard_1' })
    state = step(state, { type: 'ASSIGN_DIE', dieId: 3, slotId: 'arcana_1' })

    const preview = calculateTurnPreview(state)
    expect(preview.totalDamage).toBeGreaterThan(0)
    expect(preview.totalShieldGain).toBeGreaterThan(0)

    const nextState = step(state, { type: 'EXECUTE_TURN' })
    expect(nextState.stats.turnsPlayed).toBe(1)
    expect(nextState.stats.totalDamageDealt).toBeGreaterThanOrEqual(
      preview.totalDamage
    )
  })

  it('未配置でも手札4ダイスの役倍率が即座に決定し、ステージ突破で自動レベルアップ＆自動スキル組み込みが行われること', () => {
    const state = initGameState(2026, 'mage', 0)
    // 手元の4ダイスをワンペア(2,2,4,5)に設定（まだ1個もスロット未配置）
    state.dice[0].currentPip = 2
    state.dice[1].currentPip = 2
    state.dice[2].currentPip = 4
    state.dice[3].currentPip = 5

    const handPreview = calculateTurnPreview(state)
    expect(handPreview.formation.id).toBe('one_pair')
    expect(handPreview.finalMult).toBeGreaterThanOrEqual(1.25)

    // 敵を撃破して報酬フェーズへ移行
    state.enemy.hp = 1
    let postBattle = step(state, { type: 'ASSIGN_DIE', dieId: 0, slotId: 'strike_1' })
    postBattle = step(postBattle, { type: 'EXECUTE_TURN' })
    expect(postBattle.phase).toBe('reward')
    expect(postBattle.rewardOffer?.nextFloorChoices).toEqual(['elite'])

    const beforeMaxHp = postBattle.maxHp
    const chosenEng = postBattle.rewardOffer!.engravings[0]
    // 24面を手動指定しなくても自動で組み込まれ、レベルアップ（maxHp+4, 基礎攻撃+1）してStage2へ進む
    const stage2 = step(postBattle, {
      type: 'CHOOSE_REWARD',
      engravingId: chosenEng,
      nextNodeType: 'elite',
    })
    expect(stage2.phase).toBe('battle')
    expect(stage2.floor).toBe(2)
    expect(stage2.maxHp).toBe(beforeMaxHp + 4)
    expect(stage2.strengthThisBattle).toBe(1)
    expect(stage2.stats.engravingsForged).toBe(1)
  })

  it('マナ介入（出目操作±1・反転）でマナを消費し出目が変化すること', () => {
    let state = initGameState(77, 'mage', 0)
    state.dice[0].currentPip = 2
    const beforeMana = state.mana
    state = step(state, {
      type: 'MANIPULATE_DIE',
      dieId: 0,
      mode: 'flip',
    })
    expect(state.mana).toBe(beforeMana - 1)
    expect(state.dice[0].currentPip).toBe(5)
  })

  it('localStorage による途中中断オートセーブ＆再開、および戦績・図鑑記録が正しく動作すること', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })

    let state = initGameState(999, 'blacksmith', 0)
    state.floor = 5
    state.hp = 48
    saveActiveRun(state)

    const loaded = loadActiveRun()
    expect(loaded).not.toBeNull()
    expect(loaded?.floor).toBe(5)
    expect(loaded?.starterClass).toBe('blacksmith')

    state.phase = 'victory'
    const profile = recordRunCompletion(state, 18500)
    expect(profile.highScore).toBe(18500)
    expect(profile.totalClears).toBe(1)
    expect(profile.unlockedAscension).toBe(1)
    expect(loadActiveRun()).toBeNull()
    expect(loadMetaProfile().highScore).toBe(18500)

    clearActiveRun()
    vi.unstubAllGlobals()
  })
})
