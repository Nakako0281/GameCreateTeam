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
      '【コアループ】敵の確定行動予告を見て4個のダイスを振り（リロール・マナ操作可）、5つのスロット（⚔️斬撃/🛡️障壁/🔮魔導/⚗️錬金）へ配置しましょう。同じ出目や連番・偶奇を揃えると「共鳴役倍率」が発動し、レリック倍率と掛け算で出力が跳ね上がります！\n【6面鍛造＆オートセーブ】フロア突破ごとにダイスの面を新しい魔導刻印へ彫り直せます。小目(1・2)毒連撃、偶数シールド反撃、高出目魔導バーストなど多彩なビルドを開拓しましょう（毎ターン自動セーブ対応）。',
    tags: ['シミュレーション', 'パズル'],
    thumbnailEmoji: '🎲',
    accentColor: 'amber',
    createdAt: '2026-11-15',
    component: lazy(() => import('./dice-forge-dungeon')),
  },
]

export function getGameById(id: string): GameEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id)
}
