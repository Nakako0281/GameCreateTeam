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
      '【シンプルな王道バトル】ターン開始時に振られた4個のダイスには、ペアやストレート等のボーナス倍率が即座に付きます。ダイスを選んで「斬撃・毒連撃・盾防御・魔導」をタップすると即座に攻撃や防御が発動し、4個使い切る（または撃破確定する）と敵ターンへ進みます。\n【レベルアップ＆スキル強化】ステージの敵を倒すと自動でレベルアップ（最大HP・攻撃力上昇）し、3択から新たなスキルを獲得して次のステージへ進みます。',
    tags: ['シミュレーション', 'パズル'],
    accentColor: 'amber',
    createdAt: '2026-11-15',
    component: lazy(() => import('./dice-forge-dungeon')),
  },
]

export function getGameById(id: string): GameEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id)
}
