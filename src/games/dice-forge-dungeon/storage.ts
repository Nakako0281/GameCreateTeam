import type { EngravingId, GameState, RelicId, StarterClassId } from './types'

const SAVE_KEY_ACTIVE_RUN = 'gct_dice_forge_dungeon_active_run_v1'
const SAVE_KEY_META_PROFILE = 'gct_dice_forge_dungeon_profile_v1'

export interface RunHistoryEntry {
  date: string
  starterClass: StarterClassId
  ascension: number
  cleared: boolean
  floorReached: number
  score: number
  maxTurnDamage: number
  relics: RelicId[]
}

export interface PlayerMetaProfile {
  highScore: number
  totalRuns: number
  totalClears: number
  unlockedAscension: number // 0..3
  discoveredEngravings: EngravingId[]
  discoveredRelics: RelicId[]
  recentRuns: RunHistoryEntry[]
}

const DEFAULT_PROFILE: PlayerMetaProfile = {
  highScore: 0,
  totalRuns: 0,
  totalClears: 0,
  unlockedAscension: 0,
  discoveredEngravings: [
    'base_1',
    'base_2',
    'base_3',
    'base_4',
    'base_5',
    'base_6',
  ],
  discoveredRelics: [
    'relic_star_grimoire',
    'relic_assassin_thimble',
    'relic_barricade_core',
  ],
  recentRuns: [],
}

/**
 * 進行中のランを localStorage にオートセーブする
 */
export function saveActiveRun(state: GameState): void {
  try {
    if (state.phase === 'victory' || state.phase === 'gameover') {
      clearActiveRun()
      return
    }
    localStorage.setItem(SAVE_KEY_ACTIVE_RUN, JSON.stringify(state))
  } catch {
    // storage quota or private mode fallback
  }
}

/**
 * 保存されている進行中のランを読み込む
 */
export function loadActiveRun(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY_ACTIVE_RUN)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (
      !parsed ||
      typeof parsed.floor !== 'number' ||
      !Array.isArray(parsed.dice) ||
      parsed.dice.length !== 4
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * 進行中のランセーブデータを消去する（決着時または新規ラン開始時）
 */
export function clearActiveRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY_ACTIVE_RUN)
  } catch {
    // ignore
  }
}

/**
 * 永続プロファイル（戦績・ハイスコア・図鑑・解放Ascension）を読み込む
 */
export function loadMetaProfile(): PlayerMetaProfile {
  try {
    const raw = localStorage.getItem(SAVE_KEY_META_PROFILE)
    if (!raw) return structuredClone(DEFAULT_PROFILE)
    const parsed = JSON.parse(raw) as Partial<PlayerMetaProfile>
    return {
      highScore: parsed.highScore ?? 0,
      totalRuns: parsed.totalRuns ?? 0,
      totalClears: parsed.totalClears ?? 0,
      unlockedAscension: parsed.unlockedAscension ?? 0,
      discoveredEngravings: Array.isArray(parsed.discoveredEngravings)
        ? parsed.discoveredEngravings
        : [...DEFAULT_PROFILE.discoveredEngravings],
      discoveredRelics: Array.isArray(parsed.discoveredRelics)
        ? parsed.discoveredRelics
        : [...DEFAULT_PROFILE.discoveredRelics],
      recentRuns: Array.isArray(parsed.recentRuns) ? parsed.recentRuns : [],
    }
  } catch {
    return structuredClone(DEFAULT_PROFILE)
  }
}

/**
 * ラン終了時または鍛造時に図鑑・戦績・Ascension解放を更新して保存する
 */
export function recordRunCompletion(
  state: GameState,
  finalScore: number
): PlayerMetaProfile {
  const profile = loadMetaProfile()
  const cleared = state.phase === 'victory'

  profile.totalRuns += 1
  if (cleared) {
    profile.totalClears += 1
    if (state.ascension >= profile.unlockedAscension && profile.unlockedAscension < 3) {
      profile.unlockedAscension = Math.min(3, state.ascension + 1)
    }
  }
  if (finalScore > profile.highScore) {
    profile.highScore = finalScore
  }

  const engSet = new Set<EngravingId>(profile.discoveredEngravings)
  for (const die of state.dice) {
    for (const face of die.faces) {
      engSet.add(face.engravingId)
    }
  }
  profile.discoveredEngravings = Array.from(engSet)

  const relSet = new Set<RelicId>(profile.discoveredRelics)
  for (const rId of state.relics) {
    relSet.add(rId)
  }
  profile.discoveredRelics = Array.from(relSet)

  const entry: RunHistoryEntry = {
    date: new Date().toISOString().slice(0, 10),
    starterClass: state.starterClass,
    ascension: state.ascension,
    cleared,
    floorReached: cleared ? 12 : state.floor,
    score: finalScore,
    maxTurnDamage: state.stats.maxSingleTurnDamage,
    relics: [...state.relics],
  }
  profile.recentRuns = [entry, ...profile.recentRuns].slice(0, 10)

  try {
    localStorage.setItem(SAVE_KEY_META_PROFILE, JSON.stringify(profile))
  } catch {
    // ignore
  }
  clearActiveRun()
  return profile
}
