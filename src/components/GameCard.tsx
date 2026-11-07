import { Link } from 'react-router-dom'
import { Play, Calendar } from 'lucide-react'
import type { GameEntry } from '../types/game'

const ACCENT_STYLES: Record<
  NonNullable<GameEntry['accentColor']>,
  {
    thumbBg: string
    badge: string
    playBtn: string
    borderHover: string
  }
> = {
  sky: {
    thumbBg: 'from-sky-400 to-cyan-300',
    badge: 'bg-sky-100 text-sky-700',
    playBtn: 'bg-sky-500 text-white group-hover:bg-sky-600',
    borderHover: 'hover:border-sky-300',
  },
  amber: {
    thumbBg: 'from-amber-400 to-yellow-300',
    badge: 'bg-amber-100 text-amber-800',
    playBtn: 'bg-amber-500 text-white group-hover:bg-amber-600',
    borderHover: 'hover:border-amber-300',
  },
  rose: {
    thumbBg: 'from-rose-400 to-pink-300',
    badge: 'bg-rose-100 text-rose-700',
    playBtn: 'bg-rose-500 text-white group-hover:bg-rose-600',
    borderHover: 'hover:border-rose-300',
  },
  emerald: {
    thumbBg: 'from-emerald-400 to-teal-300',
    badge: 'bg-emerald-100 text-emerald-800',
    playBtn: 'bg-emerald-500 text-white group-hover:bg-emerald-600',
    borderHover: 'hover:border-emerald-300',
  },
  violet: {
    thumbBg: 'from-violet-500 to-fuchsia-400',
    badge: 'bg-violet-100 text-violet-700',
    playBtn: 'bg-violet-500 text-white group-hover:bg-violet-600',
    borderHover: 'hover:border-violet-300',
  },
}

interface GameCardProps {
  game: GameEntry
}

export function GameCard({ game }: GameCardProps) {
  const style = ACCENT_STYLES[game.accentColor ?? 'sky']

  return (
    <Link
      to={`/games/${game.id}`}
      className={`group flex flex-col overflow-hidden rounded-3xl border-2 border-slate-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] ${style.borderHover}`}
    >
      {/* サムネイル領域 */}
      <div
        className={`relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br ${style.thumbBg}`}
      >
        {game.thumbnailUrl ? (
          <img
            src={game.thumbnailUrl}
            alt={game.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-6xl drop-shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
              {game.thumbnailEmoji ?? '🎮'}
            </span>
          </div>
        )}

        {/* 右下のPLAYバッジ */}
        <div
          className={`absolute right-3 bottom-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold shadow-md transition-colors ${style.playBtn}`}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>PLAY</span>
        </div>
      </div>

      {/* テキスト・メタ情報領域 */}
      <div className="flex flex-1 flex-col p-4">
        {/* タグ＆日付 */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap gap-1">
            {game.tags.map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${style.badge}`}
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <Calendar className="h-3 w-3" />
            {game.createdAt}
          </span>
        </div>

        {/* タイトル */}
        <h2 className="text-base font-extrabold text-slate-800 group-hover:text-sky-600 sm:text-lg">
          {game.title}
        </h2>

        {/* 紹介文 */}
        <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
          {game.shortDescription}
        </p>
      </div>
    </Link>
  )
}
