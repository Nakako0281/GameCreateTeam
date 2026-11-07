import { lazy } from 'react'
import type { GameEntry } from '../types/game'

/**
 * ゲーム一覧レジストリ
 * 新しいゲームを追加する際は、src/games/<id>/index.tsx を作成し、
 * この配列にエントリを1つ追加するだけでホーム画面とルーティングに自動反映されます。
 */
export const GAME_REGISTRY: GameEntry[] = [
  {
    id: 'sample-01',
    title: 'サンプルゲーム 01',
    shortDescription:
      'ゲームカードの見た目と画面遷移を確認するためのプレースホルダーです。',
    howToPlay:
      '【操作方法】\nタップまたはスワイプで操作する想定のダミー画面です。\n実際のゲームを作ったらここにルールや操作説明を記載します。',
    thumbnailEmoji: '🎮',
    accentColor: 'sky',
    tags: ['アクション', 'カジュアル'],
    createdAt: '2026-11-07',
    component: lazy(() => import('./sample-01')),
  },
  {
    id: 'sample-02',
    title: 'サンプルゲーム 02',
    shortDescription:
      'タグ絞り込みやソート機能の動作確認用ダミーゲーム（パズル枠）です。',
    howToPlay:
      '【操作方法】\nパズルゲームのプレースホルダーです。\n上部の「🔄」ボタンでゲームコンポーネントがリセット（再マウント）されます。',
    thumbnailEmoji: '🧩',
    accentColor: 'amber',
    tags: ['パズル', 'カジュアル'],
    createdAt: '2026-11-06',
    component: lazy(() => import('./sample-02')),
  },
  {
    id: 'sample-03',
    title: 'サンプルゲーム 03',
    shortDescription:
      'Three.jsなどの3Dゲームを追加する際のダミープレースホルダーです。',
    howToPlay:
      '【操作方法】\n3D・シューティング系ゲームのプレースホルダーです。\nReact.lazyにより、このカードを開いたときだけコードが読み込まれます。',
    thumbnailEmoji: '🚀',
    accentColor: 'violet',
    tags: ['3D', 'シューティング'],
    createdAt: '2026-11-05',
    component: lazy(() => import('./sample-03')),
  },
]
