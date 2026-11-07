import { lazy } from 'react'
import type { GameEntry } from '../types/game'

/**
 * ゲーム一覧レジストリ
 * 新しいゲームを追加する際は、src/games/<id>/index.tsx を作成し、
 * この配列にエントリを1つ追加するだけでホーム画面とルーティングに自動反映されます。
 */
export const GAME_REGISTRY: GameEntry[] = [
  {
    id: 'shazai-angle-challenge',
    title: '緊急謝罪会見！ギリギリお辞儀チャレンジ',
    shortDescription:
      '「会社のプリンを無断完食した件」で緊急記者会見！？長押し加速＆指離しブレーキで黄金の謝罪角度を狙え！下げすぎると床を突き破りブラジルへ貫通！？',
    howToPlay:
      '【ルール＆操作方法】\n・画面下のボタンを「長押し」するとお辞儀が加速し、「指を離す」と慣性ブレーキで止まります。\n・第1問（45°）➔ 第2問（90°・フラッシュ目くらまし！）➔ 最終問（135°・床寸止め限界土下座！）の目標角度ピタリを狙ってください。\n・浅すぎると「逆ギレ大炎上🔥」、深すぎると「会見テーブル粉砕＆マントル貫通🌍」の放送事故になり、号外スクープ新聞が発行されます！',
    thumbnailEmoji: '🙇',
    accentColor: 'amber',
    tags: ['アクション', 'カジュアル'],
    createdAt: '2026-11-07',
    component: lazy(() => import('./shazai-angle-challenge')),
  },
  {
    id: 'candy-pop-reversi',
    title: 'キャンディ・ポップ・リバーシ',
    shortDescription:
      'ぷっくりキャンディ石がパタパタ弾ける！💣ボム＆🛡️シールドの「パーティーモード」と純粋な「クラシックモード」が遊べる新感覚リバーシ！',
    howToPlay:
      '【ルール＆操作方法】\n・相手のキャンディ石を上下・左右・斜めに挟むと自分の色（★コーラル）に裏返ります。\n・置けるマスには「+3」など裏返る合計枚数がガイド表示されます。\n・🎉パーティーモードでは、点対称に配置された「💣ボムマス（十字4マスの相手石もまとめて誘爆！）」と「🛡️シールドマス（ゲーム終了まで絶対裏返らない無敵キャンディになる！）」が登場します。\n・CPU難易度は「🐣よわい / 🐰ふつう / 🦁つよい」の3段階＋スマホ1台で遊べる「👥2人対戦」から選べます。',
    thumbnailEmoji: '🍬',
    accentColor: 'rose',
    tags: ['パズル', 'カジュアル'],
    createdAt: '2026-11-07',
    component: lazy(() => import('./candy-pop-reversi')),
  },
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
