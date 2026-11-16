import { lazy } from 'react'
import type { GameEntry } from '../types/game'

/**
 * プラットフォーム全体のゲームレジストリ
 * 新体制（高リトライ性ゲーム制作方針）のゲームを収録
 */
export const GAME_REGISTRY: GameEntry[] = [
  {
    id: 'dice-forge-dungeon',
    title: 'ダイス・フォージ・ダンジョン：魔導と運命の塔',
    shortDescription:
      '毎ターン振る4つの運命ダイスで4大コマンドを発動し、敵を倒してレベルアップしながら全12ステージの踏破を目指す王道ローグライトRPG！',
    howToPlay:
      '【出目ロール＆狙って発動】毎ターン振られる4個のダイスで役倍率を高め、技を1タップして戦場予測（敵HP・被弾ガード可否）を確認してから再タップまたはドラッグ＆ドロップで発動します。ターン内は1手戻すことも可能です。\n【レベルアップ＆スキル強化】敵を倒すと自動でレベルアップ（最大HP・基礎攻撃上昇）し、効果が明示された3択から強化を選んで全12ステージの踏破を目指します。',
    tags: ['シミュレーション', 'パズル'],
    accentColor: 'amber',
    createdAt: '2026-11-15',
    component: lazy(() => import('./dice-forge-dungeon')),
  },
]

export function getGameById(id: string): GameEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id)
}
