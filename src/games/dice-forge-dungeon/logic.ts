import {
  ENGRAVINGS,
  ENEMY_TEMPLATES,
  RELICS,
  STARTER_CLASSES,
  type EnemyTemplate,
} from './data'
import type {
  ActionOutcomePreview,
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
  SingleDieActionPreview,
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

  const floorScale = 1 + (floor - 1) * 0.28 + state.ascension * 0.14
  const maxHp = Math.round(tpl.baseHp * floorScale)
  const scaledPatterns = tpl.intentPattern.map((intent) => ({
    ...intent,
    damage: Math.round(
      intent.damage * (1.35 + (floor - 1) * 0.14 + state.ascension * 0.12)
    ),
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
  const hasBarricade =
    state.starterClass === 'blacksmith' ||
    state.relics.includes('relic_barricade_core')
  if (hasBarricade) {
    state.shield = Math.min(14, state.shield)
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
    baseAttack: cls.baseAttack,
    baseDefense: cls.baseDefense,
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
    combatLog: [`Stage 1: ${bossTpl.name} への挑戦開始`],
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
 * 配置・手札ダイスの出目から「共鳴役（Formation Combo）」と倍率を計算する
 */
export function evaluateFormation(
  pips: number[],
  hasArcaneCrown: boolean,
  extraComboAdd = 0
): FormationInfo {
  if (pips.length === 0) {
    return {
      id: 'none',
      name: 'ハイロール',
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
  let name = '出目倍率'
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
    badges.push(`${name} x${baseMult.toFixed(2)}`)
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
    badges.push('OVERLOAD 20+ x1.25')
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

function getFormationAndRelicMultipliers(state: GameState): {
  formation: FormationInfo
  relicMult: number
  finalMult: number
} {
  const allHandPips = state.dice.map((d) => d.currentPip)
  let extraComboAdd = state.relics.includes('relic_lucky_clover') ? 0.2 : 0
  for (const die of state.dice) {
    const eng = ENGRAVINGS[die.currentEngravingId]
    if (eng.comboMultAdd) extraComboAdd += eng.comboMultAdd * 0.4
  }

  const formation = evaluateFormation(
    allHandPips,
    state.relics.includes('relic_arcane_crown'),
    extraComboAdd
  )

  let relicMult = 1.0
  const lowPipCount = allHandPips.filter((p) => p <= 2).length
  const highPipCount = allHandPips.filter((p) => p >= 5).length

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
  if (state.relics.includes('relic_golem_heart') && state.shield >= 15) {
    relicMult *= 1.45
  }
  if (state.relics.includes('relic_venom_heart') && state.enemy.poison > 0) {
    relicMult *= 1.4
  }

  const finalMult = Number((formation.totalMult * relicMult).toFixed(2))
  return {
    formation,
    relicMult: Number(relicMult.toFixed(2)),
    finalMult,
  }
}

/**
 * 1個のダイスを技ボタンに使用した瞬間の確定ダメージ・シールド・ボーナスを計算する（UI即時プレビュー＆実行共通）
 */
export function calculateSingleDieAction(
  state: GameState,
  die: DieState,
  slotId: SlotId
): SingleDieActionPreview {
  const { formation, finalMult } = getFormationAndRelicMultipliers(state)
  const eng = ENGRAVINGS[die.currentEngravingId]
  const pip = die.currentPip

  const hasThimble = state.relics.includes('relic_assassin_thimble')
  const hasShadowCloak = state.relics.includes('relic_shadow_cloak')
  const hasCogwheel = state.relics.includes('relic_even_cogwheel')
  const hasHourglass = state.relics.includes('relic_astral_hourglass')
  const hasDragonEye = state.relics.includes('relic_dragon_eye')
  const hasSagePrism = state.relics.includes('relic_sage_prism')
  const hasCorrosive = state.relics.includes('relic_corrosive_flask')
  const hasSpikedBuckler = state.relics.includes('relic_spiked_buckler')
  const hasKnightVow = state.relics.includes('relic_knight_vow')
  const hasMerchantCoin = state.relics.includes('relic_merchant_coin')

  let effectivePip = pip
  if (pip % 2 === 0) effectivePip += state.evenPermBonusThisBattle
  if (hasHourglass && pip >= 5) effectivePip += 3
  if (hasDragonEye) effectivePip += 3

  // クラス固有パッシブ補正
  const mageHighPipMult =
    state.starterClass === 'mage' && pip >= 5 ? 1.4 : 1.0
  const mageHighPipMana = state.starterClass === 'mage' && pip >= 5 ? 1 : 0
  const assassinLowPipDmg =
    state.starterClass === 'assassin' && pip <= 2 ? 6 : 0
  const assassinLowPipPoison =
    state.starterClass === 'assassin' && pip <= 2 ? 4 : 0

  let damageRaw = 0
  let hits = 1
  let rawShield = 0
  let poisonApplied = (eng.applyPoison ?? 0) + assassinLowPipPoison
  let manaGain = (eng.bonusMana ?? 0) + mageHighPipMana
  let manaConsumed = 0
  let thornsGain = eng.applyThorns ?? 0
  const healHp = eng.healHp ?? 0
  const goldGain = eng.goldGain ?? 0
  let bonusTriggered = false
  let bonusTag = ''
  let isOverchargeBlast = false

  // レリックの小目・偶数パッシブ
  if (hasShadowCloak && pip <= 2) rawShield += 3
  if (hasThimble && pip <= 2) {
    damageRaw += 4
    poisonApplied += 2
  }
  if (hasCogwheel && pip % 2 === 0) {
    rawShield += 3
    damageRaw += 2
  }
  if (hasMerchantCoin) {
    damageRaw += 2
  }

  if (slotId === 'strike_1') {
    // 強斬撃：大目4〜6で会心1.5倍
    const baseAtk =
      effectivePip +
      state.baseAttack +
      state.strengthThisBattle +
      (eng.bonusAttack ?? 0) +
      assassinLowPipDmg +
      2
    if (pip >= 4) {
      damageRaw += Math.ceil(baseAtk * 1.5)
      bonusTriggered = true
      bonusTag = '会心x1.5'
    } else {
      damageRaw += Math.max(2, Math.floor(baseAtk * 0.72))
      bonusTag = '4〜6で会心'
    }
    hits = eng.multiHit ?? 1
    if (hits > 1) damageRaw = Math.ceil(damageRaw * (1 + (hits - 1) * 0.35))
    if (eng.bonusShield) rawShield += Math.floor(eng.bonusShield * 0.5)
    if (eng.shieldBashRatio) {
      damageRaw += Math.floor((state.shield + rawShield) * eng.shieldBashRatio)
    }
  } else if (slotId === 'strike_2') {
    // 毒連撃：小目1〜3で2連撃+猛毒強化
    const baseAtk =
      effectivePip +
      state.baseAttack +
      Math.floor(state.strengthThisBattle * 0.5) +
      (eng.bonusAttack ?? 0) +
      assassinLowPipDmg
    if (pip <= 3) {
      hits = Math.max(2, eng.multiHit ?? 2)
      const perHit = Math.max(2, Math.ceil(baseAtk * 0.65))
      damageRaw += perHit * hits
      poisonApplied += 4
      bonusTriggered = true
      bonusTag = '2連+猛毒'
    } else {
      hits = eng.multiHit ?? 1
      damageRaw += Math.max(2, Math.floor(baseAtk * 0.58))
      bonusTag = '1〜3毒連'
    }
    if (eng.bonusShield) rawShield += Math.floor(eng.bonusShield * 0.4)
  } else if (slotId === 'guard_1') {
    // 鉄壁盾：偶数2・4・6で装甲1.4倍+反撃棘
    let baseDef =
      effectivePip + state.baseDefense + (eng.bonusShield ?? 0) + 2
    if (pip % 2 === 0) {
      baseDef = Math.ceil(baseDef * 1.4) + 2
      thornsGain += 2
      bonusTriggered = true
      bonusTag = '偶数強化'
    } else {
      bonusTag = '偶数で強化'
    }
    rawShield += baseDef
    if (eng.bonusAttack) {
      damageRaw += Math.floor(eng.bonusAttack * 0.5)
    }
    // 重騎士パッシブ＆スパイク盾：獲得シールドに応じて即座に追撃ダメージ
    let bashRatio = 0
    if (state.starterClass === 'blacksmith') bashRatio += 0.3
    if (hasSpikedBuckler) bashRatio += 0.5
    if (eng.shieldBashRatio) bashRatio += eng.shieldBashRatio * 0.5
    if (bashRatio > 0) {
      damageRaw += Math.floor(rawShield * bashRatio)
    }
  } else if (slotId === 'arcana_1') {
    // 魔導砲：MP3以上でMP3消費の必殺砲、未満はMP+2充填+魔攻
    const prismScale = hasSagePrism ? 1.35 : 1.0
    if (state.mana >= 3) {
      isOverchargeBlast = true
      manaConsumed = 3
      bonusTriggered = true
      bonusTag = 'MP3必殺砲'
      const blastBase =
        effectivePip * 1.8 +
        state.baseAttack * 2 +
        state.strengthThisBattle +
        (eng.bonusAttack ?? 0) +
        11 +
        assassinLowPipDmg
      damageRaw += Math.round(blastBase * prismScale)
    } else {
      manaGain += 2
      bonusTag = 'MP+2充填'
      const boltBase =
        effectivePip * 0.75 +
        state.baseAttack +
        Math.floor(state.strengthThisBattle * 0.5) +
        (eng.bonusAttack ?? 0) +
        assassinLowPipDmg
      damageRaw += Math.max(2, Math.round(boltBase * prismScale))
    }
    if (eng.bonusShield) rawShield += Math.floor(eng.bonusShield * 0.5)
  } else {
    // alchemy_1（互換用）
    poisonApplied += Math.ceil(effectivePip * 0.8) + 2
    rawShield += Math.ceil(effectivePip * 0.6) + (eng.bonusShield ?? 0)
    damageRaw += Math.max(1, Math.floor(effectivePip * 0.5))
    bonusTag = '錬金'
  }

  // 共通コンボ・クラス倍率の適用
  const shieldMult =
    (1 + (formation.totalMult - 1) * 0.65) * (hasKnightVow ? 1.35 : 1.0)
  const shieldGain = Math.floor(rawShield * shieldMult)

  let totalDamage = Math.floor(damageRaw * finalMult * mageHighPipMult)

  if (eng.manaOverchargeScale && !isOverchargeBlast) {
    totalDamage += Math.min(state.maxMana, state.mana + manaGain) * eng.manaOverchargeScale
  }
  if (state.relics.includes('relic_golden_scales') && formation.isOverload18) {
    totalDamage += 4
  }
  if (hasCorrosive && poisonApplied > 0) {
    totalDamage += poisonApplied
  }
  if (
    state.enemy.trait === 'damage_cap' &&
    state.enemy.damageCap &&
    totalDamage > state.enemy.damageCap * Math.max(1, hits)
  ) {
    totalDamage = state.enemy.damageCap * Math.max(1, hits)
  }

  let summaryLabel = ''
  if (slotId === 'guard_1') {
    summaryLabel =
      totalDamage > 0
        ? `盾+${shieldGain} / ${totalDamage}攻`
        : `盾+${shieldGain}`
  } else if (slotId === 'strike_2') {
    summaryLabel =
      poisonApplied > 0
        ? `${totalDamage}攻 +${poisonApplied}毒`
        : `${totalDamage}攻`
  } else if (slotId === 'arcana_1') {
    summaryLabel = isOverchargeBlast
      ? `必殺 ${totalDamage}攻`
      : `${totalDamage}攻 +${manaGain}MP`
  } else {
    summaryLabel = `${totalDamage}攻`
  }

  return {
    slotId,
    damage: totalDamage,
    hits: totalDamage > 0 ? Math.max(1, hits) : 0,
    shieldGain,
    poisonApplied,
    manaGain,
    manaConsumed,
    thornsGain,
    healHp,
    goldGain,
    bonusTriggered,
    bonusTag,
    summaryLabel,
    isOverchargeBlast,
  }
}

/**
 * 指定ダイスを指定スロットに発動した場合の戦場予測（敵HP・盾・毒・被弾防御可否）を誤差ゼロで算出する
 */
export function previewAfterSingleAction(
  state: GameState,
  die: DieState,
  slotId: SlotId
): ActionOutcomePreview {
  const action = calculateSingleDieAction(state, die, slotId)
  const afterState = step(state, {
    type: 'ASSIGN_DIE',
    dieId: die.id,
    slotId,
  })

  const willKillEnemyNow =
    afterState.phase === 'reward' ||
    afterState.phase === 'victory' ||
    afterState.enemy.hp <= 0
  const enemyHpAfter = willKillEnemyNow ? 0 : afterState.enemy.hp

  const poisonTickDamage = afterState.relics.includes('relic_serpent_idol')
    ? Math.floor(afterState.enemy.poison * 1.5)
    : afterState.enemy.poison
  const willKillEnemyByPoison =
    !willKillEnemyNow && poisonTickDamage >= enemyHpAfter && enemyHpAfter > 0

  let expectedIncomingAfter = 0
  if (!willKillEnemyNow && !willKillEnemyByPoison) {
    const intent = afterState.enemy.currentIntent
    expectedIncomingAfter =
      (intent.damage + afterState.enemy.strength) * (intent.hits || 1)
    if (
      afterState.relics.includes('relic_serpent_idol') &&
      afterState.enemy.poison > 0
    ) {
      expectedIncomingAfter = Math.floor(expectedIncomingAfter * 0.75)
    }
  }

  const expectedUnblockedAfter = Math.max(
    0,
    expectedIncomingAfter - afterState.shield
  )
  const isFullGuard =
    expectedIncomingAfter > 0 && expectedUnblockedAfter === 0

  return {
    slotId,
    action,
    enemyHpAfter,
    enemyShieldAfter: willKillEnemyNow ? 0 : afterState.enemy.shield,
    enemyPoisonAfter: willKillEnemyNow ? 0 : afterState.enemy.poison,
    heroShieldAfter: afterState.shield,
    heroHpAfterAction: afterState.hp,
    heroManaAfter: afterState.mana,
    willKillEnemyNow,
    willKillEnemyByPoison,
    expectedIncomingAfter,
    expectedUnblockedAfter,
    isFullGuard,
  }
}

/**
 * 現在の手札・残ダイスからのターン状況プレビューを計算する（UIの役バッジ＆テスト互換用）
 */
export function calculateTurnPreview(state: GameState): TurnPreview {
  const { formation, relicMult, finalMult } =
    getFormationAndRelicMultipliers(state)

  let totalDamage = 0
  let totalHits = 0
  let totalShieldGain = 0
  let totalManaGain = 0
  let totalPoisonApplied = 0
  let totalThornsGain = 0
  let totalHeal = 0
  let totalGoldGain = 0

  // すでにこのターンで使用されたダイスの実績、またはスロット割り当てから概算
  for (const die of state.dice) {
    if (die.assignedSlot !== null) {
      const act = calculateSingleDieAction(state, die, die.assignedSlot)
      totalDamage += act.damage
      totalHits += act.hits
      totalShieldGain += act.shieldGain
      totalManaGain += act.manaGain
      totalPoisonApplied += act.poisonApplied
      totalThornsGain += act.thornsGain
      totalHeal += act.healHp
      totalGoldGain += act.goldGain
    }
  }

  const poisonTickDamage = state.relics.includes('relic_serpent_idol')
    ? Math.floor(state.enemy.poison * 1.5)
    : state.enemy.poison
  const enemyWillDie =
    state.enemy.hp <= 0 || poisonTickDamage >= state.enemy.hp

  let enemyAttackRaw = 0
  if (!enemyWillDie) {
    const intent = state.enemy.currentIntent
    const perHit = intent.damage + state.enemy.strength
    enemyAttackRaw = perHit * (intent.hits || 1)
    if (
      state.relics.includes('relic_serpent_idol') &&
      state.enemy.poison > 0
    ) {
      enemyAttackRaw = Math.floor(enemyAttackRaw * 0.75)
    }
  }

  const unblockedDamage = Math.max(0, enemyAttackRaw - state.shield)
  const expectedHpAfterTurn = Math.max(
    0,
    Math.min(state.maxHp, state.hp - unblockedDamage)
  )

  const synergySteps: TurnSynergyStep[] = [
    {
      label: `共鳴役 (${formation.name})`,
      detail: `x${formation.totalMult.toFixed(2)}`,
      color: 'amber',
    },
    {
      label: '遺物乗算',
      detail: `x${relicMult.toFixed(2)}`,
      color: 'violet',
    },
    {
      label: '最終倍率',
      detail: `x${finalMult.toFixed(2)}`,
      color: 'rose',
    },
  ]

  return {
    formation,
    relicMult,
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
    nextFloorChoices = ['elite']
  } else if (posInArea === 4) {
    nextFloorChoices = ['boss']
  }

  return {
    engravings: OfferEngs,
    relics: OfferRelics,
    nextFloorChoices,
  }
}

function handleEnemyDefeated(state: GameState): void {
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
    state.hp = Math.min(state.maxHp, state.hp + 7)
  } else {
    state.hp = Math.min(state.maxHp, state.hp + 2)
  }
  if (state.relics.includes('relic_merchant_coin')) {
    state.hp = Math.min(state.maxHp, state.hp + 3)
  }

  if (state.floor >= 12) {
    state.phase = 'victory'
    state.combatLog.unshift(
      `最終ボス「${state.enemy.name}」を撃破！運命の塔を完全制覇した`
    )
    return
  }

  state.phase = 'reward'
  state.rewardOffer = generateRewardOffer(state)
  state.combatLog.unshift(
    `${state.enemy.name} を撃破！(+${rewardGold}G) 強化を選択しよう`
  )
}

function advanceToNextFloor(
  state: GameState,
  nextNodeType: 'normal' | 'elite' | 'altar' | 'shop' | 'boss'
): void {
  state.floor += 1
  state.area = getAreaForFloor(state.floor)
  // ステージ突破によるレベルアップ成長（最大HP+3, 基礎攻撃+1, HP+3回復）
  state.maxHp += 3
  state.baseAttack += 1
  state.hp = Math.min(state.maxHp, state.hp + 3)

  const bossTpl = getBossTemplateForArea(state.area)
  state.upcomingBoss = {
    name: bossTpl.name,
    icon: bossTpl.icon,
    traitName: bossTpl.traitName,
    traitDescription: bossTpl.traitDescription,
  }

  if (nextNodeType === 'altar') {
    state.phase = 'altar'
    state.combatLog.unshift(`Stage ${state.floor}: 秘境の魔導祭壇に到着`)
    return
  }
  if (nextNodeType === 'shop') {
    state.phase = 'shop'
    state.rewardOffer = generateRewardOffer(state)
    state.combatLog.unshift(`Stage ${state.floor}: 鍛冶屋＆魔導商店に到着`)
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
    `Stage ${state.floor}: ${state.enemy.name} (HP ${state.enemy.maxHp}) が出現`
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
      if (!die || die.assignedSlot !== null) return state
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
        if (state.enemy.hp <= 0) {
          handleEnemyDefeated(state)
        }
      }
      return state
    }

    case 'ASSIGN_DIE': {
      if (state.phase !== 'battle' || action.slotId === null) return state
      const die = state.dice.find((d) => d.id === action.dieId)
      if (!die || die.assignedSlot !== null) return state

      // 即時計算＆即座に戦場へ反映（1ダイス＝1即時行動）
      const act = calculateSingleDieAction(state, die, action.slotId)
      const eng = ENGRAVINGS[die.currentEngravingId]

      die.assignedSlot = action.slotId
      state.slots[action.slotId] = die.id

      state.mana = Math.max(
        0,
        Math.min(state.maxMana, state.mana - act.manaConsumed + act.manaGain)
      )
      state.shield += act.shieldGain
      state.thornsThisBattle += act.thornsGain
      state.gold += act.goldGain
      if (act.healHp > 0) {
        state.hp = Math.min(state.maxHp, state.hp + act.healHp)
      }

      if (eng.permanentEvenBonus) {
        state.evenPermBonusThisBattle += eng.permanentEvenBonus
      }
      if (eng.boostOtherPip && !die.cantripUsedThisTurn) {
        const other = state.dice.find(
          (d) => d.id !== die.id && d.assignedSlot === null
        )
        if (other) {
          other.currentPip = Math.min(8, other.currentPip + eng.boostOtherPip)
          die.cantripUsedThisTurn = true
        }
      }

      // 敵へのダメージ即時適用
      if (act.damage > 0) {
        let dmgToDeal = act.damage
        // 必殺魔導砲は敵シールドを50%貫通する
        const effectiveEnemyShield = act.isOverchargeBlast
          ? Math.floor(state.enemy.shield * 0.5)
          : state.enemy.shield
        const blocked = Math.min(effectiveEnemyShield, dmgToDeal)
        state.enemy.shield = Math.max(0, state.enemy.shield - blocked)
        dmgToDeal -= blocked
        state.enemy.hp = Math.max(0, state.enemy.hp - dmgToDeal)

        state.stats.totalDamageDealt += act.damage
        if (act.damage > state.stats.maxSingleTurnDamage) {
          state.stats.maxSingleTurnDamage = act.damage
        }

        // 敵の棘甲による反射被弾
        if (state.enemy.thorns > 0 && act.hits > 0) {
          const selfThornDmg = state.enemy.thorns * act.hits
          const abs = Math.min(state.shield, selfThornDmg)
          state.shield -= abs
          state.hp = Math.max(0, state.hp - (selfThornDmg - abs))
        }
      }

      // 猛毒付与＆猛毒増殖の即時適用
      if (act.poisonApplied > 0 || eng.multiplyEnemyPoison) {
        const basePoison = state.enemy.poison + act.poisonApplied
        state.enemy.poison = eng.multiplyEnemyPoison
          ? Math.floor(basePoison * eng.multiplyEnemyPoison)
          : basePoison
      }

      if (state.enemy.hp <= 0) {
        handleEnemyDefeated(state)
        return state
      }

      if (state.hp <= 0) {
        state.phase = 'gameover'
        state.combatLog.unshift(`${state.enemy.name} の棘反射に倒れた`)
        return state
      }

      return state
    }

    case 'EXECUTE_TURN': {
      if (state.phase !== 'battle') return state
      state.stats.turnsPlayed += 1

      let nextTurnExtraRerolls = 0
      for (const die of state.dice) {
        if (die.assignedSlot !== null) {
          const eng = ENGRAVINGS[die.currentEngravingId]
          if (eng.rerollGain) {
            nextTurnExtraRerolls += eng.rerollGain
          }
        }
      }

      // ターン終了時の猛毒ダメージ解決
      if (state.enemy.poison > 0 && state.enemy.hp > 0) {
        const poisonDmg = state.relics.includes('relic_serpent_idol')
          ? Math.floor(state.enemy.poison * 1.5)
          : state.enemy.poison
        state.enemy.hp = Math.max(0, state.enemy.hp - poisonDmg)
        state.stats.totalDamageDealt += poisonDmg
        state.enemy.poison = Math.max(0, state.enemy.poison - 1)
      }

      if (state.enemy.hp <= 0) {
        handleEnemyDefeated(state)
        return state
      }

      // 敵のターン行動解決
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
            handleEnemyDefeated(state)
            return state
          }
        }
      }

      if (intent.strengthGain > 0) {
        state.enemy.strength += intent.strengthGain
      }
      if (state.turn >= 6) {
        state.enemy.strength += 3
      }

      if (state.hp <= 0) {
        state.phase = 'gameover'
        state.combatLog.unshift(`${state.enemy.name} の攻撃に倒れた`)
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
        let chosenDie =
          action.targetDieId !== undefined
            ? state.dice.find((d) => d.id === action.targetDieId)
            : undefined
        let chosenFaceIdx = action.targetFaceIndex

        if (!chosenDie || chosenFaceIdx === undefined) {
          let fallbackDie = state.dice[0]
          let fallbackFaceIdx = 0
          let foundBase = false

          const preferredFaceIdx = Math.max(
            0,
            Math.min(5, ENGRAVINGS[action.engravingId].pip - 1)
          )
          for (const die of state.dice) {
            const prefFace = die.faces[preferredFaceIdx]
            if (
              prefFace.engravingId.startsWith('base_') &&
              canForgeEngravingOnDie(die, action.engravingId, preferredFaceIdx)
            ) {
              fallbackDie = die
              fallbackFaceIdx = preferredFaceIdx
              foundBase = true
              break
            }
          }

          if (!foundBase) {
            outer: for (const die of state.dice) {
              for (const face of die.faces) {
                if (
                  face.engravingId.startsWith('base_') &&
                  canForgeEngravingOnDie(
                    die,
                    action.engravingId,
                    face.faceIndex
                  )
                ) {
                  fallbackDie = die
                  fallbackFaceIdx = face.faceIndex
                  foundBase = true
                  break outer
                }
              }
            }
          }

          if (!foundBase) {
            outerAny: for (const die of state.dice) {
              for (const face of die.faces) {
                if (
                  canForgeEngravingOnDie(
                    die,
                    action.engravingId,
                    face.faceIndex
                  )
                ) {
                  fallbackDie = die
                  fallbackFaceIdx = face.faceIndex
                  break outerAny
                }
              }
            }
          }

          chosenDie = fallbackDie
          chosenFaceIdx = fallbackFaceIdx
        }

        if (
          canForgeEngravingOnDie(chosenDie, action.engravingId, chosenFaceIdx)
        ) {
          chosenDie.faces[chosenFaceIdx] = {
            faceIndex: chosenFaceIdx,
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
      } else if (action.choice === 'sacrifice_hp_for_relic') {
        state.hp = Math.max(10, state.hp - 12)
        const unowned = (Object.keys(RELICS) as RelicId[]).filter(
          (r) => !state.relics.includes(r)
        )
        if (unowned.length > 0 && state.relics.length < 5) {
          state.relics.push(pickRandom(state, unowned))
        }
      }
      const nextPos = (state.floor % 4) + 1
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

  const nearMiss =
    !cleared && (enemyHpRatio <= 0.25 || state.floor % 4 === 0)

  const score =
    floorsCleared * 1000 +
    Math.round(state.stats.totalDamageDealt * 1.2) +
    state.stats.maxSingleTurnDamage * 4 +
    (cleared ? 3500 + state.hp * 25 : Math.round((1 - enemyHpRatio) * 500))

  const durationSec = state.stats.turnsPlayed * 20 + floorsCleared * 16

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

  const unassigned = state.dice.filter((d) => d.assignedSlot === null)
  if (unassigned.length > 0 && rng() < 0.8) {
    if (state.rerollsLeft > 0 && rng() < 0.45) {
      return { type: 'REROLL_DICE', lockDieIds: [] }
    }
    const choices: SlotId[] = ['strike_1', 'strike_2', 'guard_1', 'arcana_1']
    const targetSlot = choices[Math.floor(rng() * choices.length)]
    return {
      type: 'ASSIGN_DIE',
      dieId: unassigned[Math.floor(rng() * unassigned.length)].id,
      slotId: targetSlot,
    }
  }
  return { type: 'EXECUTE_TURN' }
}

/** 2. 敵の予告や防御を一切無視して「強斬撃」ボタンだけ連打し続ける思考停止ボット */
export const monotoneBot: Policy = ({ state }) => {
  if (state.phase === 'reward' && state.rewardOffer) {
    return {
      type: 'CHOOSE_REWARD',
      nextNodeType: state.rewardOffer.nextFloorChoices[0],
    }
  }
  if (state.phase === 'altar') {
    return { type: 'ALTAR_ACTION', choice: 'heal_full' }
  }
  if (state.phase === 'shop') {
    return { type: 'LEAVE_SHOP' }
  }

  const unassigned = state.dice.filter((d) => d.assignedSlot === null)
  if (unassigned.length > 0) {
    return { type: 'ASSIGN_DIE', dieId: unassigned[0].id, slotId: 'strike_1' }
  }
  return { type: 'EXECUTE_TURN' }
}

/**
 * 3. 戦略的プレイヤボット生成ヘルパー（敵攻撃を盾で防ぎ、出目と技・MP必殺を使い分ける）
 */
function createStrategicPolicy(
  noise: number,
  preferredArchetype?: BuildArchetype
): Policy {
  return ({ state }, rng) => {
    const isNoisy = noise > 0 && rng() < noise

    if (state.phase === 'reward' && state.rewardOffer) {
      if (isNoisy) {
        return randomBot({ state, preview: calculateTurnPreview(state) }, rng)
      }

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
        engravingId: sortedEngs[0],
        relicId: sortedRelics[0],
        nextNodeType: nextNode,
      }
    }

    if (state.phase === 'altar') {
      return { type: 'ALTAR_ACTION', choice: 'heal_full' }
    }
    if (state.phase === 'shop') {
      return { type: 'LEAVE_SHOP' }
    }

    const unassigned = state.dice.filter((d) => d.assignedSlot === null)

    if (unassigned.length === 4) {
      // リロール判断：ビルド方針に合致するダイスとペアをロックして振り直す
      if (state.rerollsLeft > 0 && !isNoisy) {
        const pipCounts = new Map<number, number>()
        for (const d of state.dice) {
          pipCounts.set(d.currentPip, (pipCounts.get(d.currentPip) ?? 0) + 1)
        }
        const lockIds: number[] = []
        for (const d of state.dice) {
          const isPaired = (pipCounts.get(d.currentPip) ?? 0) >= 2
          const matchesPref =
            preferredArchetype &&
            ENGRAVINGS[d.currentEngravingId].archetype === preferredArchetype
          const goodPip =
            preferredArchetype === 'assassin'
              ? d.currentPip <= 2
              : preferredArchetype === 'fortress'
                ? d.currentPip % 2 === 0
                : d.currentPip >= 5
          if (matchesPref || goodPip || isPaired) {
            lockIds.push(d.id)
          }
        }
        if (lockIds.length <= 2) {
          return { type: 'REROLL_DICE', lockDieIds: lockIds }
        }
      }

      // マナ介入：MP余裕があれば得意出目へ引き上げる
      if (state.mana >= 4 && !isNoisy) {
        const targetDie = unassigned.find((d) =>
          preferredArchetype === 'assassin'
            ? d.currentPip === 3
            : preferredArchetype === 'fortress'
              ? d.currentPip % 2 === 1
              : d.currentPip === 4 || d.currentPip === 5
        )
        if (targetDie) {
          return {
            type: 'MANIPULATE_DIE',
            dieId: targetDie.id,
            mode: preferredArchetype === 'assassin' ? 'minus1' : 'plus1',
          }
        }
      }
    }

    if (unassigned.length > 0) {
      if (isNoisy) {
        const choices: SlotId[] = ['strike_1', 'strike_2', 'guard_1', 'arcana_1']
        return {
          type: 'ASSIGN_DIE',
          dieId: unassigned[0].id,
          slotId: choices[Math.floor(rng() * choices.length)],
        }
      }

      // 1. まず必殺魔導砲(MP>=3)や全残ダイスで仕留められるかチェック
      const bestKillCombo = findBestImmediateAction(state, unassigned)
      if (
        bestKillCombo &&
        bestKillCombo.preview.damage >= state.enemy.hp + state.enemy.shield
      ) {
        return {
          type: 'ASSIGN_DIE',
          dieId: bestKillCombo.die.id,
          slotId: bestKillCombo.slotId,
        }
      }

      // 2. 敵の攻撃予告に対してシールドが足りなければ、鉄壁盾に最適なダイスを使う
      const incoming =
        (state.enemy.currentIntent.damage + state.enemy.strength) *
        (state.enemy.currentIntent.hits || 1)
      const deficit = incoming - state.shield
      const hpRatio = state.hp / state.maxHp

      if (deficit >= 4 && (hpRatio < 0.82 || incoming >= 12)) {
        const guardCandidate = [...unassigned].sort((a, b) => {
          const pa = calculateSingleDieAction(state, a, 'guard_1')
          const pb = calculateSingleDieAction(state, b, 'guard_1')
          const scoreA =
            pa.shieldGain + pa.damage * 0.5 + (a.currentPip % 2 === 0 ? 4 : 0)
          const scoreB =
            pb.shieldGain + pb.damage * 0.5 + (b.currentPip % 2 === 0 ? 4 : 0)
          return scoreB - scoreA
        })[0]
        return {
          type: 'ASSIGN_DIE',
          dieId: guardCandidate.id,
          slotId: 'guard_1',
        }
      }

      // 3. 攻撃アクション：各ダイスと各技の組み合わせで最も期待値が高いものを選ぶ
      const bestOffense = findBestImmediateAction(state, unassigned)
      if (bestOffense) {
        return {
          type: 'ASSIGN_DIE',
          dieId: bestOffense.die.id,
          slotId: bestOffense.slotId,
        }
      }
    }

    return { type: 'EXECUTE_TURN' }
  }
}

function findBestImmediateAction(
  state: GameState,
  unassigned: DieState[]
): { die: DieState; slotId: SlotId; preview: SingleDieActionPreview; value: number } | null {
  const slots: SlotId[] = ['strike_1', 'strike_2', 'arcana_1', 'guard_1']
  let best: {
    die: DieState
    slotId: SlotId
    preview: SingleDieActionPreview
    value: number
  } | null = null

  for (const die of unassigned) {
    for (const slotId of slots) {
      const preview = calculateSingleDieAction(state, die, slotId)
      const poisonValue =
        preview.poisonApplied * (state.enemy.hp > 25 ? 2.1 : 1.1)
      const manaValue = preview.manaGain * 1.6 - preview.manaConsumed * 0.4
      const shieldValue =
        slotId === 'guard_1' ? preview.shieldGain * 0.45 : preview.shieldGain * 0.7
      const value =
        preview.damage +
        poisonValue +
        manaValue +
        shieldValue +
        preview.thornsGain * 1.2 +
        (preview.bonusTriggered ? 2.5 : 0)

      if (!best || value > best.value) {
        best = { die, slotId, preview, value }
      }
    }
  }
  return best
}

export const skilledBot = (noise: number): Policy =>
  createStrategicPolicy(noise)

export const strategyABot: Policy = createStrategicPolicy(0.15, 'assassin')
export const strategyBBot: Policy = createStrategicPolicy(0.15, 'fortress')
export const strategyCBot: Policy = createStrategicPolicy(0.15, 'arcana')
