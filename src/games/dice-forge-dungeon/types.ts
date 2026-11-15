export type StarterClassId = 'mage' | 'assassin' | 'blacksmith'

export type BuildArchetype = 'assassin' | 'fortress' | 'arcana' | 'balanced'

export type SlotId =
  | 'strike_1'
  | 'strike_2'
  | 'guard_1'
  | 'arcana_1'
  | 'alchemy_1'

export type SlotCategory = 'strike' | 'guard' | 'arcana' | 'alchemy'

export type EngravingId =
  // ノーマル面 (初期)
  | 'base_1'
  | 'base_2'
  | 'base_3'
  | 'base_4'
  | 'base_5'
  | 'base_6'
  // 系統A: 迅雷・猛毒アサシン (Low-Pip & Poison / Multi-Hit)
  | 'assassin_poison_dart_1'
  | 'assassin_twin_fang_2'
  | 'assassin_shadow_clone_1'
  | 'assassin_catalyst_2'
  | 'assassin_smoke_bomb_1'
  | 'assassin_viper_slash_2'
  | 'assassin_toxic_blade_3'
  | 'assassin_phantom_step_1'
  // 系統B: 鉄壁・反撃フォートレス (Even-Pip & Shield Slam / Thorns)
  | 'fortress_iron_wall_4'
  | 'fortress_shield_bash_4'
  | 'fortress_thorn_mail_2'
  | 'fortress_citadel_6'
  | 'fortress_smith_hammer_2'
  | 'fortress_aegis_guard_4'
  | 'fortress_counter_lance_6'
  | 'fortress_bastion_2'
  // 系統C: 星辰・魔導アルカナ (High-Pip & Mana Overcharge / Multiplier)
  | 'arcana_mana_crystal_5'
  | 'arcana_starlight_6'
  | 'arcana_wisdom_rune_5'
  | 'arcana_overcharge_6'
  | 'arcana_fate_shift_4'
  | 'arcana_meteor_flare_6'
  | 'arcana_astral_prism_5'
  | 'arcana_ether_surge_6'
  // 汎用・ハイブリッド
  | 'hybrid_golden_alchemy_3'
  | 'hybrid_vampire_fang_3'

export interface EngravingDef {
  id: EngravingId
  name: string
  pip: number
  archetype: BuildArchetype
  rarity: 'common' | 'rare' | 'epic'
  cost: number
  icon: string
  description: string
  shortEffect?: string
  /** 基礎攻撃ボーナス */
  bonusAttack?: number
  /** 基礎シールドボーナス */
  bonusShield?: number
  /** マナ獲得ボーナス */
  bonusMana?: number
  /** 猛毒付与値 */
  applyPoison?: number
  /** 連続ヒット回数（デフォルト1） */
  multiHit?: number
  /** 1ターンに1回、使用後に再利用可能になるか（Cantrip） */
  cantripReuse?: boolean
  /** 錬金・攻撃時に敵の現在猛毒を何倍にするか（例: 1.5） */
  multiplyEnemyPoison?: number
  /** 斬撃配置時、現在シールドの何割をダメージ加算するか（例: 0.6） */
  shieldBashRatio?: number
  /** 反撃棘（Thorns）獲得量 */
  applyThorns?: number
  /** このターンの共鳴役倍率への加算ボーナス（例: +0.35） */
  comboMultAdd?: number
  /** 魔導スロット配置時、全マナを消費して1MPあたり何ダメージ追加するか */
  manaOverchargeScale?: number
  /** 配置時、他の未配置ダイス1個の出目を+Nする */
  boostOtherPip?: number
  /** 戦闘中、偶数ダイスの基礎効果を永続+Nする */
  permanentEvenBonus?: number
  /** 次ターンのリロール権+N */
  rerollGain?: number
  /** HP回復量 */
  healHp?: number
  /** ゴールド獲得量 */
  goldGain?: number
}

export interface DiceFace {
  faceIndex: number
  pip: number
  engravingId: EngravingId
}

export interface DieState {
  id: number
  name: string
  faces: [DiceFace, DiceFace, DiceFace, DiceFace, DiceFace, DiceFace]
  rolledFaceIndex: number
  currentPip: number
  currentEngravingId: EngravingId
  locked: boolean
  assignedSlot: SlotId | null
  cantripUsedThisTurn: boolean
}

export type RelicId =
  // 系統A: アサシン系
  | 'relic_assassin_thimble'
  | 'relic_corrosive_flask'
  | 'relic_twin_daggers'
  | 'relic_serpent_idol'
  | 'relic_shadow_cloak'
  | 'relic_venom_heart'
  // 系統B: フォートレス系
  | 'relic_barricade_core'
  | 'relic_spiked_buckler'
  | 'relic_even_cogwheel'
  | 'relic_knight_vow'
  | 'relic_iron_anvil'
  | 'relic_golem_heart'
  // 系統C: アルカナ系
  | 'relic_star_grimoire'
  | 'relic_ether_reactor'
  | 'relic_golden_scales'
  | 'relic_sage_prism'
  | 'relic_arcane_crown'
  | 'relic_astral_hourglass'
  // 汎用・ボス系
  | 'relic_lucky_clover'
  | 'relic_vampire_chalice'
  | 'relic_merchant_coin'
  | 'relic_dragon_eye'
  | 'relic_phoenix_feather'
  | 'relic_chrono_compass'

export interface RelicDef {
  id: RelicId
  name: string
  archetype: BuildArchetype
  rarity: 'common' | 'rare' | 'boss'
  cost: number
  icon: string
  description: string
  shortEffect: string
}

export type FormationId =
  | 'none'
  | 'one_pair'
  | 'two_pair'
  | 'straight'
  | 'three_kind'
  | 'four_kind'

export interface FormationInfo {
  id: FormationId
  name: string
  baseMult: number
  isAllEven: boolean
  isAllOdd: boolean
  isOverload18: boolean
  isOverload20: boolean
  totalMult: number
  badges: string[]
}

export type EnemyIntentType =
  | 'attack'
  | 'heavy_attack'
  | 'multi_attack'
  | 'attack_defend'
  | 'curse_debuff'
  | 'enrage_attack'

export type EnemyTrait =
  | 'none'
  | 'thorns_shell' // 攻撃を受けるたび固定反撃ダメージ
  | 'armor_pierce' // プレイヤーのシールドを一部貫通または破壊
  | 'damage_cap' // 1ヒットあたりの最大ダメージ上限（連撃や毒が有効）
  | 'even_ward' // ターンごとに偶数/奇数の耐性が変化
  | 'mana_drain' // 攻撃時にマナを1奪う

export interface EnemyIntent {
  type: EnemyIntentType
  damage: number
  hits: number
  shieldGain: number
  strengthGain: number
  label: string
}

export interface EnemyState {
  id: string
  name: string
  area: number
  isElite: boolean
  isBoss: boolean
  icon: string
  maxHp: number
  hp: number
  shield: number
  poison: number
  thorns: number
  strength: number
  trait: EnemyTrait
  traitName: string
  traitDescription: string
  damageCap?: number
  intentPattern: EnemyIntent[]
  intentIndex: number
  currentIntent: EnemyIntent
}

export type FloorPhase =
  | 'class_select'
  | 'battle'
  | 'reward'
  | 'altar'
  | 'shop'
  | 'victory'
  | 'gameover'

export interface TurnSynergyStep {
  label: string
  detail: string
  color: 'rose' | 'sky' | 'amber' | 'emerald' | 'violet'
}

export interface TurnPreview {
  formation: FormationInfo
  relicMult: number
  finalMult: number
  totalDamage: number
  totalHits: number
  totalShieldGain: number
  totalManaGain: number
  totalPoisonApplied: number
  totalThornsGain: number
  totalHeal: number
  totalGoldGain: number
  expectedIncomingDamage: number
  expectedHpAfterTurn: number
  synergySteps: TurnSynergyStep[]
}

export interface SingleDieActionPreview {
  slotId: SlotId
  damage: number
  hits: number
  shieldGain: number
  poisonApplied: number
  manaGain: number
  manaConsumed: number
  thornsGain: number
  healHp: number
  goldGain: number
  bonusTriggered: boolean
  bonusTag: string
  summaryLabel: string
  isOverchargeBlast: boolean
}

export interface RewardOffer {
  engravings: EngravingId[]
  relics: RelicId[]
  nextFloorChoices: ('elite' | 'altar' | 'shop' | 'normal' | 'boss')[]
}

export interface GameState {
  seed: number
  rngState: number
  ascension: number
  starterClass: StarterClassId
  phase: FloorPhase
  floor: number // 1..12
  area: number // 1..3
  turn: number
  hp: number
  maxHp: number
  baseAttack: number
  baseDefense: number
  shield: number
  mana: number
  maxMana: number
  gold: number
  rerollsLeft: number
  maxRerolls: number
  alchemyUsesThisBattle: number
  maxAlchemyUsesPerBattle: number
  evenPermBonusThisBattle: number
  strengthThisBattle: number
  thornsThisBattle: number
  dice: [DieState, DieState, DieState, DieState]
  slots: Record<SlotId, number | null> // die.id or null
  relics: RelicId[]
  enemy: EnemyState
  upcomingBoss: {
    name: string
    icon: string
    traitName: string
    traitDescription: string
  }
  rewardOffer: RewardOffer | null
  combatLog: string[]
  stats: {
    turnsPlayed: number
    totalDamageDealt: number
    maxSingleTurnDamage: number
    enemiesDefeated: number
    engravingsForged: number
  }
}

/** ボット（Policy）用の観測インターフェース */
export interface Observation {
  state: GameState
  preview: TurnPreview
}

/** プレイヤー・ボットのアクション */
export type GameAction =
  | { type: 'SELECT_CLASS'; classId: StarterClassId; ascension?: number }
  | { type: 'REROLL_DICE'; lockDieIds: number[] }
  | { type: 'MANIPULATE_DIE'; dieId: number; mode: 'plus1' | 'minus1' | 'flip' }
  | { type: 'ASSIGN_DIE'; dieId: number; slotId: SlotId | null }
  | { type: 'EXECUTE_TURN' }
  | {
      type: 'CHOOSE_REWARD'
      engravingId?: EngravingId
      targetDieId?: number
      targetFaceIndex?: number
      relicId?: RelicId
      replaceRelicIndex?: number
      nextNodeType?: 'elite' | 'altar' | 'shop' | 'normal' | 'boss'
    }
  | {
      type: 'ALTAR_ACTION'
      choice: 'upgrade_two_faces' | 'heal_full' | 'sacrifice_hp_for_relic'
      targetDieId?: number
    }
  | {
      type: 'SHOP_BUY_ENGRAVING'
      engravingId: EngravingId
      targetDieId: number
      targetFaceIndex: number
    }
  | { type: 'SHOP_BUY_RELIC'; relicId: RelicId; replaceRelicIndex?: number }
  | { type: 'SHOP_BUY_HEAL' }
  | { type: 'LEAVE_SHOP' }

export type Policy = (obs: Observation, rng: () => number) => GameAction

export interface RunResult {
  score: number
  cleared: boolean
  nearMiss: boolean
  durationSec: number
  floorsCleared: number
  turnsPlayed: number
  maxTurnDamage: number
  buildArchetype: BuildArchetype
}
