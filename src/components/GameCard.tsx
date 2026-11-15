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
          <div className="flex h-full w-full items-center justify-center bg-slate-900/90 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.28),transparent_70%)]" />
            <svg
              viewBox="0 0 120 120"
              className="h-24 w-24 drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
              aria-hidden="true"
            >
              {/* Crossed Blades Background */}
              <path
                d="M20 100 L100 20 M86 18 L102 18 L102 34"
                stroke="#f59e0b"
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M100 100 L20 20 M34 18 L18 18 L18 34"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
              {/* 3D Isometric Die Body */}
              <rect
                x="30"
                y="30"
                width="60"
                height="60"
                rx="14"
                fill="#1e293b"
                stroke="#fbbf24"
                strokeWidth="4"
              />
              <rect
                x="35"
                y="35"
                width="50"
                height="50"
                rx="10"
                fill="#0f172a"
                stroke="#475569"
                strokeWidth="1.5"
              />
              {/* 6 Pip Dots */}
              <circle cx="46" cy="45" r="4.5" fill="#fbbf24" />
              <circle cx="74" cy="45" r="4.5" fill="#fbbf24" />
              <circle cx="46" cy="60" r="4.5" fill="#38bdf8" />
              <circle cx="74" cy="60" r="4.5" fill="#38bdf8" />
              <circle cx="46" cy="75" r="4.5" fill="#f43f5e" />
              <circle cx="74" cy="75" r="4.5" fill="#f43f5e" />
            </svg>
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
