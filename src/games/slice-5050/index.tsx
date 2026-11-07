import React, { useEffect, useRef, useState, useCallback } from 'react'
import { RotateCcw, Share2, Calendar, Shuffle } from 'lucide-react'
import {
  type Point,
  type CoreItem,
  type StageSpec,
  type StageTheme,
  type SliceResult,
  type SlicePreview,
  createStages,
  dateStringToSeed,
  getStageTransform,
  transformPoints,
  previewSlice,
  executeSlice,
  calculatePolygonCentroid,
} from './logic'
import {
  playAimTickSound,
  playSlashAndOpenSound,
  playPerfectShutterSound,
  playGoodBalanceSound,
  playIronCrashSound,
  playCatapultCrashSound,
} from './audio'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  alpha: number
  decay: number
  shape: 'circle' | 'shard' | 'spark'
  rot: number
  vRot: number
}

interface BrokenBladeShard {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vRot: number
  len: number
}

type GamePhase = 'AIMING' | 'SETTLING' | 'RESULT'

const CANVAS_W = 390
const CANVAS_H = 680
const OBJECT_BASE_CENTER: Point = { x: CANVAS_W / 2, y: 255 }
const SCALE_PIVOT: Point = { x: CANVAS_W / 2, y: 525 }
const SCALE_ARM_HALF = 112

const THEME_PALETTE: Record<
  StageTheme,
  {
    rind: string
    outerFill: string
    midFill: string
    innerFill: string
    cutRim: string
    juice: string[]
  }
> = {
  watermelon: {
    rind: '#15803d',
    outerFill: '#bbf7d0',
    midFill: '#f43f5e',
    innerFill: '#e11d48',
    cutRim: '#fda4af',
    juice: ['#f43f5e', '#fb7185', '#4ade80', '#ffffff'],
  },
  baumkuchen: {
    rind: '#451a03',
    outerFill: '#f59e0b',
    midFill: '#fde68a',
    innerFill: '#d97706',
    cutRim: '#fef3c7',
    juice: ['#fbbf24', '#fef08a', '#78350f', '#ffffff'],
  },
  wagyu: {
    rind: '#881337',
    outerFill: '#fda4af',
    midFill: '#e11d48',
    innerFill: '#fecdd3',
    cutRim: '#fff1f2',
    juice: ['#fb7185', '#fff1f2', '#f43f5e', '#fde047'],
  },
  geode: {
    rind: '#1e1b4b',
    outerFill: '#6366f1',
    midFill: '#a855f7',
    innerFill: '#e879f9',
    cutRim: '#f5d0fe',
    juice: ['#c084fc', '#38bdf8', '#f472b6', '#fef08a'],
  },
  monster: {
    rind: '#0f172a',
    outerFill: '#10b981',
    midFill: '#f97316',
    innerFill: '#ec4899',
    cutRim: '#fef08a',
    juice: ['#34d399', '#fb923c', '#f472b6', '#38bdf8', '#fde047'],
  },
}

function getTodayDateString(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function Slice5050Game() {
  const [isDailyMode, setIsDailyMode] = useState<boolean>(true)
  const [seed, setSeed] = useState<number>(() =>
    dateStringToSeed(getTodayDateString())
  )
  const [stages, setStages] = useState<StageSpec[]>(() =>
    createStages(dateStringToSeed(getTodayDateString()))
  )
  const [stageIndex, setStageIndex] = useState<number>(0)
  const [phase, setPhase] = useState<GamePhase>('AIMING')
  const [history, setHistory] = useState<SliceResult[]>([])
  const [currentResult, setCurrentResult] = useState<SliceResult | null>(null)
  const [hasInteracted, setHasInteracted] = useState<boolean>(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // リアルタイム物理・アニメーション用 Ref
  const animStateRef = useRef<{
    elapsedSec: number
    dragStart: Point | null
    dragCurr: Point | null
    preview: SlicePreview | null
    lastTickTime: number
    hitStopUntil: number
    shakeAmp: number
    flashAlpha: number
    slashLine: { start: Point; end: Point; alpha: number } | null
    settleElapsed: number
    scaleAngle: number
    scaleVel: number
    leftPieceOffset: { x: number; y: number; vx: number; vy: number; rot: number; vRot: number }
    rightPieceOffset: { x: number; y: number; vx: number; vy: number; rot: number; vRot: number }
    particles: Particle[]
    bladeShards: BrokenBladeShard[]
    glassCracks: Array<{ x1: number; y1: number; x2: number; y2: number }>
    floorSplitGap: number
  }>({
    elapsedSec: 0,
    dragStart: null,
    dragCurr: null,
    preview: null,
    lastTickTime: 0,
    hitStopUntil: 0,
    shakeAmp: 0,
    flashAlpha: 0,
    slashLine: null,
    settleElapsed: 0,
    scaleAngle: 0,
    scaleVel: 0,
    leftPieceOffset: { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vRot: 0 },
    rightPieceOffset: { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vRot: 0 },
    particles: [],
    bladeShards: [],
    glassCracks: [],
    floorSplitGap: 0,
  })

  const currentStage = stages[stageIndex] ?? stages[0]

  const resetStageAnim = useCallback(() => {
    const st = animStateRef.current
    st.dragStart = null
    st.dragCurr = null
    st.preview = null
    st.slashLine = null
    st.settleElapsed = 0
    st.scaleAngle = 0
    st.scaleVel = 0
    st.leftPieceOffset = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vRot: 0 }
    st.rightPieceOffset = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, vRot: 0 }
    st.particles = []
    st.bladeShards = []
    st.glassCracks = []
    st.floorSplitGap = 0
  }, [])

  const startNewRun = useCallback(
    (daily: boolean) => {
      const nextSeed = daily
        ? dateStringToSeed(getTodayDateString())
        : Math.floor(Math.random() * 900000) + 100000
      setIsDailyMode(daily)
      setSeed(nextSeed)
      setStages(createStages(nextSeed))
      setStageIndex(0)
      setHistory([])
      setCurrentResult(null)
      setPhase('AIMING')
      resetStageAnim()
    },
    [resetStageAnim]
  )

  // パーティクル生成ヘルパー
  const spawnParticles = useCallback(
    (
      origin: Point,
      count: number,
      colors: string[],
      shape: 'circle' | 'shard' | 'spark',
      speedScale = 1
    ) => {
      const list = animStateRef.current.particles
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = (60 + Math.random() * 280) * speedScale
        list.push({
          x: origin.x + (Math.random() - 0.5) * 40,
          y: origin.y + (Math.random() - 0.5) * 40,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 90,
          radius: shape === 'shard' ? 5 + Math.random() * 7 : 2.5 + Math.random() * 4.5,
          color: colors[i % colors.length],
          alpha: 1,
          decay: 0.55 + Math.random() * 0.55,
          shape,
          rot: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 14,
        })
      }
    },
    []
  )

  // 画面ガラスひび割れ生成
  const generateGlassCracks = useCallback((impact: Point) => {
    const cracks: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
    const rays = 14
    for (let i = 0; i < rays; i++) {
      const baseAngle = (i / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.25
      let cx = impact.x
      let cy = impact.y
      const steps = 4
      for (let s = 0; s < steps; s++) {
        const len = 35 + Math.random() * 65
        const a = baseAngle + (Math.random() - 0.5) * 0.35
        const nx = cx + Math.cos(a) * len
        const ny = cy + Math.sin(a) * len
        cracks.push({ x1: cx, y1: cy, x2: nx, y2: ny })
        // 枝分かれ
        if (s >= 1 && Math.random() > 0.35) {
          const ba = a + (Math.random() > 0.5 ? 0.55 : -0.55)
          cracks.push({
            x1: nx,
            y1: ny,
            x2: nx + Math.cos(ba) * 38,
            y2: ny + Math.sin(ba) * 38,
          })
        }
        cx = nx
        cy = ny
      }
    }
    animStateRef.current.glassCracks = cracks
  }, [])

  // スライス実行処理
  const triggerSlice = useCallback(
    (startPt: Point, endPt: Point) => {
      if (phase !== 'AIMING') return
      const st = animStateRef.current
      const { center, angleRad } = getStageTransform(
        currentStage,
        st.elapsedSec,
        OBJECT_BASE_CENTER
      )
      const worldVerts = transformPoints(currentStage.vertices, center, angleRad)
      const worldCores: CoreItem[] = currentStage.cores.map((c) => {
        const [tp] = transformPoints([c], center, angleRad)
        return { ...c, x: tp.x, y: tp.y }
      })

      const res = executeSlice(
        currentStage,
        worldVerts,
        worldCores,
        startPt,
        endPt
      )

      const nowMs = performance.now()
      const palette = THEME_PALETTE[currentStage.theme]

      st.slashLine = {
        start: res.cutStart,
        end: res.cutEnd,
        alpha: 1,
      }
      st.dragStart = null
      st.dragCurr = null
      st.preview = null
      st.settleElapsed = 0

      if (res.outcome === 'IRON_CRASH') {
        // 鉄芯激突：140msヒットストップ＋激しい画面振動＋刀身3分裂＋ガラスひび割れ
        st.hitStopUntil = nowMs + 140
        st.shakeAmp = 24
        st.flashAlpha = 0.95
        playIronCrashSound()
        generateGlassCracks(center)
        spawnParticles(
          center,
          160,
          ['#f97316', '#fde047', '#ffffff', '#ef4444'],
          'spark',
          1.35
        )
        st.bladeShards = [
          {
            x: center.x - 15,
            y: center.y - 20,
            vx: -180,
            vy: -260,
            rot: 0.2,
            vRot: -11,
            len: 54,
          },
          {
            x: center.x + 5,
            y: center.y,
            vx: 210,
            vy: -220,
            rot: -0.5,
            vRot: 14,
            len: 46,
          },
          {
            x: center.x,
            y: center.y + 20,
            vx: -60,
            vy: -310,
            rot: 1.1,
            vRot: 9,
            len: 62,
          },
        ]
        st.leftPieceOffset = {
          x: 0,
          y: 0,
          vx: 0,
          vy: 140,
          rot: 0,
          vRot: 0.6,
        }
      } else {
        // ポリゴン2分割成功（PERFECT / GOOD / CATAPULT_CRASH）
        st.hitStopUntil = nowMs + 55
        st.shakeAmp = res.outcome === 'CATAPULT_CRASH' ? 18 : 11
        st.flashAlpha = 0.85
        playSlashAndOpenSound()
        spawnParticles(center, 110, palette.juice, 'circle', 1.0)

        if (res.hitGoldCount > 0) {
          spawnParticles(
            center,
            70,
            ['#fde047', '#f59e0b', '#ffffff'],
            'spark',
            1.2
          )
        }

        // 左右の破片がまず法線方向へパカッと開きながら天秤へ落下する初速
        st.leftPieceOffset = {
          x: -14,
          y: -8,
          vx: -65,
          vy: -40,
          rot: -0.06,
          vRot: -0.45,
        }
        st.rightPieceOffset = {
          x: 14,
          y: -8,
          vx: 65,
          vy: -40,
          rot: 0.06,
          vRot: 0.45,
        }
      }

      setCurrentResult(res)
      setHistory((prev) => [...prev, res])
      setPhase('SETTLING')
    },
    [
      currentStage,
      generateGlassCracks,
      phase,
      spawnParticles,
    ]
  )

  // SETTLING フェーズ完了後の自動遷移タイマー
  useEffect(() => {
    if (phase !== 'SETTLING' || !currentResult) return

    const timer1 = window.setTimeout(() => {
      if (currentResult.outcome === 'PERFECT') {
        playPerfectShutterSound()
        animStateRef.current.flashAlpha = 0.75
        spawnParticles(
          SCALE_PIVOT,
          140,
          ['#fde047', '#38bdf8', '#f43f5e', '#4ade80', '#ffffff'],
          'shard',
          1.25
        )
      } else if (currentResult.outcome === 'GOOD') {
        playGoodBalanceSound()
      } else if (currentResult.outcome === 'CATAPULT_CRASH') {
        playCatapultCrashSound()
        animStateRef.current.shakeAmp = 22
        generateGlassCracks({ x: CANVAS_W * 0.28, y: 175 })
        spawnParticles(
          SCALE_PIVOT,
          130,
          ['#f97316', '#ef4444', '#78350f', '#fde047'],
          'shard',
          1.3
        )
      }
    }, 340)

    const timer2 = window.setTimeout(() => {
      const isCrash =
        currentResult.outcome === 'IRON_CRASH' ||
        currentResult.outcome === 'CATAPULT_CRASH'
      const isLastStage = stageIndex >= stages.length - 1

      if (isCrash || isLastStage) {
        setPhase('RESULT')
      } else {
        setStageIndex((prev) => prev + 1)
        setCurrentResult(null)
        setPhase('AIMING')
        resetStageAnim()
      }
    }, 1350)

    return () => {
      window.clearTimeout(timer1)
      window.clearTimeout(timer2)
    }
  }, [currentResult, phase, resetStageAnim, spawnParticles, stageIndex, stages.length])

  // 多層ポリゴン断面描画関数（ctx.clip を用いて外皮・年輪/果肉・種/サシ・断面ハイライトを描画）
  const drawMultiLayerPolygon = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      poly: Point[],
      theme: StageTheme,
      center: Point,
      isSlicedHalf: boolean
    ) => {
      if (poly.length < 3) return
      const palette = THEME_PALETTE[theme]

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(poly[0].x, poly[0].y)
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x, poly[i].y)
      }
      ctx.closePath()

      // ベース塗りつぶし
      ctx.fillStyle = palette.midFill
      ctx.fill()

      // 内部クリップで多層構造（年輪・霜降り・結晶・種）を描画
      ctx.clip()

      if (theme === 'baumkuchen') {
        // 10層のバウムクーヘン年輪リング
        for (let r = 115; r >= 15; r -= 11) {
          ctx.beginPath()
          ctx.arc(center.x, center.y, r, 0, Math.PI * 2)
          ctx.fillStyle = r % 22 === 0 ? '#fde68a' : '#d97706'
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = '#92400e'
          ctx.stroke()
        }
      } else if (theme === 'watermelon') {
        // スイカの果肉グラデーションと黒い種模様
        const grad = ctx.createRadialGradient(
          center.x,
          center.y,
          10,
          center.x,
          center.y,
          115
        )
        grad.addColorStop(0, '#e11d48')
        grad.addColorStop(0.78, '#f43f5e')
        grad.addColorStop(0.9, '#bbf7d0')
        grad.addColorStop(1, '#15803d')
        ctx.fillStyle = grad
        ctx.fillRect(center.x - 150, center.y - 150, 300, 300)

        // 種のリング配置
        ctx.fillStyle = '#0f172a'
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2
          const rad = i % 2 === 0 ? 46 : 72
          const sx = center.x + Math.cos(a) * rad
          const sy = center.y + Math.sin(a) * rad
          ctx.beginPath()
          ctx.ellipse(sx, sy, 3.5, 6, a + Math.PI / 2, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (theme === 'wagyu') {
        // 霜降りA5和牛のサシ網目模様
        ctx.fillStyle = '#e11d48'
        ctx.fillRect(center.x - 150, center.y - 150, 300, 300)
        ctx.strokeStyle = '#ffe4e6'
        ctx.lineWidth = 3.5
        for (let i = -5; i <= 5; i++) {
          ctx.beginPath()
          ctx.moveTo(center.x - 120, center.y + i * 22)
          ctx.bezierCurveTo(
            center.x - 40,
            center.y + i * 22 - 18,
            center.x + 40,
            center.y + i * 22 + 18,
            center.x + 120,
            center.y + i * 22
          )
          ctx.stroke()
        }
      } else if (theme === 'geode') {
        // アメジスト結晶ジオードの多角形層
        const radii = [110, 86, 64, 42, 22]
        const cols = ['#312e81', '#4f46e5', '#7e22ce', '#c084fc', '#fdf4ff']
        radii.forEach((rad, idx) => {
          ctx.beginPath()
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2
            const px = center.x + Math.cos(a) * rad
            const py = center.y + Math.sin(a) * rad
            if (k === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.closePath()
          ctx.fillStyle = cols[idx]
          ctx.fill()
        })
      } else {
        // monster: 極彩色モンスター太巻き断面
        const rings = [
          { r: 112, c: '#065f46' },
          { r: 94, c: '#fef3c7' },
          { r: 74, c: '#f97316' },
          { r: 52, c: '#ec4899' },
          { r: 30, c: '#10b981' },
        ]
        rings.forEach((ring) => {
          ctx.beginPath()
          ctx.arc(center.x, center.y, ring.r, 0, Math.PI * 2)
          ctx.fillStyle = ring.c
          ctx.fill()
        })
      }

      ctx.restore()

      // 外皮および切断面エッジの輪郭描画
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(poly[0].x, poly[0].y)
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(poly[i].x, poly[i].y)
      }
      ctx.closePath()
      ctx.lineWidth = isSlicedHalf ? 5 : 7
      ctx.strokeStyle = isSlicedHalf ? palette.cutRim : palette.rind
      ctx.stroke()
      ctx.restore()
    },
    []
  )

  // メインCanvas描画ループ
  useEffect(() => {
    let rafId = 0
    let lastTime = performance.now()

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now

      const st = animStateRef.current
      const isHitStopped = now < st.hitStopUntil

      if (!isHitStopped) {
        if (phase === 'AIMING') {
          st.elapsedSec += dt
        } else {
          st.settleElapsed += dt
        }

        // パーティクル更新
        for (let i = st.particles.length - 1; i >= 0; i--) {
          const p = st.particles[i]
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vy += 540 * dt
          p.rot += p.vRot * dt
          p.alpha -= p.decay * dt
          if (p.alpha <= 0) {
            st.particles.splice(i, 1)
          }
        }

        // 折れた刀身パーツ更新（0.35秒飛んだら画面ガラスに突き刺さって静止）
        if (st.settleElapsed < 0.35) {
          for (const shard of st.bladeShards) {
            shard.x += shard.vx * dt
            shard.y += shard.vy * dt
            shard.vy += 480 * dt
            shard.rot += shard.vRot * dt
          }
        }

        // SETTLING / RESULT 時の破片落下＆天秤シーソー物理更新
        if (currentResult) {
          const t = st.settleElapsed
          if (currentResult.outcome === 'IRON_CRASH') {
            // 丸ごとの塊が天秤へ落下して床ごと真っ二つに割る
            if (st.leftPieceOffset.y < 210) {
              st.leftPieceOffset.vy += 1250 * dt
              st.leftPieceOffset.y = Math.min(
                210,
                st.leftPieceOffset.y + st.leftPieceOffset.vy * dt
              )
            }
            st.floorSplitGap = Math.min(42, st.floorSplitGap + 180 * dt)
          } else {
            // 左右の破片が天秤の両皿へ落下
            const targetLeftY = 195 + Math.sin(st.scaleAngle) * (-SCALE_ARM_HALF)
            const targetRightY = 195 + Math.sin(st.scaleAngle) * SCALE_ARM_HALF

            if (t < 0.22) {
              // 落下フェーズ
              st.leftPieceOffset.x += st.leftPieceOffset.vx * dt
              st.leftPieceOffset.y = Math.min(
                targetLeftY,
                st.leftPieceOffset.y + 880 * dt
              )
              st.rightPieceOffset.x += st.rightPieceOffset.vx * dt
              st.rightPieceOffset.y = Math.min(
                targetRightY,
                st.rightPieceOffset.y + 880 * dt
              )
            } else {
              // 天秤皿に着地後：質量差によるシーソートルク物理
              const massDiff =
                (currentResult.rightRatio - currentResult.leftRatio) / 50
              if (currentResult.outcome === 'PERFECT') {
                // 水平0度へピタッと減衰収束
                const targetAngle = 0
                const spring = (targetAngle - st.scaleAngle) * 45
                st.scaleVel = (st.scaleVel + spring * dt) * 0.82
                st.scaleAngle += st.scaleVel * dt
                st.leftPieceOffset.y = targetLeftY
                st.rightPieceOffset.y = targetRightY
              } else if (currentResult.outcome === 'GOOD') {
                // 質量差に応じて傾きつつ耐える
                const targetAngle = Math.max(
                  -0.38,
                  Math.min(0.38, massDiff * 0.9)
                )
                const spring = (targetAngle - st.scaleAngle) * 38
                st.scaleVel = (st.scaleVel + spring * dt) * 0.85
                st.scaleAngle += st.scaleVel * dt
                st.leftPieceOffset.y = targetLeftY
                st.rightPieceOffset.y = targetRightY
              } else if (currentResult.outcome === 'CATAPULT_CRASH') {
                // 比率大崩壊：重い方が床を突き破り、軽い方が上空へカタパルト射出されて画面上部に突き刺さる！
                const heavyRight =
                  currentResult.rightRatio >= currentResult.leftRatio
                const targetAngle = heavyRight ? 0.68 : -0.68
                st.scaleAngle += (targetAngle - st.scaleAngle) * 14 * dt
                st.floorSplitGap = Math.min(34, st.floorSplitGap + 160 * dt)

                if (heavyRight) {
                  // 左の軽い破片が上空へカタパルト射出され、画面上部ガラス(y=-70)に激突して張り付く！
                  if (st.leftPieceOffset.y > -70) {
                    st.leftPieceOffset.vy -= 1850 * dt
                    st.leftPieceOffset.x = Math.max(
                      -85,
                      st.leftPieceOffset.x - 130 * dt
                    )
                    st.leftPieceOffset.y = Math.max(
                      -70,
                      st.leftPieceOffset.y + st.leftPieceOffset.vy * dt
                    )
                    st.leftPieceOffset.rot -= 8 * dt
                  }
                  st.rightPieceOffset.y = targetRightY + 26
                } else {
                  // 右の軽い破片が上空へカタパルト射出され、画面上部ガラス(y=-70)に激突して張り付く！
                  if (st.rightPieceOffset.y > -70) {
                    st.rightPieceOffset.vy -= 1850 * dt
                    st.rightPieceOffset.x = Math.min(
                      85,
                      st.rightPieceOffset.x + 130 * dt
                    )
                    st.rightPieceOffset.y = Math.max(
                      -70,
                      st.rightPieceOffset.y + st.rightPieceOffset.vy * dt
                    )
                    st.rightPieceOffset.rot += 8 * dt
                  }
                  st.leftPieceOffset.y = targetLeftY + 26
                }
              }
            }
          }
        }
      }

      // 画面振動とフラッシュ減衰
      st.shakeAmp *= 0.86
      if (st.shakeAmp < 0.3) st.shakeAmp = 0
      st.flashAlpha = Math.max(0, st.flashAlpha - dt * 3.2)
      if (st.slashLine) {
        st.slashLine.alpha = Math.max(0, st.slashLine.alpha - dt * 2.2)
      }

      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.save()
          ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

          // Screen Shake オフセット適用
          if (st.shakeAmp > 0) {
            const sx = (Math.random() - 0.5) * st.shakeAmp * 2
            const sy = (Math.random() - 0.5) * st.shakeAmp * 2
            ctx.translate(sx, sy)
          }

          // 1. 背景＆50:50対称ガイドライン描画
          const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
          bgGrad.addColorStop(0, '#0f172a')
          bgGrad.addColorStop(0.65, '#1e293b')
          bgGrad.addColorStop(1, '#090d16')
          ctx.fillStyle = bgGrad
          ctx.fillRect(-30, -30, CANVAS_W + 60, CANVAS_H + 60)

          // リザルト表示時は崩壊現場・天秤・断面が下部ドロワーに隠れないようカメラを上へパン
          if (phase === 'RESULT') {
            ctx.translate(0, -135)
          }

          // 中央の点線ガイド軸（50:50 基準線）
          ctx.save()
          ctx.setLineDash([6, 8])
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(CANVAS_W / 2, 70)
          ctx.lineTo(CANVAS_W / 2, SCALE_PIVOT.y)
          ctx.stroke()
          ctx.restore()

          // 2. 下部の物理天秤（檜まな板シーソー＆水平ターゲット枠）と床割れ・マグマ演出
          const splitGap = st.floorSplitGap
          if (splitGap > 0) {
            // 床が真っ二つに割れて赤いマグマが噴き出す演出
            const magmaGrad = ctx.createLinearGradient(
              CANVAS_W / 2 - splitGap,
              SCALE_PIVOT.y,
              CANVAS_W / 2 + splitGap,
              CANVAS_H
            )
            magmaGrad.addColorStop(0, '#ef4444')
            magmaGrad.addColorStop(0.5, '#fde047')
            magmaGrad.addColorStop(1, '#dc2626')
            ctx.fillStyle = magmaGrad
            ctx.beginPath()
            ctx.moveTo(CANVAS_W / 2 - splitGap, SCALE_PIVOT.y - 10)
            ctx.lineTo(CANVAS_W / 2 + splitGap, SCALE_PIVOT.y - 10)
            ctx.lineTo(CANVAS_W / 2 + splitGap * 1.6, CANVAS_H)
            ctx.lineTo(CANVAS_W / 2 - splitGap * 1.6, CANVAS_H)
            ctx.closePath()
            ctx.fill()
          }

          // 床台座（左右）
          ctx.fillStyle = '#334155'
          ctx.fillRect(
            0,
            SCALE_PIVOT.y + 42,
            CANVAS_W / 2 - splitGap,
            CANVAS_H - SCALE_PIVOT.y
          )
          ctx.fillRect(
            CANVAS_W / 2 + splitGap,
            SCALE_PIVOT.y + 42,
            CANVAS_W / 2,
            CANVAS_H - SCALE_PIVOT.y
          )

          // 天秤の水平ターゲット点線枠（ここが水平ならOKと一目で分かる緑のガイド）
          ctx.save()
          ctx.setLineDash([5, 5])
          ctx.strokeStyle =
            currentResult?.outcome === 'PERFECT'
              ? '#fde047'
              : 'rgba(52, 211, 153, 0.45)'
          ctx.lineWidth = 2.5
          ctx.strokeRect(
            SCALE_PIVOT.x - SCALE_ARM_HALF - 42,
            SCALE_PIVOT.y - 16,
            (SCALE_ARM_HALF + 42) * 2,
            24
          )
          ctx.restore()

          // 天秤の支柱（三角形ピボット）
          ctx.fillStyle = '#f59e0b'
          ctx.beginPath()
          ctx.moveTo(SCALE_PIVOT.x, SCALE_PIVOT.y - 4)
          ctx.lineTo(SCALE_PIVOT.x - 26 - splitGap * 0.4, SCALE_PIVOT.y + 44)
          ctx.lineTo(SCALE_PIVOT.x + 26 + splitGap * 0.4, SCALE_PIVOT.y + 44)
          ctx.closePath()
          ctx.fill()

          // 天秤のアームと左右の檜まな板皿
          ctx.save()
          ctx.translate(SCALE_PIVOT.x, SCALE_PIVOT.y)
          ctx.rotate(st.scaleAngle)

          // アームバー
          ctx.fillStyle =
            currentResult?.outcome === 'IRON_CRASH' ? '#ef4444' : '#cbd5e1'
          ctx.fillRect(-SCALE_ARM_HALF, -5, SCALE_ARM_HALF * 2, 10)

          // 左皿・右皿（檜のまな板トレイ）
          ctx.fillStyle = '#d97706'
          ctx.strokeStyle = '#fef3c7'
          ctx.lineWidth = 2
          // 左皿
          ctx.fillRect(-SCALE_ARM_HALF - 44, -14, 88, 14)
          ctx.strokeRect(-SCALE_ARM_HALF - 44, -14, 88, 14)
          // 右皿
          ctx.fillRect(SCALE_ARM_HALF - 44, -14, 88, 14)
          ctx.strokeRect(SCALE_ARM_HALF - 44, -14, 88, 14)

          // 皿の上の 50% 視覚バーインジケータ
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.font = 'bold 13px monospace'
          ctx.textAlign = 'center'
          ctx.fillText(
            currentResult ? `${currentResult.leftRatio.toFixed(1)}%` : '50%',
            -SCALE_ARM_HALF,
            22
          )
          ctx.fillText(
            currentResult ? `${currentResult.rightRatio.toFixed(1)}%` : '50%',
            SCALE_ARM_HALF,
            22
          )
          ctx.restore()

          // 3. メイン多層オブジェクト（切断前 or 切断後の左右ポリゴン）描画
          const { center, angleRad } = getStageTransform(
            currentStage,
            st.elapsedSec,
            OBJECT_BASE_CENTER
          )
          const worldVerts = transformPoints(
            currentStage.vertices,
            center,
            angleRad
          )
          const worldCores: CoreItem[] = currentStage.cores.map((c) => {
            const [tp] = transformPoints([c], center, angleRad)
            return { ...c, x: tp.x, y: tp.y }
          })

          if (phase === 'AIMING') {
            // 切断前：プルプル弾性揺れする多層オブジェクト本体
            drawMultiLayerPolygon(
              ctx,
              worldVerts,
              currentStage.theme,
              center,
              false
            )

            // 内部コア（黄金コア✨・超硬鉄芯💀）のX線レントゲン透視描画
            for (const core of worldCores) {
              const isGoldHit =
                st.preview?.hitGoldIds.includes(core.id) ?? false
              const isIronHit =
                core.type === 'iron' && (st.preview?.hitIron ?? false)

              ctx.save()
              if (core.type === 'gold') {
                // 黄金コア：輝く星型ジェム＋回転ターゲットリング
                ctx.beginPath()
                ctx.arc(core.x, core.y, core.radius + 5, 0, Math.PI * 2)
                ctx.setLineDash([4, 4])
                ctx.strokeStyle = isGoldHit ? '#ffffff' : '#fde047'
                ctx.lineWidth = isGoldHit ? 3.5 : 2
                ctx.stroke()

                ctx.beginPath()
                ctx.arc(core.x, core.y, core.radius, 0, Math.PI * 2)
                ctx.fillStyle = isGoldHit ? '#fef08a' : '#f59e0b'
                ctx.fill()
                ctx.lineWidth = 2.5
                ctx.strokeStyle = '#ffffff'
                ctx.stroke()

                // 中央の★マーク
                ctx.fillStyle = '#78350f'
                ctx.font = 'bold 16px sans-serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText('★', core.x, core.y + 1)
              } else {
                // 超硬鉄芯（💀）：トゲ付き黒鉄球＋赤パルス警告リング
                const jitterX = isIronHit ? (Math.random() - 0.5) * 6 : 0
                const jitterY = isIronHit ? (Math.random() - 0.5) * 6 : 0
                const cx = core.x + jitterX
                const cy = core.y + jitterY

                // トゲ（スパイク）描画
                ctx.fillStyle = isIronHit ? '#ef4444' : '#334155'
                for (let k = 0; k < 8; k++) {
                  const a = (k / 8) * Math.PI * 2 + st.elapsedSec * 1.5
                  ctx.beginPath()
                  ctx.moveTo(
                    cx + Math.cos(a) * (core.radius + 7),
                    cy + Math.sin(a) * (core.radius + 7)
                  )
                  ctx.lineTo(
                    cx + Math.cos(a - 0.25) * (core.radius - 2),
                    cy + Math.sin(a - 0.25) * (core.radius - 2)
                  )
                  ctx.lineTo(
                    cx + Math.cos(a + 0.25) * (core.radius - 2),
                    cy + Math.sin(a + 0.25) * (core.radius - 2)
                  )
                  ctx.closePath()
                  ctx.fill()
                }

                ctx.beginPath()
                ctx.arc(cx, cy, core.radius, 0, Math.PI * 2)
                ctx.fillStyle = '#0f172a'
                ctx.fill()
                ctx.lineWidth = 3
                ctx.strokeStyle = isIronHit ? '#ff2a55' : '#ef4444'
                ctx.stroke()

                ctx.font = '16px sans-serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText('💀', cx, cy + 1)
              }
              ctx.restore()
            }

            // ドラッグ中のリアルタイム切断予測レーザー描画
            if (st.dragStart && st.dragCurr && st.preview?.isValidDrag) {
              const pv = st.preview
              ctx.save()
              const laserColor = pv.hitIron
                ? '#ff2a55'
                : pv.hitGoldIds.length > 0
                  ? '#fde047'
                  : '#00f5d4'

              ctx.strokeStyle = laserColor
              ctx.lineWidth = pv.hitIron ? 4.5 : 3.5
              ctx.setLineDash(pv.hitIron ? [4, 4] : [10, 6])
              ctx.beginPath()
              ctx.moveTo(pv.lineStart.x, pv.lineStart.y)
              ctx.lineTo(pv.lineEnd.x, pv.lineEnd.y)
              ctx.stroke()

              // ポリゴンとの交点に火花サークルを表示
              for (const ipt of pv.intersectionPoints) {
                ctx.beginPath()
                ctx.arc(ipt.x, ipt.y, 7, 0, Math.PI * 2)
                ctx.fillStyle = '#ffffff'
                ctx.fill()
                ctx.lineWidth = 3
                ctx.strokeStyle = laserColor
                ctx.stroke()
              }
              ctx.restore()
            } else if (!hasInteracted) {
              // 開始0秒のノンバーバル指スワイプガイドアニメーション（👆 + 点線レーザー + SLICE）
              const cycle = (st.elapsedSec * 0.9) % 1
              const gx1 = center.x + 28
              const gy1 = center.y - 125
              const gx2 = center.x - 18
              const gy2 = center.y + 125
              const handX = gx1 + (gx2 - gx1) * cycle
              const handY = gy1 + (gy2 - gy1) * cycle

              ctx.save()
              ctx.setLineDash([8, 6])
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)'
              ctx.lineWidth = 3
              ctx.beginPath()
              ctx.moveTo(gx1, gy1)
              ctx.lineTo(handX, handY)
              ctx.stroke()

              // 指ガイドサークル＆アイコン
              ctx.beginPath()
              ctx.arc(handX, handY, 20, 0, Math.PI * 2)
              ctx.fillStyle = 'rgba(14, 165, 233, 0.35)'
              ctx.fill()
              ctx.lineWidth = 2
              ctx.strokeStyle = '#38bdf8'
              ctx.stroke()

              ctx.font = '24px sans-serif'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('👆', handX, handY + 4)

              ctx.font = '900 18px sans-serif'
              ctx.fillStyle = '#ffffff'
              ctx.fillText('SLICE', handX + 46, handY)
              ctx.restore()
            }
          } else if (currentResult) {
            // 切断後：左右に分割されたポリゴン断面が落下＆天秤に乗る（または吹っ飛ぶ）描画
            if (currentResult.leftPolygon.length >= 3) {
              const lc = calculatePolygonCentroid(currentResult.leftPolygon)
              ctx.save()
              ctx.translate(
                lc.x + st.leftPieceOffset.x,
                lc.y + st.leftPieceOffset.y
              )
              ctx.rotate(st.leftPieceOffset.rot)
              ctx.translate(-lc.x, -lc.y)
              drawMultiLayerPolygon(
                ctx,
                currentResult.leftPolygon,
                currentResult.theme,
                center,
                true
              )
              ctx.restore()
            }

            if (currentResult.rightPolygon.length >= 3) {
              const rc = calculatePolygonCentroid(currentResult.rightPolygon)
              ctx.save()
              ctx.translate(
                rc.x + st.rightPieceOffset.x,
                rc.y + st.rightPieceOffset.y
              )
              ctx.rotate(st.rightPieceOffset.rot)
              ctx.translate(-rc.x, -rc.y)
              drawMultiLayerPolygon(
                ctx,
                currentResult.rightPolygon,
                currentResult.theme,
                center,
                true
              )
              ctx.restore()
            }
          }

          // 4. 一閃レーザー残像ライン描画
          if (st.slashLine && st.slashLine.alpha > 0) {
            ctx.save()
            ctx.strokeStyle = `rgba(255, 255, 255, ${st.slashLine.alpha})`
            ctx.lineWidth = 10 * st.slashLine.alpha
            ctx.beginPath()
            ctx.moveTo(st.slashLine.start.x, st.slashLine.start.y)
            ctx.lineTo(st.slashLine.end.x, st.slashLine.end.y)
            ctx.stroke()
            ctx.restore()
          }

          // 5. 鉄芯激突時の折れた刀身パーツ描画
          for (const shard of st.bladeShards) {
            ctx.save()
            ctx.translate(shard.x, shard.y)
            ctx.rotate(shard.rot)
            ctx.fillStyle = '#e2e8f0'
            ctx.strokeStyle = '#94a3b8'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(-shard.len / 2, -6)
            ctx.lineTo(shard.len / 2, -2)
            ctx.lineTo(shard.len / 2 - 8, 7)
            ctx.lineTo(-shard.len / 2 + 5, 6)
            ctx.closePath()
            ctx.fill()
            ctx.stroke()
            ctx.restore()
          }

          // 6. パーティクル（果汁・火花・破片）描画
          for (const p of st.particles) {
            ctx.save()
            ctx.globalAlpha = Math.max(0, p.alpha)
            ctx.translate(p.x, p.y)
            ctx.rotate(p.rot)
            ctx.fillStyle = p.color
            if (p.shape === 'circle') {
              ctx.beginPath()
              ctx.arc(0, 0, p.radius, 0, Math.PI * 2)
              ctx.fill()
            } else if (p.shape === 'spark') {
              ctx.fillRect(-p.radius * 1.8, -1.5, p.radius * 3.6, 3)
            } else {
              ctx.fillRect(-p.radius, -p.radius * 0.7, p.radius * 2, p.radius * 1.4)
            }
            ctx.restore()
          }

          // 7. 画面ガラスひび割れオーバーレイ（IRON_CRASH時）
          if (st.glassCracks.length > 0) {
            ctx.save()
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)'
            ctx.lineWidth = 2
            ctx.beginPath()
            for (const c of st.glassCracks) {
              ctx.moveTo(c.x1, c.y1)
              ctx.lineTo(c.x2, c.y2)
            }
            ctx.stroke()
            ctx.restore()
          }

          // 8. 切断直後の1単語スタンプ＆巨大比率フィードバック
          if (currentResult && phase !== 'AIMING') {
            ctx.save()
            const stampText =
              currentResult.outcome === 'PERFECT'
                ? 'PERFECT 50:50!'
                : currentResult.outcome === 'GOOD'
                  ? 'BALANCED!'
                  : currentResult.outcome === 'IRON_CRASH'
                    ? 'BLADE SHATTERED!'
                    : 'CATAPULT CRASH!'
            const stampColor =
              currentResult.outcome === 'PERFECT'
                ? '#fde047'
                : currentResult.outcome === 'GOOD'
                  ? '#34d399'
                  : '#fb7185'

            ctx.font = '900 28px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillStyle = stampColor
            ctx.fillText(stampText, CANVAS_W / 2, 130)
            ctx.restore()
          }

          // 9. インパクト閃光フラッシュ
          if (st.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${st.flashAlpha})`
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
          }

          ctx.restore()
        }
      }

      rafId = window.requestAnimationFrame(render)
    }

    rafId = window.requestAnimationFrame(render)
    return () => window.cancelAnimationFrame(rafId)
  }, [currentResult, currentStage, drawMultiLayerPolygon, hasInteracted, phase])

  // Canvas上のポインター座標変換
  const getCanvasPoint = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'AIMING') return
    setHasInteracted(true)
    const pt = getCanvasPoint(e)
    const st = animStateRef.current
    st.dragStart = pt
    st.dragCurr = pt
    st.preview = null
    playAimTickSound(0, false, false)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = animStateRef.current
    if (phase !== 'AIMING' || !st.dragStart) return
    const pt = getCanvasPoint(e)
    st.dragCurr = pt

    const { center, angleRad } = getStageTransform(
      currentStage,
      st.elapsedSec,
      OBJECT_BASE_CENTER
    )
    const worldVerts = transformPoints(currentStage.vertices, center, angleRad)
    const worldCores: CoreItem[] = currentStage.cores.map((c) => {
      const [tp] = transformPoints([c], center, angleRad)
      return { ...c, x: tp.x, y: tp.y }
    })

    const pv = previewSlice(worldVerts, worldCores, st.dragStart, pt)
    st.preview = pv

    const now = performance.now()
    if (pv.isValidDrag && now - st.lastTickTime > 75) {
      st.lastTickTime = now
      const dy = pt.y - st.dragStart.y
      const dx = pt.x - st.dragStart.x
      const angleNorm = Math.atan2(dy, dx) / Math.PI
      playAimTickSound(angleNorm, pv.hitGoldIds.length > 0, pv.hitIron)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = animStateRef.current
    if (phase !== 'AIMING' || !st.dragStart) return
    const endPt = getCanvasPoint(e)
    const startPt = st.dragStart
    const dist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y)

    if (dist < 16) {
      // タップのみの場合は中心を通る斜めスワイプとして補助発火（操作ミス防止＆E2E対応）
      triggerSlice(
        { x: startPt.x - 110, y: startPt.y - 110 },
        { x: startPt.x + 110, y: startPt.y + 110 }
      )
    } else {
      triggerSlice(startPt, endPt)
    }
  }

  // 平均誤差とトータルスコア集計
  const totalScore = history.reduce((acc, r) => acc + r.scoreDelta, 0)
  const validSlices = history.filter((r) => r.outcome !== 'IRON_CRASH')
  const avgDiff =
    validSlices.length > 0
      ? (
          validSlices.reduce((acc, r) => acc + r.diffFrom50, 0) /
          validSlices.length
        ).toFixed(1)
      : '50.0'

  const handleShareX = () => {
    const last = history[history.length - 1]
    const ratioStr = last
      ? `${last.leftRatio.toFixed(1)}% : ${last.rightRatio.toFixed(1)}%`
      : '50.0% : 50.0%'
    const text = `🔪 SLICE 50:50 [${isDailyMode ? 'DAILY' : 'FREE'}]\nSTAGE ${history.length}/${stages.length} | RATIO: ${ratioStr} (AVG ±${avgDiff}%)\nSCORE: ${totalScore}\n#AIGameLab #Slice5050`
    const url = window.location.href
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950 select-none">
      {/* 上部スリムノンバーバルHUDオーバーレイ（数字・1単語のみ、最小12px以上） */}
      <div className="pointer-events-none absolute top-2 right-0 left-0 z-10 flex items-center justify-between px-3">
        {/* ステージ進行ドット */}
        <div className="flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 backdrop-blur-xs">
          {stages.map((s, idx) => (
            <span
              key={s.id}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                idx < stageIndex
                  ? 'bg-emerald-400'
                  : idx === stageIndex
                    ? 'scale-125 bg-amber-400'
                    : 'bg-slate-600'
              }`}
            />
          ))}
          <span className="ml-1 font-mono text-xs font-extrabold text-slate-200">
            {stageIndex + 1}/{stages.length}
          </span>
        </div>

        {/* 中央：目標 50:50 または切断結果比率の特大数字 */}
        <div className="rounded-2xl bg-slate-900/80 px-3.5 py-1 font-mono text-lg font-black tracking-tight text-white shadow-lg backdrop-blur-xs">
          {currentResult ? (
            <span
              className={
                currentResult.outcome === 'PERFECT'
                  ? 'text-amber-300'
                  : currentResult.outcome === 'GOOD'
                    ? 'text-emerald-300'
                    : 'text-rose-400'
              }
            >
              {currentResult.leftRatio.toFixed(1)}% :{' '}
              {currentResult.rightRatio.toFixed(1)}%
            </span>
          ) : (
            <span className="text-sky-300">50.0% : 50.0%</span>
          )}
        </div>

        {/* 右：DAILY / FREE シード切替ボタン */}
        <button
          type="button"
          onClick={() => startNewRun(!isDailyMode)}
          className="pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-full bg-slate-800/90 px-3 py-1.5 text-xs font-extrabold text-sky-300 shadow transition hover:bg-slate-700 active:scale-95"
        >
          {isDailyMode ? (
            <>
              <Calendar className="h-3.5 w-3.5" />
              <span>DAILY</span>
            </>
          ) : (
            <>
              <Shuffle className="h-3.5 w-3.5" />
              <span>FREE</span>
            </>
          )}
        </button>
      </div>

      {/* メイン物理＆断面ショーケースCanvas（画面占有率 90%+） */}
      <canvas
        ref={canvasRef}
        data-testid="slice-canvas"
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="h-full w-full touch-none object-contain"
      />

      {/* ノンバーバル・絵面リザルトオーバーレイ（崩壊現場Canvasを見せつつ断面標本図鑑を表示） */}
      {phase === 'RESULT' && (
        <div
          data-testid="slice-result-overlay"
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 rounded-t-3xl border-t border-slate-700/80 bg-slate-900/92 p-4 shadow-2xl backdrop-blur-md"
        >
          {/* 上段：1単語スタンプ＋特大比率・スコア */}
          <div className="flex items-center justify-between">
            <div>
              <span className="inline-block rounded-full bg-amber-400/20 px-3 py-0.5 font-mono text-xs font-extrabold text-amber-300">
                {currentResult?.outcome === 'IRON_CRASH'
                  ? 'SHATTERED'
                  : currentResult?.outcome === 'CATAPULT_CRASH'
                    ? 'CATAPULTED'
                    : '50:50 SLICER'}
              </span>
              <div className="mt-0.5 font-mono text-2xl font-black text-white">
                SCORE {totalScore}
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-xs font-bold text-slate-400">AVG DIFF</div>
              <div className="text-xl font-black text-emerald-400">
                ±{avgDiff}%
              </div>
            </div>
          </div>

          {/* 中段：切り出した実物ポリゴン断面標本コレクション（SVG描画） */}
          <div className="grid grid-cols-5 gap-1.5 rounded-2xl bg-slate-950/90 p-2.5">
            {stages.map((stSpec, idx) => {
              const rec = history[idx]
              const pal = THEME_PALETTE[stSpec.theme]
              return (
                <div
                  key={stSpec.id}
                  className="flex flex-col items-center rounded-xl border border-slate-800 bg-slate-900/80 p-1.5"
                >
                  <svg
                    viewBox="-140 -140 280 280"
                    className="h-12 w-12 overflow-visible"
                  >
                    {rec ? (
                      <>
                        {rec.leftPolygon.length >= 3 && (
                          <polygon
                            points={rec.leftPolygon
                              .map(
                                (p) =>
                                  `${p.x - OBJECT_BASE_CENTER.x - 10},${p.y - OBJECT_BASE_CENTER.y}`
                              )
                              .join(' ')}
                            fill={pal.midFill}
                            stroke={pal.cutRim}
                            strokeWidth="8"
                          />
                        )}
                        {rec.rightPolygon.length >= 3 && (
                          <polygon
                            points={rec.rightPolygon
                              .map(
                                (p) =>
                                  `${p.x - OBJECT_BASE_CENTER.x + 10},${p.y - OBJECT_BASE_CENTER.y}`
                              )
                              .join(' ')}
                            fill={pal.innerFill}
                            stroke={pal.cutRim}
                            strokeWidth="8"
                          />
                        )}
                      </>
                    ) : (
                      <polygon
                        points={stSpec.vertices
                          .map((p) => `${p.x},${p.y}`)
                          .join(' ')}
                        fill="#334155"
                      />
                    )}
                  </svg>
                  <span className="mt-1 font-mono text-xs font-extrabold text-slate-200">
                    {rec
                      ? rec.outcome === 'IRON_CRASH'
                        ? '💀'
                        : `${Math.round(rec.leftRatio)}:${Math.round(rec.rightRatio)}`
                      : '--'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 下段：𝕏 SHARE ＆ RETRY 大型ボタン */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleShareX}
              className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 text-sm font-black text-white shadow-lg transition hover:bg-sky-400 active:scale-95"
            >
              <Share2 className="h-4 w-4" />
              <span>𝕏 SHARE</span>
            </button>
            <button
              type="button"
              onClick={() => startNewRun(isDailyMode)}
              className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-black text-slate-950 shadow-lg transition hover:bg-amber-400 active:scale-95"
            >
              <RotateCcw className="h-4 w-4" />
              <span>RETRY ({seed % 1000})</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
