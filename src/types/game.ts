import type { LazyExoticComponent, ComponentType } from 'react'

export type GameTag =
  | 'アクション'
  | 'パズル'
  | '3D'
  | 'カジュアル'
  | 'シューティング'
  | 'シミュレーション'
  | 'その他'

export interface GameEntry {
  /** URLパス（/games/:id）および一意識別子 */
  id: string
  /** ゲームタイトル */
  title: string
  /** カード一覧に表示する短い紹介文 */
  shortDescription: string
  /** ゲーム画面の「？ 遊び方・紹介」モーダルに表示する詳細説明・操作方法 */
  howToPlay: string
  /** サムネイル画像URL（未指定時はポップなグラデーション＋絵文字サムネイルを表示） */
  thumbnailUrl?: string
  /** サムネイル画像がない場合のアイコン絵文字 */
  thumbnailEmoji?: string
  /** カードのアクセントカラー（Tailwindグラデーション用プリセット名） */
  accentColor?: 'sky' | 'amber' | 'rose' | 'emerald' | 'violet'
  /** カテゴリ・特徴タグ */
  tags: GameTag[]
  /** 追加日（YYYY-MM-DD） */
  createdAt: string
  /** React.lazyで遅延読み込みするゲーム本体コンポーネント */
  component: LazyExoticComponent<ComponentType>
}
