import { lazy } from 'react'
import type { GameEntry } from '../types/game'

/**
 * プラットフォーム全体のゲームレジストリ
 * 新体制（高リトライ性ゲーム制作方針）のゲームを収録
 */
export const GAME_REGISTRY: GameEntry[] = [
  {
    id: 'dice-forge-dungeon',
    title: 'ダイス・フォージ・ダンジョン：魔導刻印と運命の塔',
    shortDescription:
      'ダイス4個・24面の「出目と刻印」を毎フロア彫り直し、共鳴役×レリックの乗算連鎖で全12階層を攻略する本格タクティカル・ダイス構築ローグライト！',
    howToPlay:
      '【コアループ】ダイスをタップして選び、4つの武器・魔導パネル（SWORD / DAGGER / SHIELD / ARCANA）に叩き込むと即座にヒーローが攻撃・防御を発動します。同じ出目や連番・偶奇を揃えると「共鳴役倍率」が発動し、ターン終了時に追撃フィニッシャーが炸裂します。\n【6面鍛造＆オートセーブ】フロア突破ごとにダイスの面を新しい魔導刻印へ彫り直せます（毎ターン自動セーブ対応）。',
    tags: ['シミュレーション', 'パズル'],
    accentColor: 'amber',
    createdAt: '2026-11-15',
    component: lazy(() => import('./dice-forge-dungeon')),
  },
]

export function getGameById(id: string): GameEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id)
}
