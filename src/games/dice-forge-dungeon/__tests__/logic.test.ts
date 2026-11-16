import { describe, expect, it, vi } from 'vitest'
import {
  calculateSingleDieAction,
  calculateTurnPreview,
  canForgeEngravingOnDie,
  evaluateFormation,
  initGameState,
  previewAfterSingleAction,
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
  it('初期状態が3クラスごとにHP・攻撃・防御・MPで明確に差別化され、ダイス4個・24面を持つこと', () => {
    const mage = initGameState(123, 'mage', 0)
    expect(mage.dice).toHaveLength(4)
    expect(mage.dice[0].faces).toHaveLength(6)
    expect(mage.maxHp).toBe(60)
    expect(mage.baseAttack).toBe(3)
    expect(mage.baseDefense).toBe(2)
    expect(mage.mana).toBe(4)
    expect(mage.relics).toContain('relic_star_grimoire')

    const assassin = initGameState(123, 'assassin', 0)
    expect(assassin.maxHp).toBe(56)
    expect(assassin.baseAttack).toBe(4)
    expect(assassin.baseDefense).toBe(1)
    expect(assassin.mana).toBe(3)
    expect(assassin.relics).toContain('relic_assassin_thimble')

    const smith = initGameState(123, 'blacksmith', 0)
    expect(smith.maxHp).toBe(74)
    expect(smith.baseAttack).toBe(2)
    expect(smith.baseDefense).toBe(4)
    expect(smith.mana).toBe(2)
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

    expect(canForgeEngravingOnDie(die, 'assassin_poison_dart_1', 2)).toBe(false)
    expect(canForgeEngravingOnDie(die, 'assassin_poison_dart_1', 0)).toBe(true)
    expect(canForgeEngravingOnDie(die, 'assassin_twin_fang_2', 2)).toBe(true)
  })

  it('1ダイス＝1即時行動：技タップの瞬間にプレビュー通りに敵HP・シールド・毒・MPが即反映されること', () => {
    let state = initGameState(100, 'mage', 0)
    state.enemy.maxHp = 200
    state.enemy.hp = 200
    // 出目6の強斬撃（会心ボーナス）、出目1の毒連撃（2連+猛毒）、出目4の鉄壁盾（偶数強化）、MP3魔導砲を検証
    state.dice[0].currentPip = 6
    state.dice[0].currentEngravingId = 'base_6'
    state.dice[1].currentPip = 1
    state.dice[1].currentEngravingId = 'base_1'
    state.dice[2].currentPip = 4
    state.dice[2].currentEngravingId = 'base_4'
    state.dice[3].currentPip = 5
    state.dice[3].currentEngravingId = 'base_5'

    const enemyStartHp = state.enemy.hp
    const strikePreview = calculateSingleDieAction(state, state.dice[0], 'strike_1')
    expect(strikePreview.bonusTriggered).toBe(true)
    expect(strikePreview.damage).toBeGreaterThan(10)

    state = step(state, { type: 'ASSIGN_DIE', dieId: 0, slotId: 'strike_1' })
    expect(state.dice[0].assignedSlot).toBe('strike_1')
    expect(state.enemy.hp).toBe(Math.max(0, enemyStartHp - strikePreview.damage))

    // 毒連撃（出目1）
    const poisonPreview = calculateSingleDieAction(state, state.dice[1], 'strike_2')
    expect(poisonPreview.bonusTriggered).toBe(true)
    expect(poisonPreview.hits).toBeGreaterThanOrEqual(2)
    expect(poisonPreview.poisonApplied).toBeGreaterThanOrEqual(4)
    state = step(state, { type: 'ASSIGN_DIE', dieId: 1, slotId: 'strike_2' })
    expect(state.enemy.poison).toBeGreaterThanOrEqual(4)

    // 鉄壁盾（出目4 偶数）
    const guardPreview = calculateSingleDieAction(state, state.dice[2], 'guard_1')
    expect(guardPreview.bonusTriggered).toBe(true)
    expect(guardPreview.shieldGain).toBeGreaterThan(6)
    state = step(state, { type: 'ASSIGN_DIE', dieId: 2, slotId: 'guard_1' })
    expect(state.shield).toBe(guardPreview.shieldGain)

    // 魔導砲（初期MP4 >= 3 なのでMP3消費の必殺砲が発動）
    const arcanaPreview = calculateSingleDieAction(state, state.dice[3], 'arcana_1')
    expect(arcanaPreview.isOverchargeBlast).toBe(true)
    expect(arcanaPreview.manaConsumed).toBe(3)
    const manaBefore = state.mana
    state = step(state, { type: 'ASSIGN_DIE', dieId: 3, slotId: 'arcana_1' })
    expect(state.mana).toBe(manaBefore - 3 + arcanaPreview.manaGain)
  })

  it('未配置でも手札4ダイスの役倍率が即座に決定し、ステージ突破で自動レベルアップ＆自動スキル組み込みが行われること', () => {
    const state = initGameState(2026, 'mage', 0)
    state.dice[0].currentPip = 2
    state.dice[1].currentPip = 2
    state.dice[2].currentPip = 4
    state.dice[3].currentPip = 5

    const handPreview = calculateTurnPreview(state)
    expect(handPreview.formation.id).toBe('one_pair')
    expect(handPreview.finalMult).toBeGreaterThanOrEqual(1.25)

    // 1回の攻撃で敵を撃破すると即座に報酬フェーズへ移行
    state.enemy.hp = 1
    const postBattle = step(state, { type: 'ASSIGN_DIE', dieId: 0, slotId: 'strike_1' })
    expect(postBattle.phase).toBe('reward')
    expect(postBattle.rewardOffer?.nextFloorChoices).toEqual(['elite'])

    const beforeMaxHp = postBattle.maxHp
    const beforeAtk = postBattle.baseAttack
    const chosenEng = postBattle.rewardOffer!.engravings[0]
    const stage2 = step(postBattle, {
      type: 'CHOOSE_REWARD',
      engravingId: chosenEng,
      nextNodeType: 'elite',
    })
    expect(stage2.phase).toBe('battle')
    expect(stage2.floor).toBe(2)
    expect(stage2.maxHp).toBe(beforeMaxHp + 3)
    expect(stage2.baseAttack).toBe(beforeAtk + 1)
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

    const state = initGameState(999, 'blacksmith', 0)
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

  it('previewAfterSingleAction が照準時の敵HP・KILL判定・完全ガード判定を誤差ゼロで算出すること', () => {
    const state = initGameState(321, 'blacksmith', 0)
    state.enemy.hp = 12
    state.enemy.maxHp = 40
    state.enemy.shield = 0
    state.enemy.currentIntent = {
      type: 'attack',
      damage: 10,
      hits: 1,
      shieldGain: 0,
      strengthGain: 0,
      label: '攻撃',
    }
    state.dice[0].currentPip = 6
    state.dice[0].currentEngravingId = 'base_6'
    state.dice[1].currentPip = 4
    state.dice[1].currentEngravingId = 'base_4'

    const strikePred = previewAfterSingleAction(state, state.dice[0], 'strike_1')
    expect(strikePred.willKillEnemyNow).toBe(true)
    expect(strikePred.enemyHpAfter).toBe(0)

    state.enemy.hp = 50
    const guardPred = previewAfterSingleAction(state, state.dice[1], 'guard_1')
    expect(guardPred.willKillEnemyNow).toBe(false)
    expect(guardPred.heroShieldAfter).toBeGreaterThanOrEqual(10)
    expect(guardPred.isFullGuard).toBe(true)
    expect(guardPred.expectedUnblockedAfter).toBe(0)
  })
})
