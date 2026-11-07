import { lazy } from 'react'
import type { GameEntry } from '../types/game'

/**
 * プラットフォーム全体のゲームレジストリ
 * モックデータ（sample-01〜03）を廃止し、SNSバイラル特化の実ゲーム5本を収録
 */
export const GAME_REGISTRY: GameEntry[] = [
  {
    id: 'ihou-kenchiku-burger',
    title: '注文の多すぎる違法建築ハンバーガー',
    shortDescription:
      '肉厚パティから丸ごと伊勢エビ・巨大プリンまで積み上げろ！倒壊する前に「上バンズ納品」で利確する物理バランス×チキンレース！',
    howToPlay:
      '【ルール】左右にスイングする具材をタイミングよく「👇具材を落とす！」で積み上げましょう。\n【ど真ん中マシマシ】中央の黄金ゾーンに着地させると竹串ロックが発動し、傾きが半減＆高得点！\n【上バンズ納品（利確）】傾きが限界（±28°）を超えて倒壊する前に「🔔上バンズ納品」ボタンを押せば、そこまでの標高・カロリーを無傷でハイスコア確定できます！',
    tags: ['パズル', 'アクション', 'カジュアル'],
    thumbnailEmoji: '🍔',
    accentColor: 'sky',
    createdAt: '2026-11-07',
    component: lazy(() => import('./ihou-kenchiku-burger')),
  },
  {
    id: 'midnight-poem-defense',
    title: '深夜3時の黒歴史ポエム防衛',
    shortDescription:
      'AM3:00の暴走親指を止めろ！「漆黒の翼ポエム」や「宛先が全社LINEの罠メッセージ」を0.8秒で見極めてシュレッダー破棄する誤爆阻止パニック！',
    howToPlay:
      '【ルール】深夜3時のスマホ画面に次々と表示される送信寸前の下書きを、制限時間内に「🗑️シュレッダー破棄」か「📤そのまま送信」に仕分けましょう。\n【宛先トラップに注意！】本文がまともでも、宛先が「全社連絡LINE（148人）」や「元恋人」になっている罠カードは即シュレッダー破棄してください！',
    tags: ['シミュレーション', 'カジュアル'],
    thumbnailEmoji: '🌙',
    accentColor: 'violet',
    createdAt: '2026-11-07',
    component: lazy(() => import('./midnight-poem-defense')),
  },
  {
    id: 'teiji-taisha-parry',
    title: '17:59 定時退社パリィ！',
    shortDescription:
      '退勤1分前の攻防！迫りくる上司の「今日中でよろしく」を黄金サークルまで引きつけて有給届で物理反射（ジャストパリィ）せよ！',
    howToPlay:
      '【ルール】17時59分から18時00分までの退勤バトル！上司から飛んでくる赤・黄の「無茶振り弾」が黄金パリィ枠（78〜93%）に重なった瞬間に「⚡定時パリィ！」をタップして弾き返しましょう。\n【緑弾はスルー！】緑色の「寸志ボーナス・お疲れ様挨拶」をパリィすると人事部呼び出しでミスになります。「🙇お辞儀スルー」で受け取りましょう！',
    tags: ['アクション', 'カジュアル'],
    thumbnailEmoji: '⚡',
    accentColor: 'emerald',
    createdAt: '2026-11-07',
    component: lazy(() => import('./teiji-taisha-parry')),
  },
  {
    id: 'shazai-angle-challenge',
    title: '緊急謝罪会見！ギリギリお辞儀チャレンジ',
    shortDescription:
      '1プレイ15秒！ツルツル壇上で慣性に耐えながら「黄金の謝罪角度」でピタッと止めろ！浅いと炎上、深すぎると頭頂部強打のチキンレース！',
    howToPlay:
      '【ルール】不祥事のお題ごとに指定される「黄金の謝罪角度（例：45°〜55°）」を狙いましょう。\n【操作方法】下のボタンを長押しすると頭が下がり続け、指を離してもツルツル壇上の慣性で少し滑ってから止まります。ちょうど良い手前で指を離してピタッと止めれば記者団から大絶賛！',
    tags: ['アクション', 'シミュレーション', 'カジュアル'],
    thumbnailEmoji: '🙇',
    accentColor: 'amber',
    createdAt: '2026-11-07',
    component: lazy(() => import('./shazai-angle-challenge')),
  },
  {
    id: 'candy-pop-reversi',
    title: 'キャンディ・ポップ・リバーシ',
    shortDescription:
      '角を取ったら虹色コンボ！1プレイ2分で脳汁あふれる、ポップでジューシーな6×6スピードオセロ！',
    howToPlay:
      '6×6マスのスピードリバーシです。光っているガイドマスをタップしてキャンディを挟み、ひっくり返しましょう！四隅の「★ラッキーコーナー」を取ると大逆転ボーナス！',
    tags: ['パズル', 'カジュアル'],
    thumbnailEmoji: '🍬',
    accentColor: 'rose',
    createdAt: '2026-11-07',
    component: lazy(() => import('./candy-pop-reversi')),
  },
]

export function getGameById(id: string): GameEntry | undefined {
  return GAME_REGISTRY.find((game) => game.id === id)
}
