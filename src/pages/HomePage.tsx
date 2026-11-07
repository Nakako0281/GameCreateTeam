import { useMemo, useState } from 'react'
import { Gamepad2, Sparkles, ArrowUpDown } from 'lucide-react'
import { SITE_CONFIG } from '../config/site'
import { GAME_REGISTRY } from '../games/registry'
import { GameCard } from '../components/GameCard'
import type { GameTag } from '../types/game'

type SortOrder = 'newest' | 'oldest'

export function HomePage() {
  const [selectedTag, setSelectedTag] = useState<GameTag | 'ALL'>('ALL')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  // 登録されているゲームから使用中のタグ一覧を抽出
  const availableTags = useMemo(() => {
    const tagSet = new Set<GameTag>()
    for (const game of GAME_REGISTRY) {
      for (const tag of game.tags) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet)
  }, [])

  // 絞り込み＆ソート済みゲーム一覧
  const filteredGames = useMemo(() => {
    const list =
      selectedTag === 'ALL'
        ? [...GAME_REGISTRY]
        : GAME_REGISTRY.filter((g) => g.tags.includes(selectedTag))

    list.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.createdAt.localeCompare(a.createdAt)
      }
      return a.createdAt.localeCompare(b.createdAt)
    })

    return list
  }, [selectedTag, sortOrder])

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-16">
      {/* ポップなヘッダー */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-cyan-400 text-white shadow-md shadow-sky-200">
              <Gamepad2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-800 sm:text-xl">
                {SITE_CONFIG.title}
              </h1>
              <p className="text-[11px] font-medium text-slate-400 sm:text-xs">
                {SITE_CONFIG.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>{GAME_REGISTRY.length} GAMES</span>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
        {/* タグ絞り込み ＆ ソートバー */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* タグピル（スマホでは横スクロール可能） */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedTag('ALL')}
              className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-xs font-extrabold transition-all ${
                selectedTag === 'ALL'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              すべて
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-xs font-extrabold transition-all ${
                  selectedTag === tag
                    ? 'bg-sky-500 text-white shadow-sm shadow-sky-200'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* ソート切り替えボタン */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setSortOrder((prev) =>
                  prev === 'newest' ? 'oldest' : 'newest'
                )
              }
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 active:scale-95"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-sky-500" />
              <span>{sortOrder === 'newest' ? '新着順' : '古い順'}</span>
            </button>
          </div>
        </div>

        {/* ゲームカードグリッド（スマホ1〜2列、タブレット2〜3列、PC3〜4列） */}
        {filteredGames.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
            <p className="text-sm font-bold text-slate-400">
              該当するタグのゲームがまだありません
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
