import React from 'react'
import type { BuildArchetype, SlotId, StarterClassId } from './types'

export interface CanvasParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  alpha: number
  decay: number
  shape: 'spark' | 'slash' | 'ring' | 'bubble' | 'shard'
  angle?: number
}

export interface CanvasFloater {
  id: number
  x: number
  y: number
  vy: number
  text: string
  subtext?: string
  color: string
  scale: number
  alpha: number
  life: number
  maxLife: number
}

export interface SlashEffect {
  x: number
  y: number
  color: string
  secondaryColor: string
  progress: number
  type: 'sword' | 'dagger' | 'arcana' | 'shield' | 'alchemy' | 'enemy_claw'
}

export interface ArenaAnimState {
  time: number
  hitstopTimer: number
  screenShake: number
  redFlashAlpha: number
  goldFlashAlpha: number
  heroOffsetX: number
  heroOffsetY: number
  heroPose: 'idle' | 'slash' | 'guard' | 'cast' | 'hit'
  heroPoseTimer: number
  enemyOffsetX: number
  enemyOffsetY: number
  enemyFlashWhite: number
  enemyScale: number
  enemyPose: 'idle' | 'windup' | 'attack' | 'hit' | 'dead'
  enemyPoseTimer: number
  displayedHeroHp: number
  displayedHeroShield: number
  displayedEnemyHp: number
  displayedEnemyShield: number
  slashes: SlashEffect[]
  particles: CanvasParticle[]
  floaters: CanvasFloater[]
  comboBanner: { text: string; mult: string; alpha: number; scale: number } | null
}

const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [30, 25],
    [70, 25],
    [30, 50],
    [70, 50],
    [30, 75],
    [70, 75],
  ],
  7: [
    [28, 24],
    [72, 24],
    [28, 50],
    [50, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
  8: [
    [26, 24],
    [50, 24],
    [74, 24],
    [26, 50],
    [74, 50],
    [26, 76],
    [50, 76],
    [74, 76],
  ],
}

const ARCHETYPE_THEME: Record<
  BuildArchetype,
  {
    bgTop: string
    bgBottom: string
    border: string
    pip: string
    glow: string
  }
> = {
  balanced: {
    bgTop: '#334155',
    bgBottom: '#0f172a',
    border: '#94a3b8',
    pip: '#f8fafc',
    glow: '#38bdf8',
  },
  assassin: {
    bgTop: '#064e3b',
    bgBottom: '#022c22',
    border: '#34d399',
    pip: '#6ee7b7',
    glow: '#10b981',
  },
  fortress: {
    bgTop: '#1e3a8a',
    bgBottom: '#0f172a',
    border: '#60a5fa',
    pip: '#93c5fd',
    glow: '#3b82f6',
  },
  arcana: {
    bgTop: '#4c1d95',
    bgBottom: '#1e1b4b',
    border: '#c084fc',
    pip: '#e9d5ff',
    glow: '#a855f7',
  },
}

/**
 * 3D立体ピップダイスSVG（Unicode絵文字ゼロ・1〜6のピップドット＋属性紋章）
 */
export const PipDieSvg: React.FC<{
  pip: number
  archetype: BuildArchetype
  isSpecial?: boolean
  hasAttack?: boolean
  hasShield?: boolean
  hasPoison?: boolean
  hasMana?: boolean
  multiHit?: number
  size?: number
  className?: string
}> = ({
  pip,
  archetype,
  isSpecial = false,
  hasAttack = false,
  hasShield = false,
  hasPoison = false,
  hasMana = false,
  multiHit,
  size = 54,
  className = '',
}) => {
  const safePip = Math.max(1, Math.min(8, pip))
  const dots = PIP_POSITIONS[safePip] ?? PIP_POSITIONS[6]
  const theme = ARCHETYPE_THEME[archetype] ?? ARCHETYPE_THEME.balanced
  const gradId = `die-grad-${archetype}-${safePip}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`select-none overflow-visible ${className}`}
      aria-label={`Die pip ${safePip}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={theme.bgTop} />
          <stop offset="100%" stopColor={theme.bgBottom} />
        </linearGradient>
      </defs>

      {/* Drop Shadow & 3D Bevel Base */}
      <rect
        x="8"
        y="12"
        width="84"
        height="82"
        rx="20"
        fill="#020617"
        opacity="0.75"
      />
      <rect
        x="8"
        y="8"
        width="84"
        height="82"
        rx="20"
        fill={`url(#${gradId})`}
        stroke={isSpecial ? theme.border : '#64748b'}
        strokeWidth={isSpecial ? '4.5' : '3'}
      />
      {/* Inner Bevel Highlight */}
      <rect
        x="15"
        y="15"
        width="70"
        height="68"
        rx="14"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.14"
        strokeWidth="2"
      />

      {/* Subtle Runic Corner Markings for Special Engravings */}
      {isSpecial && (
        <path
          d="M22 15 L32 15 M15 22 L15 32 M78 15 L68 15 M85 22 L85 32"
          stroke={theme.border}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}

      {/* Pip Dots */}
      {dots.map(([cx, cy], idx) => (
        <g key={idx}>
          <circle cx={cx} cy={cy + 2} r="8.5" fill="#020617" opacity="0.6" />
          <circle
            cx={cx}
            cy={cy}
            r="8"
            fill={safePip === 1 ? '#fbbf24' : theme.pip}
            stroke="#0f172a"
            strokeWidth="1.5"
          />
          <circle cx={cx - 2.2} cy={cy - 2.2} r="2.3" fill="#ffffff" opacity="0.85" />
        </g>
      ))}

      {/* Corner Attribute Crest Badges (No Emojis) */}
      {hasAttack && (
        <g transform="translate(70, 6)">
          <circle cx="12" cy="12" r="11" fill="#e11d48" stroke="#fecdd3" strokeWidth="2" />
          <path
            d="M7 17 L17 7 M13 7 L17 7 L17 11"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}
      {hasPoison && (
        <g transform="translate(6, 6)">
          <circle cx="12" cy="12" r="11" fill="#059669" stroke="#a7f3d0" strokeWidth="2" />
          <path
            d="M12 5 C12 5 17 11 17 14.5 C17 17.5 14.8 19.5 12 19.5 C9.2 19.5 7 17.5 7 14.5 C7 11 12 5 12 5 Z"
            fill="#ffffff"
          />
        </g>
      )}
      {hasShield && !hasAttack && (
        <g transform="translate(70, 6)">
          <circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#bfdbfe" strokeWidth="2" />
          <path
            d="M12 5 L18 8 L18 13 C18 16.5 15.2 19 12 20 C8.8 19 6 16.5 6 13 L6 8 Z"
            fill="#ffffff"
          />
        </g>
      )}
      {hasMana && !hasPoison && (
        <g transform="translate(6, 6)">
          <circle cx="12" cy="12" r="11" fill="#7c3aed" stroke="#ddd6fe" strokeWidth="2" />
          <polygon points="12,4 18,12 12,20 6,12" fill="#ffffff" />
        </g>
      )}
      {multiHit && multiHit > 1 && (
        <g transform="translate(66, 68)">
          <rect
            x="0"
            y="0"
            width="28"
            height="18"
            rx="6"
            fill="#f59e0b"
            stroke="#fef3c7"
            strokeWidth="1.5"
          />
          <text
            x="14"
            y="13"
            textAnchor="middle"
            fill="#0f172a"
            fontSize="11"
            fontWeight="900"
          >
            x{multiHit}
          </text>
        </g>
      )}
    </svg>
  )
}

/**
 * 武器・アクションスロットのカスタムベクターイラスト（Unicode絵文字ゼロ）
 */
export const WeaponIconSvg: React.FC<{
  slotId: SlotId
  className?: string
}> = ({ slotId, className = 'h-7 w-7' }) => {
  switch (slotId) {
    case 'strike_1':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Broadsword */}
          <path
            d="M10 38 L38 10 M30 10 L38 10 L38 18"
            stroke="#fb7185"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M14 26 L22 34 M8 40 L14 34"
            stroke="#fda4af"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'strike_2':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Twin Crossed Blades */}
          <path
            d="M10 38 L38 10 M10 10 L38 38"
            stroke="#fbbf24"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="24" cy="24" r="5" fill="#fef08a" />
        </svg>
      )
    case 'guard_1':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Aegis Tower Shield */}
          <path
            d="M24 6 L40 12 L40 24 C40 34 32 40 24 43 C16 40 8 34 8 24 L8 12 Z"
            fill="#1d4ed8"
            stroke="#60a5fa"
            strokeWidth="3.5"
          />
          <path
            d="M24 12 L24 37 M14 22 L34 22"
            stroke="#dbeafe"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'arcana_1':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Arcane Starburst Core */}
          <polygon
            points="24,5 30,18 43,24 30,30 24,43 18,30 5,24 18,18"
            fill="#7c3aed"
            stroke="#ddd6fe"
            strokeWidth="3"
          />
          <circle cx="24" cy="24" r="5" fill="#ffffff" />
        </svg>
      )
    case 'alchemy_1':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
          {/* Alchemical Venom Flask */}
          <path
            d="M19 8 L29 8 M21 8 L21 17 L10 35 C8.5 38 10.5 41 14 41 L34 41 C37.5 41 39.5 38 38 35 L27 17 L27 8"
            fill="#065f46"
            stroke="#34d399"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13 32 L35 32 L37 37 L11 37 Z" fill="#10b981" />
          <circle cx="21" cy="28" r="2.5" fill="#a7f3d0" />
          <circle cx="27" cy="34" r="2" fill="#a7f3d0" />
        </svg>
      )
  }
}

/**
 * クラス選択用のカスタムベクターエンブレム（Unicode絵文字ゼロ）
 */
export const ClassCrestSvg: React.FC<{
  classId: StarterClassId
  className?: string
}> = ({ classId, className = 'h-12 w-12' }) => {
  if (classId === 'mage') {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#2e1065" stroke="#a855f7" strokeWidth="3" />
        <polygon points="32,10 39,25 54,32 39,39 32,54 25,39 10,32 25,25" fill="#c084fc" />
        <circle cx="32" cy="32" r="7" fill="#f8fafc" />
      </svg>
    )
  }
  if (classId === 'assassin') {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="#022c22" stroke="#10b981" strokeWidth="3" />
        <path
          d="M16 48 L48 16 M36 16 L48 16 L48 28"
          stroke="#34d399"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M32 36 C32 36 42 44 42 49 C42 53 37.5 56 32 56 C26.5 56 22 53 22 49 C22 44 32 36 32 36 Z"
          fill="#10b981"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="#172554" stroke="#3b82f6" strokeWidth="3" />
      <path
        d="M32 12 L50 20 L50 34 C50 45 42 52 32 55 C22 52 14 45 14 34 L14 20 Z"
        fill="#2563eb"
        stroke="#93c5fd"
        strokeWidth="3"
      />
      <path d="M32 19 L32 48 M20 31 L44 31" stroke="#eff6ff" strokeWidth="3.5" />
    </svg>
  )
}

/**
 * 60fps Canvas 2D ダンジョン戦場＆キャラクター描画エンジン
 * 絵文字を一切使わず、騎士・暗殺者・魔導師とモンスターの関節・武器・松明・斬撃エフェクトを描画する
 */
export function renderDungeonArena(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  anim: ArenaAnimState,
  params: {
    mode?: 'title' | 'class_select' | 'battle' | 'reward' | 'victory' | 'gameover'
    classId: StarterClassId
    floor: number
    area: number
    heroHp: number
    heroMaxHp: number
    heroShield: number
    heroMana: number
    enemyIcon: string
    enemyName: string
    enemyHp: number
    enemyMaxHp: number
    enemyShield: number
    enemyPoison: number
    enemyThorns: number
    enemyIntentDamage: number
    enemyIntentHits: number
    enemyIntentShield: number
    isBoss: boolean
    isElite: boolean
  }
): void {
  const t = anim.time
  ctx.save()

  // Screen Shake
  if (anim.screenShake > 0.2) {
    const dx = (Math.random() - 0.5) * anim.screenShake * 2
    const dy = (Math.random() - 0.5) * anim.screenShake * 1.5
    ctx.translate(dx, dy)
  }

  // 1. Stone Dungeon Background Sky/Wall
  const wallGrad = ctx.createLinearGradient(0, 0, 0, height)
  if (params.area === 1) {
    wallGrad.addColorStop(0, '#090d16')
    wallGrad.addColorStop(0.62, '#161f33')
    wallGrad.addColorStop(1, '#0b111e')
  } else if (params.area === 2) {
    wallGrad.addColorStop(0, '#13091c')
    wallGrad.addColorStop(0.62, '#241435')
    wallGrad.addColorStop(1, '#110a1f')
  } else {
    wallGrad.addColorStop(0, '#180814')
    wallGrad.addColorStop(0.62, '#2e1026')
    wallGrad.addColorStop(1, '#120612')
  }
  ctx.fillStyle = wallGrad
  ctx.fillRect(0, 0, width, height)

  const horizonY = Math.round(height * 0.66)

  // Stone Brick Pattern on Back Wall
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)'
  ctx.lineWidth = 1
  for (let row = 0; row < 5; row++) {
    const y = 18 + row * 24
    if (y >= horizonY) break
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    const offset = (row % 2) * 28
    for (let x = offset; x < width; x += 56) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, Math.min(horizonY, y + 24))
      ctx.stroke()
    }
  }

  // Dungeon Pillars (Left & Right)
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(18, 0, 26, horizonY)
  ctx.fillRect(width - 44, 0, 26, horizonY)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)'
  ctx.strokeRect(18, 0, 26, horizonY)
  ctx.strokeRect(width - 44, 0, 26, horizonY)

  // Flickering Wall Torches
  const torchPositions = [
    { x: 96, y: horizonY - 56 },
    { x: width - 96, y: horizonY - 56 },
  ]
  for (const tp of torchPositions) {
    const flicker = 0.88 + Math.sin(t * 14 + tp.x) * 0.12
    const glowR = 54 * flicker
    const glow = ctx.createRadialGradient(tp.x, tp.y, 2, tp.x, tp.y, glowR)
    glow.addColorStop(0, 'rgba(251, 191, 36, 0.42)')
    glow.addColorStop(0.5, 'rgba(245, 158, 11, 0.14)')
    glow.addColorStop(1, 'rgba(245, 158, 11, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(tp.x, tp.y, glowR, 0, Math.PI * 2)
    ctx.fill()

    // Torch bracket
    ctx.fillStyle = '#475569'
    ctx.fillRect(tp.x - 3, tp.y + 2, 6, 16)
    // Flame
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.moveTo(tp.x - 6, tp.y + 2)
    ctx.quadraticCurveTo(tp.x, tp.y - 16 * flicker, tp.x + 6, tp.y + 2)
    ctx.fill()
    ctx.fillStyle = '#fef08a'
    ctx.beginPath()
    ctx.moveTo(tp.x - 3, tp.y + 2)
    ctx.quadraticCurveTo(tp.x, tp.y - 10 * flicker, tp.x + 3, tp.y + 2)
    ctx.fill()
  }

  // 2. Perspective Dungeon Floor
  const floorGrad = ctx.createLinearGradient(0, horizonY, 0, height)
  floorGrad.addColorStop(0, '#1e293b')
  floorGrad.addColorStop(1, '#090d16')
  ctx.fillStyle = floorGrad
  ctx.fillRect(0, horizonY, width, height - horizonY)

  // Floor Horizon Line & Perspective Grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, horizonY)
  ctx.lineTo(width, horizonY)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)'
  ctx.lineWidth = 1
  const centerX = width * 0.5
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(centerX + i * 36, horizonY)
    ctx.lineTo(centerX + i * 78, height)
    ctx.stroke()
  }

  // Glowing Arcane Combat Circle on Floor
  ctx.save()
  ctx.translate(centerX, horizonY + 26)
  ctx.scale(1, 0.28)
  ctx.strokeStyle =
    params.isBoss
      ? 'rgba(244, 63, 94, 0.42)'
      : 'rgba(56, 189, 248, 0.30)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(0, 0, 128, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  // 3. Draw Hero Sprite (Left Side)
  const heroBaseX = width * 0.27 + anim.heroOffsetX
  const heroBaseY = horizonY + 20 + anim.heroOffsetY
  const heroBob = Math.sin(t * 4.5) * 2.5

  // Hero Shadow
  ctx.fillStyle = 'rgba(2, 6, 23, 0.65)'
  ctx.beginPath()
  ctx.ellipse(heroBaseX, horizonY + 24, 28, 8, 0, 0, Math.PI * 2)
  ctx.fill()

  drawHeroSprite(
    ctx,
    heroBaseX,
    heroBaseY + heroBob,
    params.classId,
    anim.heroPose,
    t
  )

  // Hero Active Shield Dome
  if (anim.displayedHeroShield > 0.5) {
    const shieldPulse = 0.85 + Math.sin(t * 6) * 0.15
    ctx.save()
    ctx.strokeStyle = `rgba(56, 189, 248, ${0.65 * shieldPulse})`
    ctx.fillStyle = `rgba(37, 99, 235, ${0.14 * shieldPulse})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(heroBaseX, heroBaseY - 26, 38, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // Hero Level Badge (Above Hero Head)
  {
    const lvX = heroBaseX
    const lvY = heroBaseY - 106
    ctx.save()
    ctx.fillStyle = '#0f172a'
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    roundRect(ctx, lvX - 28, lvY - 12, 56, 24, 12)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fde68a'
    ctx.font = '900 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`Lv.${params.floor}`, lvX, lvY + 0.5)
    ctx.restore()
  }

  // 4. Draw Monster Sprite (Right Side)
  const enemyBaseX = width * 0.73 + anim.enemyOffsetX
  const enemyBaseY = horizonY + 20 + anim.enemyOffsetY
  const enemyBob = Math.sin(t * 3.8 + 1.2) * 3

  // Enemy Shadow
  ctx.fillStyle = 'rgba(2, 6, 23, 0.7)'
  ctx.beginPath()
  ctx.ellipse(
    enemyBaseX,
    horizonY + 25,
    params.isBoss ? 40 : 32,
    10,
    0,
    0,
    Math.PI * 2
  )
  ctx.fill()

  ctx.save()
  ctx.translate(enemyBaseX, enemyBaseY + enemyBob)
  ctx.scale(anim.enemyScale, anim.enemyScale)
  drawMonsterSprite(
    ctx,
    0,
    0,
    params.enemyIcon,
    params.isBoss,
    anim.enemyFlashWhite > 0,
    t
  )
  ctx.restore()

  // 5. Draw Enemy Intent Badge (Above Enemy Head, clear of edges)
  if (params.enemyHp > 0 && params.mode !== 'title' && params.mode !== 'reward') {
    const intentX = enemyBaseX
    const intentY = heroBaseY - 106 + Math.sin(t * 5) * 1.5
    const totalIntentDmg = params.enemyIntentDamage * Math.max(1, params.enemyIntentHits)

    // Intent Pill Box
    ctx.save()
    ctx.fillStyle = totalIntentDmg >= 15 ? '#881337' : '#0f172a'
    ctx.strokeStyle = totalIntentDmg >= 15 ? '#fb7185' : '#f59e0b'
    ctx.lineWidth = 2
    roundRect(ctx, intentX - 40, intentY - 13, 80, 26, 13)
    ctx.fill()
    ctx.stroke()

    // Vector Sword Icon inside Intent Badge
    ctx.strokeStyle = '#fda4af'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(intentX - 26, intentY + 5)
    ctx.lineTo(intentX - 14, intentY - 7)
    ctx.moveTo(intentX - 20, intentY - 7)
    ctx.lineTo(intentX - 14, intentY - 7)
    ctx.lineTo(intentX - 14, intentY - 1)
    ctx.stroke()

    // Intent Damage Text
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const dmgLabel =
      params.enemyIntentHits > 1
        ? `${params.enemyIntentDamage}x${params.enemyIntentHits}`
        : `${params.enemyIntentDamage}`
    ctx.fillText(`ATK ${dmgLabel}`, intentX - 8, intentY + 0.5)
    ctx.restore()
  }

  // Title / Reward Center Emblem Overlay on Canvas
  if (params.mode === 'title') {
    ctx.save()
    ctx.translate(centerX, 68)
    const pulse = 1 + Math.sin(t * 3) * 0.03
    ctx.scale(pulse, pulse)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2.5
    roundRect(ctx, -138, -32, 276, 64, 16)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#fde68a'
    ctx.font = '900 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('DICE FORGE DUNGEON', 0, -8)

    ctx.fillStyle = '#94a3b8'
    ctx.font = '800 12px sans-serif'
    ctx.fillText('DESTINY TOWER ROGUELITE', 0, 14)
    ctx.restore()
  } else if (params.mode === 'reward') {
    ctx.save()
    ctx.translate(centerX, 46)
    ctx.fillStyle = 'rgba(6, 78, 59, 0.92)'
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 2.5
    roundRect(ctx, -124, -20, 248, 40, 14)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#ecfdf5'
    ctx.font = '900 15px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`STAGE ${params.floor} CLEAR!`, 0, 0)
    ctx.restore()
  }

  // 6. Draw Hero & Enemy Status Bars Directly on Canvas Bottom-Of-Sprites
  drawUnitStatusBar(ctx, heroBaseX, horizonY + 35, {
    hp: anim.displayedHeroHp,
    maxHp: params.heroMaxHp,
    actualHp: params.heroHp,
    shield: Math.round(anim.displayedHeroShield),
    poison: 0,
    thorns: 0,
    isHero: true,
  })

  drawUnitStatusBar(ctx, enemyBaseX, horizonY + 35, {
    hp: anim.displayedEnemyHp,
    maxHp: params.enemyMaxHp,
    actualHp: params.enemyHp,
    shield: Math.round(anim.displayedEnemyShield),
    poison: params.enemyPoison,
    thorns: params.enemyThorns,
    isHero: false,
  })

  // 7. Slash Trails & Weapon Impact Arcs
  for (const s of anim.slashes) {
    ctx.save()
    ctx.translate(s.x, s.y)
    const alpha = Math.max(0, 1 - s.progress)
    ctx.strokeStyle = s.color
    ctx.shadowColor = s.secondaryColor
    ctx.shadowBlur = 12
    ctx.globalAlpha = alpha

    if (s.type === 'sword' || s.type === 'enemy_claw') {
      ctx.lineWidth = 8 * (1 - s.progress * 0.5)
      ctx.beginPath()
      ctx.arc(
        0,
        0,
        46 + s.progress * 14,
        -Math.PI * 0.65,
        Math.PI * 0.35 * Math.min(1, s.progress * 2.2)
      )
      ctx.stroke()
    } else if (s.type === 'dagger') {
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(-36, -32)
      ctx.lineTo(36, 32)
      ctx.moveTo(36, -32)
      ctx.lineTo(-36, 32)
      ctx.stroke()
    } else if (s.type === 'arcana') {
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(0, 0, 18 + s.progress * 44, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.type === 'shield') {
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(0, 0, 26 + s.progress * 22, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  // 8. Particle Sparks & Shards
  for (const p of anim.particles) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, p.alpha)
    ctx.fillStyle = p.color
    ctx.strokeStyle = p.color
    if (p.shape === 'ring') {
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.stroke()
    } else if (p.shape === 'shard') {
      ctx.translate(p.x, p.y)
      ctx.rotate(p.angle ?? 0)
      ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size)
    } else {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // 9. Combo Banner Popup (Center Top)
  if (anim.comboBanner && anim.comboBanner.alpha > 0.02) {
    const cb = anim.comboBanner
    ctx.save()
    ctx.globalAlpha = cb.alpha
    ctx.translate(centerX, 26)
    ctx.scale(cb.scale, cb.scale)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 2
    roundRect(ctx, -74, -14, 148, 28, 14)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fde68a'
    ctx.font = '900 12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${cb.text} ${cb.mult}`, 0, 0)
    ctx.restore()
  }

  // 10. Floating Damage / Shield Popups
  for (const f of anim.floaters) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, f.alpha)
    ctx.translate(f.x, f.y)
    ctx.scale(f.scale, f.scale)
    ctx.font = '900 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#020617'
    ctx.strokeText(f.text, 0, 0)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, 0, 0)
    if (f.subtext) {
      ctx.font = '800 11px sans-serif'
      ctx.strokeText(f.subtext, 0, 16)
      ctx.fillStyle = '#fde68a'
      ctx.fillText(f.subtext, 0, 16)
    }
    ctx.restore()
  }

  // 11. Screen Flash Vignettes (Damage Red / Crit Gold)
  if (anim.redFlashAlpha > 0.01) {
    ctx.fillStyle = `rgba(225, 29, 72, ${anim.redFlashAlpha})`
    ctx.fillRect(0, 0, width, height)
  }
  if (anim.goldFlashAlpha > 0.01) {
    ctx.fillStyle = `rgba(251, 191, 36, ${anim.goldFlashAlpha})`
    ctx.fillRect(0, 0, width, height)
  }

  ctx.restore()
}

function drawHeroSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  classId: StarterClassId,
  pose: ArenaAnimState['heroPose'],
  t: number
): void {
  ctx.save()
  ctx.translate(x, y)

  if (pose === 'slash') {
    ctx.rotate(0.14)
  } else if (pose === 'hit') {
    ctx.rotate(-0.18)
  }

  const primary =
    classId === 'mage'
      ? '#7c3aed'
      : classId === 'assassin'
        ? '#059669'
        : '#2563eb'
  const accent =
    classId === 'mage'
      ? '#e9d5ff'
      : classId === 'assassin'
        ? '#6ee7b7'
        : '#93c5fd'

  // Flowing Cloak
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.moveTo(-14, -38)
  ctx.lineTo(-28 - Math.sin(t * 6) * 3, -4)
  ctx.lineTo(-8, -6)
  ctx.closePath()
  ctx.fill()

  // Legs
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-7, -16)
  ctx.lineTo(-10, -2)
  ctx.moveTo(7, -16)
  ctx.lineTo(11, -2)
  ctx.stroke()

  // Torso Armor / Robe
  ctx.fillStyle = primary
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  roundRect(ctx, -14, -42, 28, 28, 7)
  ctx.fill()
  ctx.stroke()

  // Chest Rune Emblem
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(0, -28, 4.5, 0, Math.PI * 2)
  ctx.fill()

  // Head & Helmet/Hood
  ctx.fillStyle = '#0f172a'
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, -52, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Glowing Eyes
  ctx.fillStyle = '#38bdf8'
  ctx.fillRect(2, -54, 4, 3)
  ctx.fillRect(8, -54, 3, 3)

  // Class Hat / Crest
  if (classId === 'mage') {
    ctx.fillStyle = '#5b21b6'
    ctx.beginPath()
    ctx.moveTo(-16, -58)
    ctx.lineTo(16, -58)
    ctx.lineTo(-4, -76)
    ctx.closePath()
    ctx.fill()
  } else if (classId === 'blacksmith') {
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-8, -62)
    ctx.lineTo(-14, -72)
    ctx.moveTo(8, -62)
    ctx.lineTo(14, -72)
    ctx.stroke()
  }

  // Right Arm & Weapon
  ctx.save()
  ctx.translate(12, -34)
  if (pose === 'slash') {
    ctx.rotate(0.75)
  } else if (pose === 'cast') {
    ctx.rotate(-0.45)
  } else {
    ctx.rotate(Math.sin(t * 4) * 0.08)
  }

  if (classId === 'mage') {
    // Arcane Staff
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(0, 14)
    ctx.lineTo(14, -26)
    ctx.stroke()
    ctx.fillStyle = '#c084fc'
    ctx.beginPath()
    ctx.arc(14, -28, 6, 0, Math.PI * 2)
    ctx.fill()
  } else if (classId === 'assassin') {
    // Glowing Venom Blade
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(24, -18)
    ctx.stroke()
  } else {
    // Runic Broadsword & Shield
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(2, 0)
    ctx.lineTo(24, -22)
    ctx.stroke()
  }
  ctx.restore()

  ctx.restore()
}

function drawMonsterSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  iconType: string,
  isBoss: boolean,
  flashWhite: boolean,
  t: number
): void {
  ctx.save()
  ctx.translate(x, y)
  if (isBoss) {
    ctx.scale(1.18, 1.18)
  }

  const bodyFill = flashWhite
    ? '#ffffff'
    : iconType === 'SLIME'
      ? '#059669'
      : iconType === 'GOBLIN'
        ? '#3f6212'
        : iconType === 'BEETLE'
          ? '#b45309'
          : iconType === 'GOLEM'
            ? '#475569'
            : iconType === 'WRAITH'
              ? '#4c1d95'
              : '#881337'

  const borderStroke = flashWhite
    ? '#fecdd3'
    : isBoss
      ? '#fb7185'
      : '#94a3b8'

  if (iconType === 'SLIME') {
    // Alchemical Slime Dome
    const squish = Math.sin(t * 6) * 3
    ctx.fillStyle = bodyFill
    ctx.strokeStyle = '#6ee7b7'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-28 - squish, 0)
    ctx.quadraticCurveTo(-30, -44 + squish, 0, -46 + squish)
    ctx.quadraticCurveTo(30, -44 + squish, 28 + squish, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Core & Eyes
    ctx.fillStyle = '#fef08a'
    ctx.beginPath()
    ctx.arc(-9, -22, 4, 0, Math.PI * 2)
    ctx.arc(7, -22, 4, 0, Math.PI * 2)
    ctx.fill()
  } else if (iconType === 'GOLEM' || iconType === 'AUTOMATON' || iconType === 'CHRONOS') {
    // Hulking Armored Colossus
    ctx.fillStyle = bodyFill
    ctx.strokeStyle = borderStroke
    ctx.lineWidth = 2.5
    roundRect(ctx, -24, -64, 48, 48, 8)
    ctx.fill()
    ctx.stroke()

    // Legs
    ctx.fillRect(-18, -16, 12, 16)
    ctx.fillRect(6, -16, 12, 16)

    // Glowing Furnace Core
    ctx.fillStyle = flashWhite ? '#ffffff' : '#f43f5e'
    ctx.beginPath()
    ctx.arc(0, -40, 8 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2)
    ctx.fill()

    // Visor Eyes
    ctx.fillStyle = '#fbbf24'
    ctx.fillRect(-12, -56, 24, 5)
  } else {
    // Raider / Beast / Dragon Silhouette
    ctx.fillStyle = bodyFill
    ctx.strokeStyle = borderStroke
    ctx.lineWidth = 2.5

    // Wings or Spikes
    ctx.beginPath()
    ctx.moveTo(0, -44)
    ctx.lineTo(28, -62 + Math.sin(t * 7) * 4)
    ctx.lineTo(18, -28)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Torso
    roundRect(ctx, -18, -48, 36, 34, 10)
    ctx.fill()
    ctx.stroke()

    // Head & Horns
    ctx.beginPath()
    ctx.arc(-2, -56, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Glowing Crimson Eyes
    ctx.fillStyle = '#fef08a'
    ctx.beginPath()
    ctx.arc(-7, -57, 3, 0, Math.PI * 2)
    ctx.arc(2, -57, 3, 0, Math.PI * 2)
    ctx.fill()

    // Enemy Weapon (Jagged Cleaver / Spear)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(-16, -30)
    ctx.lineTo(-34, -48 + Math.sin(t * 5) * 3)
    ctx.stroke()
  }

  ctx.restore()
}

function drawUnitStatusBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  info: {
    hp: number
    maxHp: number
    actualHp: number
    shield: number
    poison: number
    thorns: number
    isHero: boolean
  }
): void {
  const barW = 92
  const barH = 12
  const left = x - barW * 0.5

  ctx.save()
  // Bar Frame
  ctx.fillStyle = '#020617'
  ctx.strokeStyle = info.shield > 0 ? '#38bdf8' : '#334155'
  ctx.lineWidth = 1.5
  roundRect(ctx, left, y, barW, barH, 6)
  ctx.fill()

  // Smooth Lerp HP Fill
  const ratio = Math.max(0, Math.min(1, info.hp / Math.max(1, info.maxHp)))
  if (ratio > 0) {
    ctx.fillStyle = info.isHero ? '#10b981' : '#e11d48'
    roundRect(ctx, left + 1, y + 1, (barW - 2) * ratio, barH - 2, 5)
    ctx.fill()
  }

  ctx.strokeRect(left, y, barW, barH)

  // HP Numbers
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    `${Math.max(0, Math.round(info.actualHp))}/${info.maxHp}`,
    x,
    y + barH * 0.5 + 0.5
  )

  // Shield / Poison Badges next to HP bar
  if (info.shield > 0) {
    ctx.fillStyle = '#1d4ed8'
    ctx.strokeStyle = '#93c5fd'
    ctx.lineWidth = 1.5
    roundRect(ctx, left - 28, y - 1, 26, 14, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 9px sans-serif'
    ctx.fillText(`${info.shield}`, left - 15, y + 6)
  }

  if (info.poison > 0) {
    ctx.fillStyle = '#065f46'
    ctx.strokeStyle = '#34d399'
    ctx.lineWidth = 1.5
    roundRect(ctx, left + barW + 3, y - 1, 28, 14, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#a7f3d0'
    ctx.font = '900 9px sans-serif'
    ctx.fillText(`P${info.poison}`, left + barW + 17, y + 6)
  }

  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
