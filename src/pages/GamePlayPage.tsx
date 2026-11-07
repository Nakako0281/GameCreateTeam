import { Suspense, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  HelpCircle,
  RotateCcw,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { GAME_REGISTRY } from '../games/registry'

export function GamePlayPage() {
  const { gameId } = useParams<{ gameId: string }>()
  const game = GAME_REGISTRY.find((g) => g.id === gameId)

  // リスタートボタンでゲームコンポーネントを初期状態から再マウントするためのキー
  const [instanceKey, setInstanceKey] = useState(0)
  // 遊び方・紹介モーダルの開閉状態
  const [isInfoOpen, setIsInfoOpen] = useState(false)

  if (!game) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-500">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-lg font-extrabold text-slate-800">
          ゲームが見つかりませんでした
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          URLが間違っているか、削除された可能性があります。
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-sky-500 px-6 py-2.5 text-sm font-extrabold text-white shadow-md transition hover:bg-sky-600"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>ホームへ戻る</span>
        </Link>
      </div>
    )
  }

  const GameComponent = game.component

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-slate-900/95 md:p-4">
      {/*
        モバイルファースト共通ゲーム枠：
        - スマホ：画面いっぱい (100dvh × 100%)
        - PC (md以上)：中央固定のスマホ縦画面フレーム (最大幅430px)
      */}
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-white md:h-[min(92dvh,860px)] md:max-w-[430px] md:rounded-[2.25rem] md:border-[6px] md:border-white md:shadow-2xl">
        {/* スリムな共通上部ヘッダー */}
        <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
          {/* 左：ホームへ戻る */}
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-200 active:scale-95"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>ホーム</span>
          </Link>

          {/* 中央：ゲームタイトル */}
          <h1 className="mx-2 truncate text-sm font-extrabold text-slate-800">
            {game.title}
          </h1>

          {/* 右：紹介・遊び方モーダル ＆ リスタートボタン */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsInfoOpen(true)}
              title="遊び方・紹介"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-sky-50 text-sky-600 transition hover:bg-sky-100 active:scale-90"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setInstanceKey((prev) => prev + 1)}
              title="リスタート"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-amber-50 text-amber-600 transition hover:bg-amber-100 active:scale-90"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ゲームキャンバス領域（誤スクロール防止ロック付き） */}
        <main className="game-viewport-lock relative flex-1 overflow-hidden bg-slate-50">
          <Suspense
            fallback={
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                <span className="text-xs font-bold">ゲームを読み込み中...</span>
              </div>
            }
          >
            <GameComponent key={instanceKey} />
          </Suspense>

          {/* 遊び方・紹介モーダル（フレーム内オーバーレイ） */}
          {isInfoOpen && (
            <div className=" inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs absolute">
              <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">
                      {game.thumbnailEmoji ?? '🎮'}
                    </span>
                    <div>
                      <h2 className="text-base font-extrabold text-slate-800">
                        {game.title}
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        追加日: {game.createdAt}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsInfoOpen(false)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* 紹介文 */}
                <div className="mt-4 rounded-2xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
                  {game.shortDescription}
                </div>

                {/* 遊び方 */}
                <div className="mt-3 rounded-2xl bg-sky-50/70 p-3.5 text-xs leading-relaxed whitespace-pre-line text-slate-700">
                  {game.howToPlay}
                </div>

                <button
                  type="button"
                  onClick={() => setIsInfoOpen(false)}
                  className="mt-4 w-full cursor-pointer rounded-2xl bg-sky-500 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-sky-600 active:scale-98"
                >
                  ゲームに戻る
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
