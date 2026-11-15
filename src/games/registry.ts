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
      '【1ダイス＝1技の即時バトル】ターン開始時に振られた4個のダイスには、ペアやストレート等の役倍率が即座に付きます。使うダイスを選んで「強斬撃(4〜6会心)・毒連撃(1〜3連撃)・鉄壁盾(偶数強化)・魔導砲(MP3必殺)」をタップするとその場で技が発動し、4個使い切ると敵の反撃ターンへ進みます。\n【レベルアップ＆スキル強化】敵を倒すと自動でレベルアップ（最大HP・基礎攻撃上昇）し、効果が明示された3択から強化を選んで次のステージへ進みます。',
    tags: ['シミュレーション', 'パズル'],
    accentColor: 'amber',
    createdAt: '2026-11-15',
    component: lazy(() => import('./dice-forge-dungeon')),
  },
]

export function getGameById(id: string): GameEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id)
}
