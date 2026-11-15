import {
  ENGRAVINGS,
  ENEMY_TEMPLATES,
  RELICS,
  STARTER_CLASSES,
  type EnemyTemplate,
} from './data'
import type {
  BuildArchetype,
  DiceFace,
  DieState,
  EngravingId,
  EnemyState,
  FormationInfo,
  GameAction,
  GameState,
  Observation,
  Policy,
  RelicId,
  RewardOffer,
  RunResult,
  SlotCategory,
  SlotId,
  StarterClassId,
  TurnPreview,
  TurnSynergyStep,
} from './types'

export const ALL_SLOT_IDS: SlotId[] = [
  'strike_1',
  'strike_2',
  'guard_1',
  'arcana_1',
  'alchemy_1',
]

export function getSlotCategory(slotId: SlotId): SlotCategory {
  if (slotId === 'strike_1' || slotId === 'strike_2') return 'strike'
  if (slotId === 'guard_1') return 'guard'
  if (slotId === 'arcana_1') return 'arcana'
  return 'alchemy'
}

/** シード付き乱数（mulberry32）。ロジック内で Math.random() は一切使用しない */
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

function nextRandom(state: GameState): number {
  let a = (state.rngState + 0x6d2b79f5) >>> 0
  state.rngState = a
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function randInt(state: GameState, min: number, maxInclusive: number): number {
  const r = nextRandom(state)
  return min + Math.floor(r * (maxInclusive - min + 1))
}

function pickRandom<T>(state: GameState, items: T[]): T {
  return items[Math.floor(nextRandom(state) * items.length)]
}

function shufflePick<T>(state: GameState, items: T[], count: number): T[] {
  const copy = [...items]
  const out: T[] = []
  while (copy.length > 0 && out.length < count) {
    const idx = Math.floor(nextRandom(state) * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return out
}

function getAreaForFloor(floor: number): number {
  if (floor <= 4) return 1
  if (floor <= 8) return 2
  return 3
}

function getBossTemplateForArea(area: number): EnemyTemplate {
  return (
    ENEMY_TEMPLATES.find((e) => e.area === area && e.isBoss) ??
    ENEMY_TEMPLATES[ENEMY_TEMPLATES.length - 1]
  )
}

function spawnEnemyForFloor(
  state: GameState,
  floor: number,
  nodeType: 'normal' | 'elite' | 'boss'
): EnemyState {
  const area = getAreaForFloor(floor)
  let candidates = ENEMY_TEMPLATES.filter((e) => e.area === area)
  if (nodeType === 'boss' || floor % 4 === 0) {
    candidates = candidates.filter((e) => e.isBoss)
  } else if (nodeType === 'elite') {
    candidates = candidates.filter((e) => e.isElite)
  } else {
    candidates = candidates.filter((e) => !e.isBoss && !e.isElite)
  }
  if (candidates.length === 0) {
    candidates = ENEMY_TEMPLATES.filter((e) => e.area === area)
  }
  const tpl = pickRandom(state, candidates)

  const floorScale = 1 + (floor - 1) * 0.08 + state.ascension * 0.12
  const maxHp = Math.round(tpl.baseHp * floorScale)
  const scaledPatterns = tpl.intentPattern.map((intent) => ({
    ...intent,
    damage: Math.round(intent.damage * (1 + (floor - 1) * 0.03 + state.ascension * 0.1)),
  }))

  return {
    id: tpl.id,
    name: tpl.name,
    area,
    isElite: tpl.isElite,
    isBoss: tpl.isBoss,
    icon: tpl.icon,
    maxHp,
    hp: maxHp,
    shield: 0,
    poison: state.relics.includes('relic_venom_heart') ? 10 : 0,
    thorns: tpl.trait === 'thorns_shell' ? (area === 1 ? 2 : 3) : 0,
    strength: 0,
    trait: tpl.trait,
    traitName: tpl.traitName,
    traitDescription: tpl.traitDescription,
    damageCap: tpl.damageCap,
    intentPattern: scaledPatterns,
    intentIndex: 0,
    currentIntent: scaledPatterns[0],
  }
}

function createInitialDice(
  classId: StarterClassId
): [DieState, DieState, DieState, DieState] {
  const cls = STARTER_CLASSES[classId]
  const dieNames = ['紅蓮のダイス', '蒼氷のダイス', '翠風のダイス', '黄金のダイス']
  return cls.initialDiceEngravings.map((engList, dieIdx) => {
    const faces = engList.map((engId, faceIndex) => ({
      faceIndex,
      pip: ENGRAVINGS[engId].pip,
      engravingId: engId,
    })) as [DiceFace, DiceFace, DiceFace, DiceFace, DiceFace, DiceFace]
    return {
      id: dieIdx,
      name: dieNames[dieIdx],
      faces,
      rolledFaceIndex: 0,
      currentPip: faces[0].pip,
      currentEngravingId: faces[0].engravingId,
      locked: false,
      assignedSlot: null,
      cantripUsedThisTurn: false,
    }
  }) as [DieState, DieState, DieState, DieState]
}

/**
 * 1つのダイスに同一の特殊刻印（base_1〜6以外）は最大2面まで（1強ハメ防止ルール）
 */
export function canForgeEngravingOnDie(
  die: DieState,
  engravingId: EngravingId,
  targetFaceIndex: number
): boolean {
  if (engravingId.startsWith('base_')) return true
  const sameCountOnOtherFaces = die.faces.filter(
    (f, idx) => idx !== targetFaceIndex && f.engravingId === engravingId
  ).length
  return sameCountOnOtherFaces < 2
}

function rollAllUnlockedDice(state: GameState): void {
  for (const die of state.dice) {
    if (!die.locked && die.assignedSlot === null) {
      const fIdx = randInt(state, 0, 5)
      die.rolledFaceIndex = fIdx
      die.currentPip = die.faces[fIdx].pip
      die.currentEngravingId = die.faces[fIdx].engravingId
    }
  }
}

function startTurnSetup(state: GameState): void {
  const hasBarricade = state.relics.includes('relic_barricade_core')
  if (hasBarricade) {
    state.shield = Math.min(35, state.shield)
  } else {
    state.shield = 0
  }

  if (state.turn === 1 && state.relics.includes('relic_knight_vow')) {
    state.shield += 12
  }
  if (state.relics.includes('relic_lucky_clover')) {
    state.shield += 4
  }
  if (state.relics.includes('relic_chrono_compass')) {
    state.shield += 3
    state.mana = Math.min(state.maxMana, state.mana + 1)
  }
  if (state.relics.includes('relic_ether_reactor')) {
    state.mana = Math.min(state.maxMana, state.mana + 2)
    state.shield += state.mana * 2
  }
  if (state.relics.includes('relic_iron_anvil')) {
    state.thornsThisBattle += 4
  }
  if (state.relics.includes('relic_phoenix_feather')) {
    state.hp = Math.min(state.maxHp, state.hp + 2)
  }

  let bonusRerolls = 0
  if (state.relics.includes('relic_astral_hourglass')) bonusRerolls += 1
  if (state.relics.includes('relic_chrono_compass')) bonusRerolls += 1
  state.rerollsLeft = state.maxRerolls + bonusRerolls

  state.slots = {
    strike_1: null,
    strike_2: null,
    guard_1: null,
    arcana_1: null,
    alchemy_1: null,
  }
  for (const die of state.dice) {
    die.locked = false
    die.assignedSlot = null
    die.cantripUsedThisTurn = false
  }
  rollAllUnlockedDice(state)
}

export function initGameState(
  seed: number,
  classId: StarterClassId = 'mage',
  ascension = 0
): GameState {
  const cls = STARTER_CLASSES[classId]
  const initialRelics: RelicId[] = [cls.startingRelic]
  const bossTpl = getBossTemplateForArea(1)

  const state: GameState = {
    seed,
    rngState: seed >>> 0,
    ascension,
    starterClass: classId,
    phase: 'battle',
    floor: 1,
    area: 1,
    turn: 1,
    hp: cls.maxHp,
    maxHp: cls.maxHp,
    shield: 0,
    mana: cls.startingMana,
    maxMana: 10,
    gold: cls.startingGold,
    rerollsLeft: 2,
    maxRerolls: 2,
    alchemyUsesThisBattle: 0,
    maxAlchemyUsesPerBattle: 2,
    evenPermBonusThisBattle: 0,
    strengthThisBattle: 0,
    thornsThisBattle: 0,
    dice: createInitialDice(classId),
    slots: {
      strike_1: null,
      strike_2: null,
      guard_1: null,
      arcana_1: null,
      alchemy_1: null,
    },
    relics: initialRelics,
    enemy: null as unknown as EnemyState,
    upcomingBoss: {
      name: bossTpl.name,
      icon: bossTpl.icon,
      traitName: bossTpl.traitName,
      traitDescription: bossTpl.traitDescription,
    },
    rewardOffer: null,
    combatLog: [`🏰 Floor 1（エリア1）に突入！ボス予告：${bossTpl.name}`],
    stats: {
      turnsPlayed: 0,
      totalDamageDealt: 0,
      maxSingleTurnDamage: 0,
      enemiesDefeated: 0,
      engravingsForged: 0,
    },
  }

  state.enemy = spawnEnemyForFloor(state, 1, 'normal')
  startTurnSetup(state)
  return state
}

/**
 * 配置されたダイスの出目から「共鳴役（Formation Combo）」と倍率を計算する
 */
export function evaluateFormation(
  pips: number[],
  hasArcaneCrown: boolean,
  extraComboAdd = 0
): FormationInfo {
  if (pips.length === 0) {
    return {
      id: 'none',
      name: '未配置',
      baseMult: 1.0,
      isAllEven: false,
      isAllOdd: false,
      isOverload18: false,
      isOverload20: false,
      totalMult: 1.0,
      badges: [],
    }
  }

  const counts = new Map<number, number>()
  for (const p of pips) {
    counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  const freq = Array.from(counts.values()).sort((a, b) => b - a)
  const sortedUnique = Array.from(counts.keys()).sort((a, b) => a - b)

  let isStraight = false
  if (pips.length >= 4 && sortedUnique.length === 4) {
    if (sortedUnique[3] - sortedUnique[0] === 3) {
      isStraight = true
    }
  }

  let id: FormationInfo['id'] = 'none'
  let name = 'ハイロール'
  let baseMult = 1.0

  if (freq[0] >= 4) {
    id = 'four_kind'
    name = 'フォーカード'
    baseMult = 2.4
  } else if (freq[0] === 3) {
    id = 'three_kind'
    name = 'スリーカード'
    baseMult = 1.8
  } else if (isStraight) {
    id = 'straight'
    name = 'ストレート'
    baseMult = 1.75
  } else if (freq[0] === 2 && freq[1] === 2) {
    id = 'two_pair'
    name = 'ツーペア'
    baseMult = 1.5
  } else if (freq[0] === 2) {
    id = 'one_pair'
    name = 'ワンペア'
    baseMult = 1.25
  }

  const badges: string[] = []
  if (id !== 'none') {
    badges.push(`${name} ×${baseMult.toFixed(2)}`)
  }

  const isAllEven = pips.length >= 3 && pips.every((p) => p % 2 === 0)
  const isAllOdd = pips.length >= 3 && pips.every((p) => p % 2 === 1)
  const sum = pips.reduce((a, b) => a + b, 0)
  const isOverload18 = sum >= 16
  const isOverload20 = sum >= 20

  let mult = baseMult + extraComboAdd
  if (isAllEven) {
    mult += 0.35
    badges.push('オール偶数 +0.35x')
  } else if (isAllOdd) {
    mult += 0.35
    badges.push('オール奇数 +0.35x')
  }

  if (isOverload20) {
    mult = mult * 1.25
    badges.push('OVERLOAD 20+ ×1.25')
  } else if (isOverload18) {
    mult += 0.2
    badges.push('高出力16+ +0.20x')
  }

  if (hasArcaneCrown && mult > 1.0) {
    mult = 1.0 + (mult - 1.0) * 1.35
    badges.push('王冠増幅')
  }

  return {
    id,
    name,
    baseMult,
    isAllEven,
    isAllOdd,
    isOverload18,
    isOverload20,
    totalMult: Number(mult.toFixed(2)),
    badges,
  }
}

/**
 * 現在のスロット配置から、ターン実行時の結果プレビューを計算する（UI＆実行＆ボット共通）
 */
export function calculateTurnPreview(state: GameState): TurnPreview {
  const assignedDice: { slotId: SlotId; die: DieState }[] = []
  for (const slotId of ALL_SLOT_IDS) {
    const dieId = state.slots[slotId]
    if (dieId !== null && dieId !== undefined) {
      const die = state.dice.find((d) => d.id === dieId)
      if (die) assignedDice.push({ slotId, die })
    }
  }

  const pips = assignedDice.map((a) => a.die.currentPip)
  let extraComboAdd = state.relics.includes('relic_lucky_clover') ? 0.2 : 0
  for (const { die } of assignedDice) {
    const eng = ENGRAVINGS[die.currentEngravingId]
    if (eng.comboMultAdd) extraComboAdd += eng.comboMultAdd
  }

  const formation = evaluateFormation(
    pips,
    state.relics.includes('relic_arcane_crown'),
    extraComboAdd
  )

  // レリック乗算倍率の計算
  let relicMult = 1.0
  const lowPipCount = pips.filter((p) => p <= 2).length
  const highPipCount = pips.filter((p) => p >= 5).length

  if (state.relics.includes('relic_twin_daggers') && lowPipCount >= 2) {
    relicMult *= 1.35
  }
  if (state.relics.includes('relic_even_cogwheel') && formation.isAllEven) {
    relicMult *= 1.35
  }
  if (state.relics.includes('relic_star_grimoire') && highPipCount > 0) {
    relicMult *= 1 + highPipCount * 0.2
  }
  if (state.relics.includes('relic_golden_scales') && formation.isOverload18) {
    relicMult *= 1.4
  }
  if (
    state.relics.includes('relic_phoenix_feather') &&
    state.hp <= state.maxHp * 0.5
  ) {
    relicMult *= 1.35
  }

  let rawAttackSum = 0
  let totalHits = 0
  let rawShieldSum = 0
  let totalManaGain = 0
  let totalPoisonApplied = 0
  let totalThornsGain = 0
  let totalHeal = 0
  let totalGoldGain = 0
  let poisonMultiplier = 1.0
  let shieldBashRatioSum = 0

  const hasThimble = state.relics.includes('relic_assassin_thimble')
  const hasShadowCloak = state.relics.includes('relic_shadow_cloak')
  const hasCogwheel = state.relics.includes('relic_even_cogwheel')
  const hasHourglass = state.relics.includes('relic_astral_hourglass')
  const hasDragonEye = state.relics.includes('relic_dragon_eye')
  const hasSagePrism = state.relics.includes('relic_sage_prism')

  // 先にマナ獲得・シールド・バフ系を集計し、そのあと盾撃やマナオーバーチャージを計算する
  for (const { slotId, die } of assignedDice) {
    const category = getSlotCategory(slotId)
    const eng = ENGRAVINGS[die.currentEngravingId]
    let effectivePip = die.currentPip

    if (die.currentPip % 2 === 0) {
      effectivePip += state.evenPermBonusThisBattle
    }
    if (hasHourglass && die.currentPip >= 5) {
      effectivePip += 3
    }
    if (hasDragonEye) {
      effectivePip += 3
    }

    if (hasShadowCloak && die.currentPip <= 2) {
      rawShieldSum += 4
    }
    if (hasThimble && die.currentPip <= 2) {
      rawShieldSum += 2
    }
    if (hasCogwheel && die.currentPip % 2 === 0) {
      rawShieldSum += 3
    }

    // 刻印固有のサブ効果
    if (eng.bonusMana) totalManaGain += eng.bonusMana
    if (eng.applyThorns) totalThornsGain += eng.applyThorns
    if (eng.healHp) totalHeal += eng.healHp
    if (
      eng.goldGain &&
      state.alchemyUsesThisBattle < state.maxAlchemyUsesPerBattle
    ) {
      totalGoldGain += eng.goldGain
    }

    if (category === 'guard') {
      rawShieldSum +=
        effectivePip + (eng.bonusShield ?? 0) + Math.floor((eng.bonusAttack ?? 0) * 0.5)
      if (eng.applyPoison) totalPoisonApplied += Math.ceil(eng.applyPoison * 0.5)
    } else if (category === 'strike') {
      const hits = eng.multiHit ?? 1
      let perHit =
        effectivePip + (eng.bonusAttack ?? 0) + state.strengthThisBattle
      if (hasThimble && die.currentPip <= 2) {
        perHit += 5
        totalPoisonApplied += 3
      }
      if (hasCogwheel && die.currentPip % 2 === 0) {
        perHit += 2
      }
      rawAttackSum += perHit * hits
      totalHits += hits
      if (eng.applyPoison) totalPoisonApplied += eng.applyPoison
      if (eng.multiplyEnemyPoison) poisonMultiplier *= eng.multiplyEnemyPoison
      if (eng.bonusShield) rawShieldSum += Math.floor(eng.bonusShield * 0.5)
      if (eng.shieldBashRatio) shieldBashRatioSum += eng.shieldBashRatio
    } else if (category === 'arcana') {
      const arcanaScale = hasSagePrism ? 1.5 : 1.0
      const manaFromSlot = Math.ceil(
        (effectivePip * 0.5 + (eng.bonusMana ?? 1)) * arcanaScale
      )
      totalManaGain += manaFromSlot
      const magicDmg = Math.round(
        (effectivePip + (eng.bonusAttack ?? 2)) * arcanaScale
      )
      rawAttackSum += magicDmg
      totalHits += 1
      if (eng.applyPoison) totalPoisonApplied += eng.applyPoison
      if (eng.bonusShield) rawShieldSum += Math.floor(eng.bonusShield * 0.5)
    } else if (category === 'alchemy') {
      if (state.alchemyUsesThisBattle < state.maxAlchemyUsesPerBattle) {
        totalPoisonApplied +=
          Math.ceil(effectivePip * 1.2) + 2 + (eng.applyPoison ?? 0)
        if (eng.multiplyEnemyPoison) {
          poisonMultiplier *= eng.multiplyEnemyPoison
        }
        rawShieldSum += Math.ceil(effectivePip * 0.6) + (eng.bonusShield ?? 0)
        totalGoldGain += 5
      } else {
        // 戦闘内2回上限到達後は小シールド変換のみ（遅延ハメ防止）
        rawShieldSum += Math.ceil(effectivePip * 0.5)
      }
    }

    if (eng.manaOverchargeScale) {
      const projectedMana = Math.min(state.maxMana, state.mana + totalManaGain)
      rawAttackSum += projectedMana * eng.manaOverchargeScale
    }
  }

  let shieldMult = formation.totalMult
  if (state.relics.includes('relic_knight_vow')) {
    shieldMult *= 1.35
  }
  const totalShieldGain = Math.floor(rawShieldSum * shieldMult)
  const projectedTotalShield = state.shield + totalShieldGain

  if (shieldBashRatioSum > 0) {
    rawAttackSum += Math.floor(projectedTotalShield * shieldBashRatioSum)
    if (totalHits === 0) totalHits = 1
  }

  if (state.relics.includes('relic_spiked_buckler') && totalShieldGain > 0) {
    rawAttackSum += Math.floor(totalShieldGain * 0.6)
    if (totalHits === 0) totalHits = 1
  }

  if (
    state.relics.includes('relic_golem_heart') &&
    projectedTotalShield >= 15
  ) {
    relicMult *= 1.45
  }

  const projectedPoisonOnEnemy = Math.floor(
    (state.enemy.poison + totalPoisonApplied) * poisonMultiplier
  )
  totalPoisonApplied = Math.max(0, projectedPoisonOnEnemy - state.enemy.poison)

  if (
    state.relics.includes('relic_venom_heart') &&
    projectedPoisonOnEnemy > 0
  ) {
    relicMult *= 1.4
  }

  const finalMult = Number((formation.totalMult * relicMult).toFixed(2))
  let totalDamage = Math.floor(rawAttackSum * finalMult)

  if (
    state.relics.includes('relic_corrosive_flask') &&
    totalPoisonApplied > 0
  ) {
    totalDamage += totalPoisonApplied
  }
  if (state.relics.includes('relic_golden_scales') && formation.isOverload18) {
    totalDamage += 8
  }

  // 敵の単発ダメージキャップ特性
  if (
    state.enemy.trait === 'damage_cap' &&
    state.enemy.damageCap &&
    totalDamage > state.enemy.damageCap * Math.max(1, totalHits)
  ) {
    totalDamage = state.enemy.damageCap * Math.max(1, totalHits)
  }

  // 敵の毒ティックダメージ予測
  const poisonTickDamage = state.relics.includes('relic_serpent_idol')
    ? Math.floor(projectedPoisonOnEnemy * 1.5)
    : projectedPoisonOnEnemy

  const effectiveDamageToEnemy = Math.max(
    0,
    totalDamage - state.enemy.shield
  ) + poisonTickDamage

  const enemyWillDie = effectiveDamageToEnemy >= state.enemy.hp

  // 敵からの被ダメージ予測（棘反射による自傷＋敵の予告攻撃）
  let thornsSelfDamage = 0
  if (state.enemy.thorns > 0 && totalHits > 0) {
    thornsSelfDamage = state.enemy.thorns * totalHits
  }

  let enemyAttackRaw = 0
  if (!enemyWillDie) {
    const intent = state.enemy.currentIntent
    const perHit = intent.damage + state.enemy.strength
    enemyAttackRaw = perHit * (intent.hits || 1)
    if (
      state.relics.includes('relic_serpent_idol') &&
      projectedPoisonOnEnemy > 0
    ) {
      enemyAttackRaw = Math.floor(enemyAttackRaw * 0.75)
    }
  }

  const totalIncoming = thornsSelfDamage + enemyAttackRaw
  const unblockedDamage = Math.max(0, totalIncoming - projectedTotalShield)
  const expectedHpAfterTurn = Math.max(
    0,
    Math.min(state.maxHp, state.hp + totalHeal - unblockedDamage)
  )

  const synergySteps: TurnSynergyStep[] = [
    {
      label: '基礎出力',
      detail: `⚔️${rawAttackSum} / 🛡️${rawShieldSum}`,
      color: 'sky',
    },
    {
      label: `共鳴役 (${formation.name})`,
      detail: `×${formation.totalMult.toFixed(2)}`,
      color: 'amber',
    },
    {
      label: '遺物乗算',
      detail: `×${relicMult.toFixed(2)}`,
      color: 'violet',
    },
    {
      label: '最終確定',
      detail: `${totalDamage} DMG / +${totalShieldGain} 🛡️`,
      color: 'rose',
    },
  ]

  return {
    formation,
    relicMult: Number(relicMult.toFixed(2)),
    finalMult,
    totalDamage,
    totalHits,
    totalShieldGain,
    totalManaGain,
    totalPoisonApplied,
    totalThornsGain,
    totalHeal,
    totalGoldGain,
    expectedIncomingDamage: unblockedDamage,
    expectedHpAfterTurn,
    synergySteps,
  }
}

function generateRewardOffer(state: GameState): RewardOffer {
  const allEngIds = (Object.keys(ENGRAVINGS) as EngravingId[]).filter(
    (id) => !id.startsWith('base_')
  )
  // クラスと所持レリックに合った系統を少し出やすくしつつ多様性を確保
  const OfferEngs = shufflePick(state, allEngIds, 3)

  const unownedRelics = (Object.keys(RELICS) as RelicId[]).filter(
    (id) => !state.relics.includes(id)
  )
  const OfferRelics =
    state.enemy.isElite || state.enemy.isBoss || state.floor % 2 === 1
      ? shufflePick(state, unownedRelics, 3)
      : []

  const nextFloor = state.floor + 1
  const posInArea = ((nextFloor - 1) % 4) + 1
  let nextFloorChoices: RewardOffer['nextFloorChoices'] = ['normal']
  if (posInArea === 2) {
    nextFloorChoices = ['elite', 'altar']
  } else if (posInArea === 3) {
    nextFloorChoices = ['shop', 'normal']
  } else if (posInArea === 4) {
    nextFloorChoices = ['boss']
  }

  return {
    engravings: OfferEngs,
    relics: OfferRelics,
    nextFloorChoices,
  }
}

function advanceToNextFloor(
  state: GameState,
  nextNodeType: 'normal' | 'elite' | 'altar' | 'shop' | 'boss'
): void {
  state.floor += 1
  state.area = getAreaForFloor(state.floor)
  const bossTpl = getBossTemplateForArea(state.area)
  state.upcomingBoss = {
    name: bossTpl.name,
    icon: bossTpl.icon,
    traitName: bossTpl.traitName,
    traitDescription: bossTpl.traitDescription,
  }

  if (nextNodeType === 'altar') {
    state.phase = 'altar'
    state.combatLog.unshift(`⛩️ Floor ${state.floor}: 秘境の魔導祭壇を発見した。`)
    return
  }
  if (nextNodeType === 'shop') {
    state.phase = 'shop'
    state.rewardOffer = generateRewardOffer(state)
    state.combatLog.unshift(`🏪 Floor ${state.floor}: 鍛冶屋＆魔導商店に到着した。`)
    return
  }

  startBattleOnCurrentFloor(
    state,
    nextNodeType === 'elite'
      ? 'elite'
      : nextNodeType === 'boss' || state.floor % 4 === 0
        ? 'boss'
        : 'normal'
  )
}

function startBattleOnCurrentFloor(
  state: GameState,
  battleType: 'normal' | 'elite' | 'boss'
): void {
  state.phase = 'battle'
  state.turn = 1
  state.shield = 0
  state.alchemyUsesThisBattle = 0
  state.evenPermBonusThisBattle = 0
  state.strengthThisBattle = 0
  state.thornsThisBattle = 0
  state.rewardOffer = null
  state.enemy = spawnEnemyForFloor(state, state.floor, battleType)
  startTurnSetup(state)
  state.combatLog.unshift(
    `⚔️ Floor ${state.floor}: ${state.enemy.name} (HP ${state.enemy.maxHp}) が立ち塞がる！`
  )
}

/**
 * 純粋関数による状態遷移 step(state, action)
 */
export function step(prevState: GameState, action: GameAction): GameState {
  const state: GameState = structuredClone(prevState)

  switch (action.type) {
    case 'SELECT_CLASS': {
      return initGameState(
        state.seed,
        action.classId,
        action.ascension ?? state.ascension
      )
    }

    case 'REROLL_DICE': {
      if (state.phase !== 'battle' || state.rerollsLeft <= 0) return state
      const lockSet = new Set(action.lockDieIds)
      for (const die of state.dice) {
        if (die.assignedSlot === null) {
          die.locked = lockSet.has(die.id)
        }
      }
      rollAllUnlockedDice(state)
      state.rerollsLeft -= 1
      return state
    }

    case 'MANIPULATE_DIE': {
      if (state.phase !== 'battle' || state.mana < 1) return state
      const die = state.dice.find((d) => d.id === action.dieId)
      if (!die) return state
      state.mana -= 1
      if (action.mode === 'plus1') {
        die.currentPip = Math.min(8, die.currentPip + 1)
      } else if (action.mode === 'minus1') {
        die.currentPip = Math.max(1, die.currentPip - 1)
      } else if (action.mode === 'flip') {
        die.currentPip = Math.max(1, Math.min(6, 7 - die.currentPip))
      }
      if (state.relics.includes('relic_sage_prism')) {
        const dmg = 6
        const blocked = Math.min(state.enemy.shield, dmg)
        state.enemy.shield -= blocked
        state.enemy.hp = Math.max(0, state.enemy.hp - (dmg - blocked))
        state.stats.totalDamageDealt += dmg
      }
      return state
    }

    case 'ASSIGN_DIE': {
      if (state.phase !== 'battle') return state
      const die = state.dice.find((d) => d.id === action.dieId)
      if (!die) return state

      // 既に別スロットに割り当てられていれば解除
      for (const sId of ALL_SLOT_IDS) {
        if (state.slots[sId] === die.id) {
          state.slots[sId] = null
        }
      }

      if (action.slotId === null) {
        die.assignedSlot = null
        return state
      }

      // 対象スロットに別のダイスがあればトレイに戻す
      const existingDieId = state.slots[action.slotId]
      if (existingDieId !== null && existingDieId !== undefined) {
        const prevDie = state.dice.find((d) => d.id === existingDieId)
        if (prevDie) prevDie.assignedSlot = null
      }

      state.slots[action.slotId] = die.id
      die.assignedSlot = action.slotId

      // 刻印による他ダイス出目ブースト（配置時に未配置ダイス1個を強化）
      const eng = ENGRAVINGS[die.currentEngravingId]
      if (eng.boostOtherPip && !die.cantripUsedThisTurn) {
        const other = state.dice.find(
          (d) => d.id !== die.id && d.assignedSlot === null
        )
        if (other) {
          other.currentPip = Math.min(8, other.currentPip + eng.boostOtherPip)
          die.cantripUsedThisTurn = true
        }
      }

      return state
    }

    case 'EXECUTE_TURN': {
      if (state.phase !== 'battle') return state
      const preview = calculateTurnPreview(state)
      state.stats.turnsPlayed += 1

      // 永続偶数強化やリロール獲得の処理
      let nextTurnExtraRerolls = 0
      let usedAlchemy = false
      for (const sId of ALL_SLOT_IDS) {
        const dId = state.slots[sId]
        if (dId !== null) {
          const die = state.dice.find((d) => d.id === dId)
          if (die) {
            const eng = ENGRAVINGS[die.currentEngravingId]
            if (eng.permanentEvenBonus) {
              state.evenPermBonusThisBattle += eng.permanentEvenBonus
            }
            if (eng.rerollGain) {
              nextTurnExtraRerolls += eng.rerollGain
            }
            if (getSlotCategory(sId) === 'alchemy' || eng.goldGain) {
              usedAlchemy = true
            }
          }
        }
      }
      if (usedAlchemy) {
        state.alchemyUsesThisBattle += 1
      }

      state.shield += preview.totalShieldGain
      state.mana = Math.min(state.maxMana, state.mana + preview.totalManaGain)
      state.thornsThisBattle += preview.totalThornsGain
      state.gold += preview.totalGoldGain
      if (preview.totalHeal > 0) {
        state.hp = Math.min(state.maxHp, state.hp + preview.totalHeal)
      }

      // 敵へのダメージ適用
      let dmgToDeal = preview.totalDamage
      const blockedByEnemy = Math.min(state.enemy.shield, dmgToDeal)
      state.enemy.shield -= blockedByEnemy
      dmgToDeal -= blockedByEnemy
      state.enemy.hp = Math.max(0, state.enemy.hp - dmgToDeal)

      state.stats.totalDamageDealt += preview.totalDamage
      if (preview.totalDamage > state.stats.maxSingleTurnDamage) {
        state.stats.maxSingleTurnDamage = preview.totalDamage
      }

      // 猛毒付与＆猛毒ダメージ解決
      if (preview.totalPoisonApplied > 0) {
        state.enemy.poison += preview.totalPoisonApplied
      }
      if (state.enemy.poison > 0 && state.enemy.hp > 0) {
        const poisonDmg = state.relics.includes('relic_serpent_idol')
          ? Math.floor(state.enemy.poison * 1.5)
          : state.enemy.poison
        state.enemy.hp = Math.max(0, state.enemy.hp - poisonDmg)
        state.stats.totalDamageDealt += poisonDmg
        state.enemy.poison = Math.max(0, state.enemy.poison - 1)
      }

      // 敵の棘甲による反射被弾
      if (state.enemy.thorns > 0 && preview.totalHits > 0) {
        const selfThornDmg = state.enemy.thorns * preview.totalHits
        const abs = Math.min(state.shield, selfThornDmg)
        state.shield -= abs
        state.hp = Math.max(0, state.hp - (selfThornDmg - abs))
      }

      // 敵撃破判定
      if (state.enemy.hp <= 0) {
        state.stats.enemiesDefeated += 1
        let rewardGold = state.enemy.isBoss
          ? 55
          : state.enemy.isElite
            ? 38
            : 24
        if (state.relics.includes('relic_merchant_coin')) rewardGold += 18
        state.gold += rewardGold

        if (state.relics.includes('relic_vampire_chalice')) {
          state.maxHp += 4
          state.hp = Math.min(state.maxHp, state.hp + 10)
        } else {
          state.hp = Math.min(state.maxHp, state.hp + 5)
        }

        if (state.floor >= 12) {
          state.phase = 'victory'
          state.combatLog.unshift(
            `🏆 最終ボス「${state.enemy.name}」を撃破！運命の塔を完全制覇した！`
          )
          return state
        }

        state.phase = 'reward'
        state.rewardOffer = generateRewardOffer(state)
        state.combatLog.unshift(
          `✨ ${state.enemy.name} を撃破！（+${rewardGold}G）鍛造報酬を選択しよう。`
        )
        return state
      }

      // 敵が生存している場合：敵のターン行動解決
      const intent = state.enemy.currentIntent
      state.enemy.shield = intent.shieldGain
      let totalEnemyAttack =
        (intent.damage + state.enemy.strength) * (intent.hits || 1)
      if (
        state.relics.includes('relic_serpent_idol') &&
        state.enemy.poison > 0
      ) {
        totalEnemyAttack = Math.floor(totalEnemyAttack * 0.75)
      }

      if (totalEnemyAttack > 0) {
        const absorbed = Math.min(state.shield, totalEnemyAttack)
        state.shield -= absorbed
        const hpLoss = totalEnemyAttack - absorbed
        state.hp = Math.max(0, state.hp - hpLoss)

        if (state.enemy.trait === 'mana_drain' && state.mana > 0) {
          state.mana = Math.max(0, state.mana - 1)
        }

        // プレイヤーの反撃棘（Thorns）による反射ダメージ
        if (state.thornsThisBattle > 0) {
          const thornDmg = state.relics.includes('relic_iron_anvil')
            ? Math.floor(state.thornsThisBattle * 1.5) * (intent.hits || 1)
            : state.thornsThisBattle * (intent.hits || 1)
          state.enemy.hp = Math.max(0, state.enemy.hp - thornDmg)
          state.stats.totalDamageDealt += thornDmg
          if (state.enemy.hp <= 0) {
            state.stats.enemiesDefeated += 1
            state.gold += 25
            if (state.floor >= 12) {
              state.phase = 'victory'
              return state
            }
            state.phase = 'reward'
            state.rewardOffer = generateRewardOffer(state)
            return state
          }
        }
      }

      if (intent.strengthGain > 0) {
        state.enemy.strength += intent.strengthGain
      }

      // 6ターン目以降の長期戦狂暴化（遅延ハメ防止）
      if (state.turn >= 6) {
        state.enemy.strength += 3
      }

      if (state.hp <= 0) {
        state.phase = 'gameover'
        state.combatLog.unshift(`💀 ${state.enemy.name} の攻撃に倒れた…`)
        return state
      }

      // 次ターンへ進む
      state.turn += 1
      state.enemy.intentIndex =
        (state.enemy.intentIndex + 1) % state.enemy.intentPattern.length
      state.enemy.currentIntent =
        state.enemy.intentPattern[state.enemy.intentIndex]

      startTurnSetup(state)
      state.rerollsLeft += nextTurnExtraRerolls
      return state
    }

    case 'CHOOSE_REWARD': {
      if (state.phase !== 'reward' || !state.rewardOffer) return state

      if (action.engravingId !== undefined) {
        const dieId = action.targetDieId ?? 0
        const faceIdx = action.targetFaceIndex ?? 0
        const die = state.dice.find((d) => d.id === dieId) ?? state.dice[0]
        if (canForgeEngravingOnDie(die, action.engravingId, faceIdx)) {
          die.faces[faceIdx] = {
            faceIndex: faceIdx,
            pip: ENGRAVINGS[action.engravingId].pip,
            engravingId: action.engravingId,
          }
          state.stats.engravingsForged += 1
        }
      }

      if (
        action.relicId !== undefined &&
        !state.relics.includes(action.relicId)
      ) {
        if (state.relics.length < 5) {
          state.relics.push(action.relicId)
        } else if (
          action.replaceRelicIndex !== undefined &&
          action.replaceRelicIndex >= 0 &&
          action.replaceRelicIndex < 5
        ) {
          state.relics[action.replaceRelicIndex] = action.relicId
        }
        if (action.relicId === 'relic_golem_heart') {
          state.maxHp += 15
          state.hp += 15
        }
      }

      const nextNode =
        action.nextNodeType ?? state.rewardOffer.nextFloorChoices[0] ?? 'normal'
      advanceToNextFloor(state, nextNode)
      return state
    }

    case 'ALTAR_ACTION': {
      if (state.phase !== 'altar') return state
      if (action.choice === 'heal_full') {
        state.hp = state.maxHp
      } else if (action.choice === 'upgrade_two_faces') {
        const die = state.dice[action.targetDieId ?? 0]
        const pool: EngravingId[] =
          state.starterClass === 'assassin'
            ? ['assassin_Shadow_clone_1' as EngravingId, 'assassin_catalyst_2']
            : state.starterClass === 'blacksmith'
              ? ['fortress_shield_bash_4', 'fortress_aegis_guard_4']
              : ['arcana_starlight_6', 'arcana_wisdom_rune_5']
        const validPool: EngravingId[] = pool.map((id) =>
          ENGRAVINGS[id] ? id : 'arcana_starlight_6'
        )
        for (let i = 0; i < 2; i++) {
          const engId = validPool[i % validPool.length]
          if (canForgeEngravingOnDie(die, engId, i)) {
            die.faces[i] = {
              faceIndex: i,
              pip: ENGRAVINGS[engId].pip,
              engravingId: engId,
            }
            state.stats.engravingsForged += 1
          }
        }
      } else if (action.choice === 'sacrifice_hp_for_relic') {
        state.hp = Math.max(10, state.hp - 12)
        const unowned = (Object.keys(RELICS) as RelicId[]).filter(
          (r) => !state.relics.includes(r)
        )
        if (unowned.length > 0 && state.relics.length < 5) {
          state.relics.push(pickRandom(state, unowned))
        }
      }

      const nextPos = ((state.floor % 4) + 1)
      advanceToNextFloor(state, nextPos === 3 ? 'shop' : 'normal')
      return state
    }

    case 'SHOP_BUY_ENGRAVING': {
      if (state.phase !== 'shop') return state
      const eng = ENGRAVINGS[action.engravingId]
      if (!eng) return state
      const price = state.relics.includes('relic_merchant_coin')
        ? Math.floor(eng.cost * 0.8)
        : eng.cost
      const die = state.dice.find((d) => d.id === action.targetDieId)
      if (
        !die ||
        state.gold < price ||
        !canForgeEngravingOnDie(die, action.engravingId, action.targetFaceIndex)
      ) {
        return state
      }
      state.gold -= price
      die.faces[action.targetFaceIndex] = {
        faceIndex: action.targetFaceIndex,
        pip: eng.pip,
        engravingId: action.engravingId,
      }
      state.stats.engravingsForged += 1
      return state
    }

    case 'SHOP_BUY_RELIC': {
      if (state.phase !== 'shop') return state
      const rel = RELICS[action.relicId]
      if (!rel || state.relics.includes(action.relicId)) return state
      const price = state.relics.includes('relic_merchant_coin')
        ? Math.floor(rel.cost * 0.8)
        : rel.cost
      if (state.gold < price) return state
      if (state.relics.length < 5) {
        state.gold -= price
        state.relics.push(action.relicId)
      } else if (action.replaceRelicIndex !== undefined) {
        state.gold -= price
        state.relics[action.replaceRelicIndex] = action.relicId
      }
      return state
    }

    case 'SHOP_BUY_HEAL': {
      if (state.phase !== 'shop' || state.gold < 25) return state
      state.gold -= 25
      state.hp = Math.min(state.maxHp, state.hp + 22)
      return state
    }

    case 'LEAVE_SHOP': {
      if (state.phase !== 'shop') return state
      const nextFloor = state.floor + 1
      advanceToNextFloor(state, nextFloor % 4 === 0 ? 'boss' : 'normal')
      return state
    }
  }
}

export function observe(state: GameState): Observation {
  return {
    state,
    preview: calculateTurnPreview(state),
  }
}

function detectBuildArchetype(state: GameState): BuildArchetype {
  const counts: Record<BuildArchetype, number> = {
    assassin: 0,
    fortress: 0,
    arcana: 0,
    balanced: 0,
  }
  for (const die of state.dice) {
    for (const f of die.faces) {
      if (!f.engravingId.startsWith('base_')) {
        counts[ENGRAVINGS[f.engravingId].archetype] += 1
      }
    }
  }
  for (const rId of state.relics) {
    counts[RELICS[rId].archetype] += 2
  }
  if (
    counts.assassin >= counts.fortress &&
    counts.assassin >= counts.arcana &&
    counts.assassin > 0
  ) {
    return 'assassin'
  }
  if (counts.fortress >= counts.arcana && counts.fortress > 0) {
    return 'fortress'
  }
  if (counts.arcana > 0) {
    return 'arcana'
  }
  return 'balanced'
}

/**
 * 1プレイ（1ラン）を最初から最後まで高速シミュレーションする
 */
export function simulateRun(
  seed: number,
  policy: Policy,
  initialClass: StarterClassId = 'mage'
): RunResult {
  const botRng = createRng(seed ^ 0x9e3779b9)
  let state = initGameState(seed, initialClass, 0)
  let safetySteps = 0

  while (
    state.phase !== 'victory' &&
    state.phase !== 'gameover' &&
    safetySteps < 1500
  ) {
    safetySteps += 1
    const obs = observe(state)
    const action = policy(obs, botRng)
    state = step(state, action)
  }

  const cleared = state.phase === 'victory'
  const floorsCleared = cleared ? 12 : Math.max(0, state.floor - 1)
  const enemyHpRatio =
    state.enemy.maxHp > 0 ? state.enemy.hp / state.enemy.maxHp : 1

  // ニアミス判定：敗北時に敵の残りHPが25%以下だった、またはエリアボス(Floor 4/8/12)まで到達して惜敗した
  const nearMiss =
    !cleared && (enemyHpRatio <= 0.25 || state.floor % 4 === 0)

  const score =
    floorsCleared * 1000 +
    Math.round(state.stats.totalDamageDealt * 1.2) +
    state.stats.maxSingleTurnDamage * 4 +
    (cleared ? 3500 + state.hp * 25 : Math.round((1 - enemyHpRatio) * 500))

  const durationSec =
    state.stats.turnsPlayed * 20 + floorsCleared * 16

  return {
    score,
    cleared,
    nearMiss,
    durationSec,
    floorsCleared,
    turnsPlayed: state.stats.turnsPlayed,
    maxTurnDamage: state.stats.maxSingleTurnDamage,
    buildArchetype: detectBuildArchetype(state),
  }
}

// ============================================================================
// ボットアルゴリズム群（M1 リプレイ性＆バランス検証 `fun-metrics.test.ts` 用）
// ============================================================================

/** 1. でたらめに入力するランダムボット */
export const randomBot: Policy = ({ state }, rng) => {
  if (state.phase === 'reward' && state.rewardOffer) {
    const engId =
      state.rewardOffer.engravings[
        Math.floor(rng() * state.rewardOffer.engravings.length)
      ]
    const relicId =
      state.rewardOffer.relics.length > 0
        ? state.rewardOffer.relics[
            Math.floor(rng() * state.rewardOffer.relics.length)
          ]
        : undefined
    return {
      type: 'CHOOSE_REWARD',
      engravingId: engId,
      targetDieId: Math.floor(rng() * 4),
      targetFaceIndex: Math.floor(rng() * 6),
      relicId,
      nextNodeType: state.rewardOffer.nextFloorChoices[0],
    }
  }
  if (state.phase === 'altar') {
    return { type: 'ALTAR_ACTION', choice: 'heal_full' }
  }
  if (state.phase === 'shop') {
    return { type: 'LEAVE_SHOP' }
  }

  // 未配置のダイスがあればランダムな空きスロットに置く（でたらめ操作のため途中でターン終了することもある）
  const unassigned = state.dice.filter((d) => d.assignedSlot === null)
  if (unassigned.length > 0 && rng() < 0.78) {
    if (state.rerollsLeft > 0 && rng() < 0.45) {
      return { type: 'REROLL_DICE', lockDieIds: [] }
    }
    const emptySlots = ALL_SLOT_IDS.filter((s) => state.slots[s] === null)
    const targetSlot =
      emptySlots[Math.floor(rng() * emptySlots.length)] ?? 'strike_1'
    return {
      type: 'ASSIGN_DIE',
      dieId: unassigned[Math.floor(rng() * unassigned.length)].id,
      slotId: targetSlot,
    }
  }
  return { type: 'EXECUTE_TURN' }
}

/** 2. 敵の行動予告や防御・役を一切無視して攻撃枠と錬金枠だけに置く単調ボット */
export const monotoneBot: Policy = ({ state }) => {
  if (state.phase === 'reward' && state.rewardOffer) {
    return {
      type: 'CHOOSE_REWARD',
      nextNodeType: state.rewardOffer.nextFloorChoices[0],
    }
  }
  if (state.phase === 'altar') {
    return { type: 'ALTAR_ACTION', choice: 'upgrade_two_faces', targetDieId: 0 }
  }
  if (state.phase === 'shop') {
    return { type: 'LEAVE_SHOP' }
  }

  const unassigned = state.dice.filter((d) => d.assignedSlot === null)
  if (unassigned.length > 0) {
    // 防御(guard_1)を一切使わず、攻撃と錬金にだけ順番に詰める思考停止ムーブ
    const monotoneOrder: SlotId[] = [
      'strike_1',
      'strike_2',
      'alchemy_1',
      'arcana_1',
    ]
    for (const sId of monotoneOrder) {
      if (state.slots[sId] === null) {
        return { type: 'ASSIGN_DIE', dieId: unassigned[0].id, slotId: sId }
      }
    }
  }
  return { type: 'EXECUTE_TURN' }
}

/**
 * 戦略的ダイス割り当て＆鍛造ボット生成ヘルパー
 * preferredArchetype を指定するとそのビルド系統を優先し、noise (0..1) に応じて判断ブレを入れる
 */
function createStrategicPolicy(
  noise: number,
  preferredArchetype?: BuildArchetype
): Policy {
  return ({ state }, rng) => {
    const isNoisy = noise > 0 && rng() < noise

    if (state.phase === 'reward' && state.rewardOffer) {
      if (isNoisy) return randomBot({ state, preview: calculateTurnPreview(state) }, rng)

      // 優先系統に合致する刻印・レリックを高く評価して選ぶ
      const sortedEngs = [...state.rewardOffer.engravings].sort((a, b) => {
        const ea = ENGRAVINGS[a]
        const eb = ENGRAVINGS[b]
        const scoreA =
          (preferredArchetype && ea.archetype === preferredArchetype ? 25 : 0) +
          ea.cost
        const scoreB =
          (preferredArchetype && eb.archetype === preferredArchetype ? 25 : 0) +
          eb.cost
        return scoreB - scoreA
      })
      const chosenEng = sortedEngs[0]

      // 素の面（base_1〜base_6）が残っているダイス面を探して優先的に彫り直す
      let bestDieId = 0
      let bestFaceIdx = 0
      outer: for (const die of state.dice) {
        for (const face of die.faces) {
          if (
            face.engravingId.startsWith('base_') &&
            canForgeEngravingOnDie(die, chosenEng, face.faceIndex)
          ) {
            bestDieId = die.id
            bestFaceIdx = face.faceIndex
            break outer
          }
        }
      }

      const sortedRelics = [...state.rewardOffer.relics].sort((a, b) => {
        const ra = RELICS[a]
        const rb = RELICS[b]
        const scoreA =
          (preferredArchetype && ra.archetype === preferredArchetype ? 30 : 0) +
          ra.cost
        const scoreB =
          (preferredArchetype && rb.archetype === preferredArchetype ? 30 : 0) +
          rb.cost
        return scoreB - scoreA
      })

      const nextNode =
        state.hp >= state.maxHp * 0.65 &&
        state.rewardOffer.nextFloorChoices.includes('elite')
          ? 'elite'
          : state.rewardOffer.nextFloorChoices[0]

      return {
        type: 'CHOOSE_REWARD',
        engravingId: chosenEng,
        targetDieId: bestDieId,
        targetFaceIndex: bestFaceIdx,
        relicId: sortedRelics[0],
        nextNodeType: nextNode,
      }
    }

    if (state.phase === 'altar') {
      if (state.hp < state.maxHp * 0.55) {
        return { type: 'ALTAR_ACTION', choice: 'heal_full' }
      }
      if (state.relics.length < 5 && state.hp > 32) {
        return { type: 'ALTAR_ACTION', choice: 'sacrifice_hp_for_relic' }
      }
      return { type: 'ALTAR_ACTION', choice: 'upgrade_two_faces', targetDieId: 0 }
    }

    if (state.phase === 'shop') {
      if (state.hp < state.maxHp * 0.6 && state.gold >= 25) {
        return { type: 'SHOP_BUY_HEAL' }
      }
      if (state.rewardOffer) {
        for (const rId of state.rewardOffer.relics) {
          const cost = RELICS[rId].cost
          if (state.gold >= cost && state.relics.length < 5) {
            return { type: 'SHOP_BUY_RELIC', relicId: rId }
          }
        }
      }
      return { type: 'LEAVE_SHOP' }
    }

    // 戦闘フェーズ
    const unassigned = state.dice.filter((d) => d.assignedSlot === null)

    if (unassigned.length === 4) {
      // リロール判断：ビルド方針に合致するダイスとペアをロックして残りを振り直す
      if (state.rerollsLeft > 0 && !isNoisy) {
        const pipCounts = new Map<number, number>()
        for (const d of state.dice) {
          pipCounts.set(d.currentPip, (pipCounts.get(d.currentPip) ?? 0) + 1)
        }
        const lockIds: number[] = []
        for (const d of state.dice) {
          const isSpecial = !d.currentEngravingId.startsWith('base_')
          const isPaired = (pipCounts.get(d.currentPip) ?? 0) >= 2
          const matchesPref =
            preferredArchetype &&
            ENGRAVINGS[d.currentEngravingId].archetype === preferredArchetype
          const goodPipForBuild =
            preferredArchetype === 'assassin'
              ? d.currentPip <= 2
              : preferredArchetype === 'fortress'
                ? d.currentPip % 2 === 0
                : d.currentPip >= 5
          if (matchesPref || goodPipForBuild || (isSpecial && isPaired)) {
            lockIds.push(d.id)
          }
        }
        if (lockIds.length <= 2) {
          return { type: 'REROLL_DICE', lockDieIds: lockIds }
        }
      }

      // マナ介入：ビルド方針に合わせて出目を変換する
      if (state.mana >= 2 && !isNoisy) {
        if (preferredArchetype === 'assassin') {
          const highBaseDie = state.dice.find((d) => d.currentPip >= 5)
          if (highBaseDie) {
            return {
              type: 'MANIPULATE_DIE',
              dieId: highBaseDie.id,
              mode: 'flip',
            }
          }
        } else if (preferredArchetype === 'fortress') {
          const oddDie = state.dice.find((d) => d.currentPip % 2 === 1)
          if (oddDie) {
            return {
              type: 'MANIPULATE_DIE',
              dieId: oddDie.id,
              mode: 'plus1',
            }
          }
        } else {
          const lowBaseDie = state.dice.find(
            (d) => d.currentEngravingId.startsWith('base_') && d.currentPip <= 2
          )
          if (lowBaseDie) {
            return {
              type: 'MANIPULATE_DIE',
              dieId: lowBaseDie.id,
              mode: 'flip',
            }
          }
        }
      }
    }

    if (unassigned.length > 0) {
      if (isNoisy) {
        if (rng() < 0.22) {
          return { type: 'EXECUTE_TURN' }
        }
        const emptySlots = ALL_SLOT_IDS.filter((s) => state.slots[s] === null)
        return {
          type: 'ASSIGN_DIE',
          dieId: unassigned[0].id,
          slotId: emptySlots[Math.floor(rng() * emptySlots.length)] ?? 'strike_1',
        }
      }

      // 現在のプレビューを見て、敵をこのターン倒し切れるか、それとも強攻撃をガードすべきか判断する
      const curPreview = calculateTurnPreview(state)
      const incoming =
        (state.enemy.currentIntent.damage + state.enemy.strength) *
        (state.enemy.currentIntent.hits || 1)
      const needGuard =
        state.slots.guard_1 === null &&
        incoming > state.shield + curPreview.totalShieldGain + 4 &&
        state.enemy.hp > curPreview.totalDamage + 16

      if (needGuard) {
        const bestGuardDie = [...unassigned].sort((a, b) => {
          const ea = ENGRAVINGS[a.currentEngravingId]
          const eb = ENGRAVINGS[b.currentEngravingId]
          const valA =
            a.currentPip +
            (ea.bonusShield ?? 0) * 1.8 -
            (ea.multiHit ? 6 : 0) -
            (ea.multiplyEnemyPoison ? 6 : 0)
          const valB =
            b.currentPip +
            (eb.bonusShield ?? 0) * 1.8 -
            (eb.multiHit ? 6 : 0) -
            (eb.multiplyEnemyPoison ? 6 : 0)
          return valB - valA
        })[0]
        return {
          type: 'ASSIGN_DIE',
          dieId: bestGuardDie.id,
          slotId: 'guard_1',
        }
      }

      // 攻撃適性が最も高いダイスを先に strike_1 / strike_2 に割り当てる
      const sortedForAttack = [...unassigned].sort((a, b) => {
        const ea = ENGRAVINGS[a.currentEngravingId]
        const eb = ENGRAVINGS[b.currentEngravingId]
        const scoreA =
          (a.currentPip + (ea.bonusAttack ?? 0)) * (ea.multiHit ?? 1) +
          (ea.applyPoison ?? 0) * 1.5 +
          (ea.shieldBashRatio ?? 0) * 15
        const scoreB =
          (b.currentPip + (eb.bonusAttack ?? 0)) * (eb.multiHit ?? 1) +
          (eb.applyPoison ?? 0) * 1.5 +
          (eb.shieldBashRatio ?? 0) * 15
        return scoreB - scoreA
      })
      const die = sortedForAttack[0]
      const eng = ENGRAVINGS[die.currentEngravingId]

      if (state.slots.strike_1 === null) {
        return { type: 'ASSIGN_DIE', dieId: die.id, slotId: 'strike_1' }
      }
      if (state.slots.strike_2 === null) {
        return { type: 'ASSIGN_DIE', dieId: die.id, slotId: 'strike_2' }
      }
      if (
        eng.multiplyEnemyPoison &&
        state.slots.alchemy_1 === null &&
        state.alchemyUsesThisBattle < state.maxAlchemyUsesPerBattle
      ) {
        return { type: 'ASSIGN_DIE', dieId: die.id, slotId: 'alchemy_1' }
      }
      if (state.slots.arcana_1 === null) {
        return { type: 'ASSIGN_DIE', dieId: die.id, slotId: 'arcana_1' }
      }
      if (state.slots.guard_1 === null) {
        return { type: 'ASSIGN_DIE', dieId: die.id, slotId: 'guard_1' }
      }
      return { type: 'ASSIGN_DIE', dieId: die.id, slotId: 'alchemy_1' }
    }

    return { type: 'EXECUTE_TURN' }
  }
}

export const skilledBot = (noise: number): Policy =>
  createStrategicPolicy(noise)

export const strategyABot: Policy = createStrategicPolicy(0.15, 'assassin')
export const strategyBBot: Policy = createStrategicPolicy(0.15, 'fortress')
export const strategyCBot: Policy = createStrategicPolicy(0.15, 'arcana')
