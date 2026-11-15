import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dices,
  Gem,
  Lock,
  Play,
  RotateCcw,
  Swords,
  TrendingUp,
  Trophy,
  Unlock,
  X,
  Zap,
} from 'lucide-react'
import {
  ENGRAVINGS,
  RELICS,
  STARTER_CLASSES,
} from './data'
import {
  calculateSingleDieAction,
  calculateTurnPreview,
  initGameState,
  step,
} from './logic'
import {
  clearActiveRun,
  loadActiveRun,
  loadMetaProfile,
  recordRunCompletion,
  saveActiveRun,
} from './storage'
import { playSound } from './audio'
import type {
  EngravingDef,
  EngravingId,
  GameState,
  RelicId,
  SingleDieActionPreview,
  SlotId,
  StarterClassId,
} from './types'
import {
  ClassCrestSvg,
  PipDieSvg,
  WeaponIconSvg,
  renderDungeonArena,
  type ArenaAnimState,
} from './visuals'

const COMMAND_CARDS: {
  id: SlotId
  title: string
  conditionLabel: string
  borderClass: string
  activeRingClass: string
  badgeClass: string
}[] = [
  {
    id: 'strike_1',
    title: '強斬撃',
    conditionLabel: '4〜6会心',
    borderClass: 'border-rose-500/60 hover:border-rose-400',
    activeRingClass: 'ring-1 ring-amber-400/70 border-amber-400',
    badgeClass: 'bg-rose-500/25 text-rose-200',
  },
  {
    id: 'strike_2',
    title: '毒連撃',
    conditionLabel: '1〜3連撃',
    borderClass: 'border-emerald-500/60 hover:border-emerald-400',
    activeRingClass: 'ring-1 ring-amber-400/70 border-amber-400',
    badgeClass: 'bg-emerald-500/25 text-emerald-200',
  },
  {
    id: 'guard_1',
    title: '鉄壁盾',
    conditionLabel: '偶数強化',
    borderClass: 'border-sky-500/60 hover:border-sky-400',
    activeRingClass: 'ring-1 ring-amber-400/70 border-amber-400',
    badgeClass: 'bg-sky-500/25 text-sky-200',
  },
  {
    id: 'arcana_1',
    title: '魔導砲',
    conditionLabel: 'MP3必殺',
    borderClass: 'border-violet-500/60 hover:border-violet-400',
    activeRingClass: 'ring-1 ring-amber-400/70 border-amber-400',
    badgeClass: 'bg-violet-500/25 text-violet-200',
  },
]

const CLASS_SHORT_NAMES: Record<StarterClassId, string> = {
  mage: '魔導師',
  assassin: '暗殺者',
  blacksmith: '重騎士',
}

const FORMATION_SHORT_LABELS: Record<string, string> = {
  none: '役なし',
  one_pair: 'ワンペア',
  two_pair: 'ツーペア',
  straight: 'ストレート',
  three_kind: '3カード',
  four_kind: '4カード',
}

function formatEngravingEffectParts(eng: EngravingDef): string[] {
  const parts: string[] = []
  if (eng.bonusAttack) parts.push(`威力+${eng.bonusAttack}`)
  if (eng.bonusShield) parts.push(`盾+${eng.bonusShield}`)
  if (eng.applyPoison) parts.push(`毒+${eng.applyPoison}`)
  if (eng.bonusMana) parts.push(`MP+${eng.bonusMana}`)
  if (eng.multiHit && eng.multiHit > 1) parts.push(`${eng.multiHit}連撃`)
  if (eng.multiplyEnemyPoison) parts.push(`毒x${eng.multiplyEnemyPoison}`)
  if (eng.shieldBashRatio)
    parts.push(`盾${Math.round(eng.shieldBashRatio * 100)}%追撃`)
  if (eng.applyThorns) parts.push(`棘+${eng.applyThorns}`)
  if (eng.healHp) parts.push(`回復+${eng.healHp}`)
  if (eng.manaOverchargeScale) parts.push(`MPx${eng.manaOverchargeScale}砲`)
  if (eng.comboMultAdd) parts.push(`役+${eng.comboMultAdd.toFixed(2)}倍`)
  if (eng.boostOtherPip) parts.push(`他出目+${eng.boostOtherPip}`)
  if (eng.permanentEvenBonus) parts.push(`偶数永続+${eng.permanentEvenBonus}`)
  if (eng.rerollGain) parts.push(`振直+${eng.rerollGain}`)
  if (eng.goldGain) parts.push(`+${eng.goldGain}G`)
  return parts.slice(0, 3)
}

const playClickSfx = () => playSound('dice_place')
const playDiceRollSfx = () => playSound('dice_roll')
const playManaShiftSfx = () => playSound('magic_burst')
const playShieldGainSfx = () => playSound('guard_shield')
const playSlashHitSfx = (hits = 1) => playSound('attack_slash', hits)
const playHeavyImpactSfx = () => playSound('magic_burst', 2)
const playComboFanfareSfx = (mult = 1) =>
  playSound('combo_step', Math.round((mult - 1) * 4))
const playForgeHammerSfx = () => playSound('forge_hammer')
const playVictorySfx = () => playSound('victory')
const playDamageSfx = () => playSound('attack_slash')
const playGameOverSfx = () => playSound('attack_slash')

export default function DiceForgeDungeonGame() {
  const [savedRun, setSavedRun] = useState<GameState | null>(() =>
    loadActiveRun()
  )
  const [metaStats, setMetaStats] = useState(() => loadMetaProfile())
  const [screenMode, setScreenMode] = useState<'title' | 'class_select'>('title')
  const [selectedClass, setSelectedClass] = useState<StarterClassId>('mage')
  const [gameState, setGameState] = useState<GameState | null>(null)

  // Battle interaction states
  const [selectedDieId, setSelectedDieId] = useState<number | null>(0)
  const [rollingAnim, setRollingAnim] = useState(false)
  const [executingEnemyTurn, setExecutingEnemyTurn] = useState(false)
  const [showDiceNetModal, setShowDiceNetModal] = useState(false)
  const [activePopupText, setActivePopupText] = useState<string | null>(null)

  // Reward selection states
  const [selectedRewardEngraving, setSelectedRewardEngraving] =
    useState<EngravingId | null>(null)
  const [selectedRewardRelic, setSelectedRewardRelic] =
    useState<RelicId | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const floaterIdRef = useRef(1)
  const executingTurnRef = useRef(false)
  const enemyTurnTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (enemyTurnTimerRef.current !== null) {
        window.clearTimeout(enemyTurnTimerRef.current)
      }
    }
  }, [])

  const animRef = useRef<ArenaAnimState>({
    time: 0,
    hitstopTimer: 0,
    screenShake: 0,
    redFlashAlpha: 0,
    goldFlashAlpha: 0,
    heroOffsetX: 0,
    heroOffsetY: 0,
    heroPose: 'idle',
    heroPoseTimer: 0,
    enemyOffsetX: 0,
    enemyOffsetY: 0,
    enemyFlashWhite: 0,
    enemyScale: 1,
    enemyPose: 'idle',
    enemyPoseTimer: 0,
    displayedHeroHp: 60,
    displayedHeroShield: 0,
    displayedEnemyHp: 38,
    displayedEnemyShield: 0,
    slashes: [],
    particles: [],
    floaters: [],
    comboBanner: null,
  })

  // Auto-save active run
  useEffect(() => {
    if (!gameState) return
    if (gameState.phase === 'victory' || gameState.phase === 'gameover') {
      clearActiveRun()
      setSavedRun(null)
    } else {
      saveActiveRun(gameState)
      setSavedRun(gameState)
    }
  }, [gameState])

  // Default reward selections when entering reward phase
  useEffect(() => {
    if (gameState?.phase === 'reward' && gameState.rewardOffer) {
      setSelectedRewardEngraving(gameState.rewardOffer.engravings[0] ?? null)
      setSelectedRewardRelic(gameState.rewardOffer.relics[0] ?? null)
    }
  }, [gameState?.phase, gameState?.floor, gameState?.rewardOffer])

  // Keep an unassigned die selected during battle
  useEffect(() => {
    if (!gameState || gameState.phase !== 'battle') return
    const currentSelected = gameState.dice.find((d) => d.id === selectedDieId)
    if (!currentSelected || currentSelected.assignedSlot !== null) {
      const nextUnassigned = gameState.dice.find((d) => d.assignedSlot === null)
      setSelectedDieId(nextUnassigned ? nextUnassigned.id : null)
    }
  }, [gameState, selectedDieId])

  const turnPreview = useMemo(() => {
    if (!gameState || gameState.phase !== 'battle') return null
    return calculateTurnPreview(gameState)
  }, [gameState])

  const activeDie = useMemo(() => {
    if (!gameState || gameState.phase !== 'battle') return null
    return (
      gameState.dice.find(
        (d) => d.id === selectedDieId && d.assignedSlot === null
      ) ??
      gameState.dice.find((d) => d.assignedSlot === null) ??
      null
    )
  }, [gameState, selectedDieId])

  const commandActionPreviews = useMemo(() => {
    const out: Partial<Record<SlotId, SingleDieActionPreview>> = {}
    if (!gameState || gameState.phase !== 'battle' || !activeDie) return out
    for (const card of COMMAND_CARDS) {
      out[card.id] = calculateSingleDieAction(gameState, activeDie, card.id)
    }
    return out
  }, [gameState, activeDie])

  const spawnImpactVisuals = useCallback(
    (opts: {
      target: 'enemy' | 'hero'
      text: string
      subtext?: string
      color: string
      slashType?: ArenaAnimState['slashes'][number]['type']
      shake?: number
      hitstop?: number
      redFlash?: number
      goldFlash?: number
    }) => {
      const a = animRef.current
      const cvsW = canvasRef.current?.clientWidth || 360
      const cvsH = canvasRef.current?.clientHeight || 300
      const isEnemy = opts.target === 'enemy'
      const cx = Math.round(isEnemy ? cvsW * 0.72 : cvsW * 0.28)
      const cy = Math.round(cvsH * 0.54)
      // Position floating damage/shield popups toward arena center-mid so they never collide with Lv/ATK head badges
      const fx = Math.round(isEnemy ? cvsW * 0.56 : cvsW * 0.42)
      const fy = Math.round(cvsH * 0.56)

      if (opts.hitstop) a.hitstopTimer = Math.max(a.hitstopTimer, opts.hitstop)
      if (opts.shake) a.screenShake = Math.max(a.screenShake, opts.shake)
      if (opts.redFlash) a.redFlashAlpha = Math.max(a.redFlashAlpha, opts.redFlash)
      if (opts.goldFlash) a.goldFlashAlpha = Math.max(a.goldFlashAlpha, opts.goldFlash)

      if (isEnemy) {
        a.heroOffsetX = 48
        a.heroPose = opts.slashType === 'arcana' ? 'cast' : 'slash'
        a.heroPoseTimer = 0.28
        a.enemyOffsetX = 16
        a.enemyFlashWhite = 0.16
        a.enemyScale = 1.16
        a.enemyPose = 'hit'
        a.enemyPoseTimer = 0.25
      } else if (opts.slashType === 'shield') {
        a.heroPose = 'guard'
        a.heroPoseTimer = 0.25
      } else {
        a.enemyOffsetX = -52
        a.heroOffsetX = -14
        a.heroPose = 'hit'
        a.heroPoseTimer = 0.28
      }

      if (opts.slashType) {
        a.slashes.push({
          x: cx,
          y: cy,
          color: opts.color,
          secondaryColor: '#ffffff',
          progress: 0,
          type: opts.slashType,
        })
      }

      a.particles.push({
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        size: 10,
        color: opts.color,
        alpha: 0.95,
        decay: 2.6,
        shape: 'ring',
      })

      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.35
        const speed = 65 + Math.random() * 130
        a.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 25,
          size: 2.5 + Math.random() * 3.5,
          color: i % 3 === 0 ? '#ffffff' : opts.color,
          alpha: 1,
          decay: 1.8 + Math.random() * 0.9,
          shape: i % 2 === 0 ? 'shard' : 'spark',
          angle: Math.random() * Math.PI,
        })
      }

      for (const f of a.floaters) {
        if (Math.abs(f.x - fx) < 60) {
          f.y -= 24
          f.subtext = undefined
        }
      }

      floaterIdRef.current += 1
      a.floaters.push({
        id: floaterIdRef.current,
        x: fx + (Math.random() - 0.5) * 8,
        y: fy,
        vy: -18,
        text: opts.text,
        subtext: opts.subtext,
        color: opts.color,
        scale: 1.25,
        alpha: 1,
        life: 0,
        maxLife: 0.78,
      })

      setActivePopupText(opts.text)
    },
    []
  )

  // Unified 60fps Canvas Loop (Title / Class Select / Battle / Reward / Result)
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let last = performance.now()

    const renderLoop = (now: number) => {
      const rawDt = Math.min(0.05, (now - last) / 1000)
      last = now
      const a = animRef.current
      const cw = cvs.clientWidth || 360
      const ch = cvs.clientHeight || 300
      if (cvs.width !== cw || cvs.height !== ch) {
        cvs.width = cw
        cvs.height = ch
      }

      const previewCls = STARTER_CLASSES[selectedClass]
      const targetHeroHp = gameState ? gameState.hp : previewCls.maxHp
      const targetHeroMaxHp = gameState ? gameState.maxHp : previewCls.maxHp
      const targetHeroShield = gameState
        ? gameState.shield
        : selectedClass === 'blacksmith'
          ? 8
          : 0
      const targetEnemyHp = gameState ? gameState.enemy.hp : 38
      const targetEnemyMaxHp = gameState ? gameState.enemy.maxHp : 38
      const targetEnemyShield = gameState ? gameState.enemy.shield : 0

      if (a.hitstopTimer > 0) {
        a.hitstopTimer = Math.max(0, a.hitstopTimer - rawDt)
      } else {
        const dt = rawDt
        a.time += dt
        a.screenShake = Math.max(0, a.screenShake - dt * 28)
        a.redFlashAlpha = Math.max(0, a.redFlashAlpha - dt * 2.2)
        a.goldFlashAlpha = Math.max(0, a.goldFlashAlpha - dt * 2.2)
        a.enemyFlashWhite = Math.max(0, a.enemyFlashWhite - dt)

        a.heroOffsetX += (0 - a.heroOffsetX) * Math.min(1, dt * 14)
        a.heroOffsetY += (0 - a.heroOffsetY) * Math.min(1, dt * 14)
        a.enemyOffsetX += (0 - a.enemyOffsetX) * Math.min(1, dt * 14)
        a.enemyOffsetY += (0 - a.enemyOffsetY) * Math.min(1, dt * 14)
        a.enemyScale += (1 - a.enemyScale) * Math.min(1, dt * 12)

        if (a.heroPoseTimer > 0) {
          a.heroPoseTimer -= dt
          if (a.heroPoseTimer <= 0) a.heroPose = 'idle'
        }
        if (a.enemyPoseTimer > 0) {
          a.enemyPoseTimer -= dt
          if (a.enemyPoseTimer <= 0) a.enemyPose = 'idle'
        }

        a.displayedHeroHp +=
          (targetHeroHp - a.displayedHeroHp) * Math.min(1, dt * 14)
        a.displayedHeroShield +=
          (targetHeroShield - a.displayedHeroShield) * Math.min(1, dt * 14)
        a.displayedEnemyHp +=
          (targetEnemyHp - a.displayedEnemyHp) * Math.min(1, dt * 14)
        a.displayedEnemyShield +=
          (targetEnemyShield - a.displayedEnemyShield) * Math.min(1, dt * 14)

        for (let i = a.slashes.length - 1; i >= 0; i--) {
          a.slashes[i].progress += dt * 4.2
          if (a.slashes[i].progress >= 1) a.slashes.splice(i, 1)
        }

        for (let i = a.particles.length - 1; i >= 0; i--) {
          const p = a.particles[i]
          if (p.shape === 'ring') {
            p.size += dt * 155
            p.alpha -= dt * p.decay
          } else {
            p.x += p.vx * dt
            p.y += p.vy * dt
            p.vy += 210 * dt
            p.alpha -= dt * p.decay
          }
          if (p.alpha <= 0) a.particles.splice(i, 1)
        }

        for (let i = a.floaters.length - 1; i >= 0; i--) {
          const f = a.floaters[i]
          f.life += dt
          f.y += f.vy * dt
          f.vy *= 0.92
          f.scale += (1.0 - f.scale) * Math.min(1, dt * 12)
          if (f.life > f.maxLife * 0.6) {
            f.alpha = Math.max(
              0,
              1 - (f.life - f.maxLife * 0.6) / (f.maxLife * 0.4)
            )
          }
          if (f.life >= f.maxLife) a.floaters.splice(i, 1)
        }

        if (a.comboBanner) {
          a.comboBanner.scale +=
            (1 - a.comboBanner.scale) * Math.min(1, dt * 14)
          a.comboBanner.alpha = Math.max(0, a.comboBanner.alpha - dt * 0.9)
          if (a.comboBanner.alpha <= 0.01) a.comboBanner = null
        }
      }

      const arenaMode = !gameState
        ? screenMode
        : gameState.phase === 'reward'
          ? 'reward'
          : gameState.phase === 'victory'
            ? 'victory'
            : gameState.phase === 'gameover'
              ? 'gameover'
              : 'battle'

      renderDungeonArena(ctx, cvs.width, cvs.height, a, {
        mode: arenaMode,
        classId: gameState ? gameState.starterClass : selectedClass,
        floor: gameState ? gameState.floor : 1,
        area: gameState ? gameState.area : 1,
        heroHp: targetHeroHp,
        heroMaxHp: targetHeroMaxHp,
        heroShield: targetHeroShield,
        heroMana: gameState ? gameState.mana : previewCls.startingMana,
        enemyIcon: gameState ? gameState.enemy.icon : 'GOBLIN',
        enemyName: gameState ? gameState.enemy.name : 'GOBLIN',
        enemyHp: targetEnemyHp,
        enemyMaxHp: targetEnemyMaxHp,
        enemyShield: targetEnemyShield,
        enemyPoison: gameState ? gameState.enemy.poison : 0,
        enemyThorns: gameState ? gameState.enemy.thorns : 0,
        enemyIntentDamage: gameState
          ? gameState.enemy.currentIntent.damage + gameState.enemy.strength
          : 10,
        enemyIntentHits: gameState
          ? gameState.enemy.currentIntent.hits || 1
          : 1,
        enemyIntentShield: gameState
          ? gameState.enemy.currentIntent.shieldGain
          : 0,
        isBoss: gameState ? gameState.enemy.isBoss : false,
        isElite: gameState ? gameState.enemy.isElite : false,
      })

      rafId = requestAnimationFrame(renderLoop)
    }

    rafId = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(rafId)
  }, [gameState, selectedClass, screenMode])

  const finalizeRunIfEnded = useCallback((next: GameState) => {
    if (next.phase === 'victory' || next.phase === 'gameover') {
      const finalScore =
        next.stats.totalDamageDealt * 10 +
        next.floor * 500 +
        (next.phase === 'victory' ? 5000 : 0)
      const updatedMeta = recordRunCompletion(next, finalScore)
      setMetaStats(updatedMeta)
    }
  }, [])

  // Start new run
  const handleStartNewRun = (classId: StarterClassId = selectedClass) => {
    if (enemyTurnTimerRef.current !== null) {
      window.clearTimeout(enemyTurnTimerRef.current)
      enemyTurnTimerRef.current = null
    }
    executingTurnRef.current = false
    setExecutingEnemyTurn(false)
    playClickSfx()
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    const next = initGameState(seed, classId, 0)
    animRef.current.displayedHeroHp = next.hp
    animRef.current.displayedHeroShield = next.shield
    animRef.current.displayedEnemyHp = next.enemy.hp
    animRef.current.displayedEnemyShield = next.enemy.shield
    setActivePopupText(null)
    setGameState(next)
    setSelectedDieId(0)
  }

  // Resume saved run
  const handleResumeRun = () => {
    if (!savedRun) return
    if (enemyTurnTimerRef.current !== null) {
      window.clearTimeout(enemyTurnTimerRef.current)
      enemyTurnTimerRef.current = null
    }
    executingTurnRef.current = false
    setExecutingEnemyTurn(false)
    playClickSfx()
    animRef.current.displayedHeroHp = savedRun.hp
    animRef.current.displayedHeroShield = savedRun.shield
    animRef.current.displayedEnemyHp = savedRun.enemy.hp
    animRef.current.displayedEnemyShield = savedRun.enemy.shield
    setActivePopupText(null)
    setGameState(savedRun)
    setSelectedDieId(0)
  }

  // Reroll unlocked & unused dice
  const handleReroll = () => {
    if (
      !gameState ||
      gameState.rerollsLeft <= 0 ||
      executingTurnRef.current
    ) {
      return
    }
    playDiceRollSfx()
    setRollingAnim(true)
    setTimeout(() => setRollingAnim(false), 240)
    const lockIds = gameState.dice.filter((d) => d.locked).map((d) => d.id)
    setGameState(step(gameState, { type: 'REROLL_DICE', lockDieIds: lockIds }))
  }

  // Toggle lock on an unused die
  const handleToggleLock = (dieId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!gameState || executingTurnRef.current) return
    playClickSfx()
    const clone = structuredClone(gameState)
    const die = clone.dice.find((d) => d.id === dieId)
    if (die && die.assignedSlot === null) {
      die.locked = !die.locked
      setGameState(clone)
    }
  }

  // Mana manipulation (+1)
  const handleManipulateDie = (
    mode: 'plus1' | 'minus1' | 'flip' = 'plus1'
  ) => {
    if (!gameState || gameState.mana < 1 || executingTurnRef.current) return
    const targetId =
      activeDie?.id ?? gameState.dice.find((d) => d.assignedSlot === null)?.id
    if (targetId === undefined) return
    playManaShiftSfx()
    const next = step(gameState, {
      type: 'MANIPULATE_DIE',
      dieId: targetId,
      mode,
    })
    setGameState(next)
    spawnImpactVisuals({
      target: 'hero',
      text: mode === 'plus1' ? '+1' : mode === 'minus1' ? '-1' : 'FLIP',
      color: '#c084fc',
      slashType: 'arcana',
    })
    if (next.phase === 'reward' || next.phase === 'victory') {
      playVictorySfx()
      animRef.current.floaters = []
      animRef.current.slashes = []
      setActivePopupText(null)
      finalizeRunIfEnded(next)
    }
  }

  // Execute enemy counter-turn automatically after all 4 dice are spent
  const triggerEnemyTurn = useCallback(
    (stateAfter4thDie: GameState) => {
      if (stateAfter4thDie.phase !== 'battle' || executingTurnRef.current) return
      executingTurnRef.current = true
      setExecutingEnemyTurn(true)

      enemyTurnTimerRef.current = window.setTimeout(() => {
        const incoming =
          (stateAfter4thDie.enemy.currentIntent.damage +
            stateAfter4thDie.enemy.strength) *
          (stateAfter4thDie.enemy.currentIntent.hits || 1)
        const expectedUnblocked = Math.max(
          0,
          incoming - stateAfter4thDie.shield
        )

        const next = step(stateAfter4thDie, { type: 'EXECUTE_TURN' })

        if (next.phase === 'reward' || next.phase === 'victory') {
          playVictorySfx()
          animRef.current.floaters = []
          animRef.current.slashes = []
          setActivePopupText(null)
          finalizeRunIfEnded(next)
        } else if (next.phase === 'gameover') {
          playGameOverSfx()
          spawnImpactVisuals({
            target: 'hero',
            text: `-${expectedUnblocked}`,
            color: '#f43f5e',
            slashType: 'enemy_claw',
            shake: 10,
            hitstop: 0.08,
            redFlash: 0.45,
          })
          finalizeRunIfEnded(next)
        } else if (expectedUnblocked > 0) {
          playDamageSfx()
          spawnImpactVisuals({
            target: 'hero',
            text: `-${expectedUnblocked}`,
            color: '#f43f5e',
            slashType: 'enemy_claw',
            shake: 9,
            hitstop: 0.07,
            redFlash: 0.36,
          })
        } else if (incoming > 0) {
          playShieldGainSfx()
          spawnImpactVisuals({
            target: 'hero',
            text: 'GUARD!',
            color: '#38bdf8',
            slashType: 'shield',
            shake: 3,
          })
        }

        setGameState(next)
        executingTurnRef.current = false
        setExecutingEnemyTurn(false)
      }, 360)
    },
    [finalizeRunIfEnded, spawnImpactVisuals]
  )

  // Direct 1-Die = 1-Instant-Action Command Tap
  const handleCommandTap = (slotId: SlotId) => {
    if (
      !gameState ||
      gameState.phase !== 'battle' ||
      executingTurnRef.current ||
      !activeDie
    ) {
      return
    }

    const actionPreview = calculateSingleDieAction(gameState, activeDie, slotId)
    const nextState = step(gameState, {
      type: 'ASSIGN_DIE',
      dieId: activeDie.id,
      slotId,
    })
    setGameState(nextState)

    // Trigger Immediate Tactile Combat Visuals & SFX
    if (slotId === 'guard_1') {
      playShieldGainSfx()
      spawnImpactVisuals({
        target: 'hero',
        text: `盾+${actionPreview.shieldGain}`,
        subtext:
          actionPreview.damage > 0 ? `追撃 ${actionPreview.damage}` : undefined,
        color: '#38bdf8',
        slashType: 'shield',
        shake: 3,
      })
      if (actionPreview.damage > 0) {
        spawnImpactVisuals({
          target: 'enemy',
          text: `-${actionPreview.damage}!`,
          color: '#60a5fa',
          slashType: 'sword',
          shake: 4,
          hitstop: 0.05,
        })
      }
    } else if (slotId === 'strike_2') {
      playSlashHitSfx(actionPreview.hits)
      spawnImpactVisuals({
        target: 'enemy',
        text: `-${actionPreview.damage}!`,
        subtext:
          actionPreview.poisonApplied > 0
            ? `+${actionPreview.poisonApplied}毒`
            : `${actionPreview.hits}HIT`,
        color: '#34d399',
        slashType: 'dagger',
        shake: actionPreview.bonusTriggered ? 6 : 4,
        hitstop: 0.06,
      })
    } else if (slotId === 'arcana_1') {
      if (actionPreview.isOverchargeBlast) {
        playHeavyImpactSfx()
      } else {
        playSlashHitSfx(1)
      }
      spawnImpactVisuals({
        target: 'enemy',
        text: `-${actionPreview.damage}!`,
        subtext: actionPreview.isOverchargeBlast
          ? 'MP必殺砲'
          : `+${actionPreview.manaGain}MP`,
        color: '#c084fc',
        slashType: 'arcana',
        shake: actionPreview.isOverchargeBlast ? 9 : 4,
        hitstop: actionPreview.isOverchargeBlast ? 0.08 : 0.05,
        goldFlash: actionPreview.isOverchargeBlast ? 0.2 : 0,
      })
    } else {
      const isHeavy = actionPreview.bonusTriggered || actionPreview.damage >= 16
      if (isHeavy) {
        playHeavyImpactSfx()
      } else {
        playSlashHitSfx(1)
      }
      spawnImpactVisuals({
        target: 'enemy',
        text: `-${actionPreview.damage}!`,
        subtext: actionPreview.bonusTriggered ? actionPreview.bonusTag : undefined,
        color: isHeavy ? '#fbbf24' : '#fb7185',
        slashType: 'sword',
        shake: isHeavy ? 8 : 5,
        hitstop: isHeavy ? 0.08 : 0.05,
        goldFlash: isHeavy ? 0.16 : 0,
      })
    }

    if (turnPreview && turnPreview.formation.id !== 'none' && actionPreview.bonusTriggered) {
      playComboFanfareSfx(turnPreview.finalMult)
    }

    // Immediate victory/reward check if enemy died from this strike
    if (nextState.phase === 'reward' || nextState.phase === 'victory') {
      playVictorySfx()
      animRef.current.floaters = []
      animRef.current.slashes = []
      setActivePopupText(null)
      finalizeRunIfEnded(nextState)
      return
    }
    if (nextState.phase === 'gameover') {
      playGameOverSfx()
      finalizeRunIfEnded(nextState)
      return
    }

    // Check if all 4 dice are now used -> trigger enemy turn after short beat
    const remainingDice = nextState.dice.filter((d) => d.assignedSlot === null)
    if (remainingDice.length === 0) {
      triggerEnemyTurn(nextState)
    }
  }

  // Confirm Stage Clear Level Up Reward
  const handleConfirmReward = (
    nextNode: 'normal' | 'elite' | 'altar' | 'shop' | 'boss'
  ) => {
    if (!gameState || gameState.phase !== 'reward') return
    playForgeHammerSfx()
    const next = step(gameState, {
      type: 'CHOOSE_REWARD',
      engravingId: selectedRewardEngraving ?? undefined,
      relicId: selectedRewardRelic ?? undefined,
      replaceRelicIndex: 0,
      nextNodeType: nextNode,
    })
    animRef.current.displayedHeroHp = next.hp
    animRef.current.displayedHeroShield = next.shield
    animRef.current.displayedEnemyHp = next.enemy.hp
    animRef.current.displayedEnemyShield = next.enemy.shield
    setActivePopupText(null)
    setGameState(next)
  }

  // Derived data for always-visible Top Bar (Zone A)
  const activeClassDef = STARTER_CLASSES[gameState ? gameState.starterClass : selectedClass]
  const forgedFacesCount = gameState
    ? gameState.dice.reduce(
        (acc, die) =>
          acc +
          die.faces.filter((f) => !f.engravingId.startsWith('base_')).length,
        0
      )
    : 0
  const unusedCount = gameState
    ? gameState.dice.filter((d) => d.assignedSlot === null).length
    : 0

  return (
    <div
      data-testid={!gameState ? 'dice-forge-title-screen' : 'dice-forge-canvas'}
      className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-slate-950 p-2 text-slate-100 select-none"
    >
      {/* ==================================================================== */}
      {/* ZONE A: FIXED HEIGHT TOP STATUS & ALWAYS-VISIBLE ABILITIES (92px)    */}
      {/* ==================================================================== */}
      <div
        data-testid="layout-zone-top"
        className="flex h-[92px] shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-slate-800 bg-slate-900/95 px-2.5 py-1.5"
      >
        {!gameState ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Dices className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-black tracking-wide text-amber-300">
                  DICE FORGE DUNGEON
                </span>
              </div>
              <div className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-slate-950 px-2.5 py-0.5 text-xs font-extrabold text-amber-300">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span>HI {metaStats.highScore}</span>
              </div>
            </div>
            <div
              data-testid="always-visible-abilities"
              className="flex flex-wrap items-center justify-between gap-1 text-xs font-bold text-slate-300"
            >
              {screenMode === 'title' ? (
                <span>全12ステージの塔をダイスと戦略で踏破</span>
              ) : (
                <span>
                  [{CLASS_SHORT_NAMES[selectedClass]}] HP{activeClassDef.maxHp}{' '}
                  攻{activeClassDef.baseAttack} 防{activeClassDef.baseDefense}{' '}
                  MP{activeClassDef.startingMana} | {activeClassDef.passiveLabel}
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Row 1: Stage / Level / HP / ATK / DEF / MP */}
            <div className="flex items-center justify-between gap-1 text-xs font-black">
              <div className="flex items-center gap-1">
                <span className="rounded-md border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
                  STAGE {gameState.floor}/12
                </span>
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">
                  Lv.{gameState.floor}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-300">
                  HP{gameState.hp}/{gameState.maxHp}
                </span>
                <span className="text-rose-300">攻{gameState.baseAttack}</span>
                <span className="text-sky-300">防{gameState.baseDefense}</span>
                <span className="text-violet-300">
                  MP{gameState.mana}/{gameState.maxMana}
                </span>
              </div>
            </div>

            {/* Row 2: Always-Visible Class Trait + Relics (Flex-wrap, Supports up to 5 Relics cleanly) + Inspect Button */}
            <div
              data-testid="always-visible-abilities"
              className="flex items-center justify-between gap-1"
            >
              <div className="flex max-h-[54px] flex-1 flex-wrap items-center gap-1 overflow-y-auto no-scrollbar">
                <span className="rounded-md border border-sky-500/40 bg-sky-950/80 px-1.5 py-0.5 text-xs font-extrabold whitespace-nowrap text-sky-200">
                  {activeClassDef.passiveLabel}
                </span>
                {gameState.relics.map((rId) => (
                  <span
                    key={rId}
                    title={RELICS[rId].shortEffect}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-slate-950 px-1.5 py-0.5 text-xs font-extrabold whitespace-nowrap text-amber-200"
                  >
                    <Gem className="h-3 w-3 shrink-0 text-amber-400" />
                    <span>{RELICS[rId].name}</span>
                  </span>
                ))}
              </div>
              <button
                type="button"
                data-testid="dice-forge-inspect-btn"
                onClick={() => {
                  playClickSfx()
                  setShowDiceNetModal(true)
                }}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-extrabold text-slate-200 hover:bg-slate-700"
              >
                <TrendingUp className="h-3 w-3 text-sky-400" />
                <span>能力({forgedFacesCount}面)</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ==================================================================== */}
      {/* ZONE B: FLEX-1 DUNGEON BATTLEFIELD CANVAS (FIXED VERTICAL BOUNDS)    */}
      {/* ==================================================================== */}
      <div
        data-testid="layout-zone-stage"
        className="relative my-1.5 flex-1 min-h-[168px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-inner"
      >
        <div
          data-testid="battle-duel-stage"
          className="relative h-full w-full"
        >
          <canvas
            ref={canvasRef}
            width={360}
            height={300}
            className="block h-full w-full"
          />

          <div
            data-testid="player-avatar-actor"
            className="pointer-events-none absolute bottom-3 left-6 h-24 w-20"
          />
          <div
            data-testid="enemy-avatar-actor"
            className="pointer-events-none absolute right-6 bottom-3 h-24 w-24"
          />

          {activePopupText && gameState?.phase === 'battle' && (
            <div
              data-testid="battle-floating-popup"
              className="pointer-events-none absolute top-3 left-3 rounded-full border border-amber-400/80 bg-slate-950/90 px-3 py-0.5 text-xs font-black text-amber-300 shadow-lg"
            >
              {activePopupText}
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* ZONE C: FIXED HEIGHT BOTTOM CONTROL DECK (324px — ZERO JITTER)       */}
      {/* ==================================================================== */}
      <div
        data-testid="layout-zone-bottom"
        className="flex h-[324px] shrink-0 flex-col justify-between overflow-hidden"
      >
        {/* C-1: DEDICATED TITLE SCREEN */}
        {!gameState && screenMode === 'title' && (
          <div
            data-testid="title-hero-panel"
            className="flex h-full flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-amber-300">
                3ステップ攻略ガイド
              </span>
              <span className="text-xs font-extrabold text-slate-400">
                クリア {metaStats.totalClears}回 / 挑戦 {metaStats.totalRuns}回
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950/90 p-2.5 text-center">
                <Dices className="h-6 w-6 text-amber-400" />
                <span className="mt-1.5 text-xs font-black text-white">
                  1. 出目を振る
                </span>
                <span className="mt-1 text-xs font-bold leading-tight text-slate-300">
                  4個の出目で役倍率を上げる
                </span>
              </div>
              <div className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950/90 p-2.5 text-center">
                <Swords className="h-6 w-6 text-rose-400" />
                <span className="mt-1.5 text-xs font-black text-white">
                  2. 技で即発動
                </span>
                <span className="mt-1 text-xs font-bold leading-tight text-slate-300">
                  技を押した瞬間に攻撃や盾発動
                </span>
              </div>
              <div className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950/90 p-2.5 text-center">
                <TrendingUp className="h-6 w-6 text-emerald-400" />
                <span className="mt-1.5 text-xs font-black text-white">
                  3. 成長し制覇
                </span>
                <span className="mt-1 text-xs font-bold leading-tight text-slate-300">
                  レベルアップで全12階を踏破
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {savedRun && (
                <button
                  type="button"
                  data-testid="dice-forge-continue-btn"
                  onClick={handleResumeRun}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-600 py-2.5 text-sm font-black text-white shadow-md transition hover:bg-emerald-500"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>つづきから再開 (STAGE {savedRun.floor}/12)</span>
                </button>
              )}
              <button
                type="button"
                data-testid="title-start-btn"
                onClick={() => {
                  playClickSfx()
                  setScreenMode('class_select')
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-base font-black text-slate-950 shadow-lg shadow-amber-500/25 transition hover:from-amber-400 hover:to-orange-400"
              >
                <Play className="h-5 w-5 fill-current" />
                <span>ゲームスタート</span>
              </button>
            </div>
          </div>
        )}

        {/* C-2: CHARACTER SELECT SCREEN (CLEAR STAT & PASSIVE DIFFS) */}
        {!gameState && screenMode === 'class_select' && (
          <div
            data-testid="class-select-panel"
            className="flex h-full flex-col justify-between gap-2"
          >
            <div className="grid flex-1 grid-cols-3 gap-2">
              {(Object.keys(STARTER_CLASSES) as StarterClassId[]).map((cid) => {
                const cls = STARTER_CLASSES[cid]
                const isSelected = selectedClass === cid
                return (
                  <button
                    key={cid}
                    type="button"
                    data-testid={`class-select-${cid}`}
                    onClick={() => {
                      playClickSfx()
                      setSelectedClass(cid)
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-between rounded-2xl border-2 p-2 text-center transition-all ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/10'
                        : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <ClassCrestSvg classId={cid} className="h-10 w-10" />
                      <span className="mt-1 text-sm font-black text-white">
                        {CLASS_SHORT_NAMES[cid]}
                      </span>
                    </div>

                    <div className="grid w-full grid-cols-2 gap-x-1 gap-y-0.5 rounded-lg bg-slate-950/80 px-1.5 py-1 text-xs font-extrabold">
                      <span className="text-emerald-300">HP{cls.maxHp}</span>
                      <span className="text-rose-300">攻{cls.baseAttack}</span>
                      <span className="text-sky-300">防{cls.baseDefense}</span>
                      <span className="text-violet-300">
                        MP{cls.startingMana}
                      </span>
                    </div>

                    <span className="w-full rounded-md bg-slate-800 px-1 py-0.5 text-xs font-black text-amber-300">
                      {cls.specialtyLabel}
                    </span>

                    <span className="text-xs font-bold leading-tight text-slate-200">
                      {cls.passiveLabel}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  playClickSfx()
                  setScreenMode('title')
                }}
                className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-black text-slate-300 hover:bg-slate-800"
              >
                戻る
              </button>
              <button
                type="button"
                data-testid="dice-forge-start-btn"
                onClick={() => handleStartNewRun(selectedClass)}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-base font-black text-slate-950 shadow-lg shadow-amber-500/25 transition hover:from-amber-400 hover:to-orange-400"
              >
                <Play className="h-5 w-5 fill-current" />
                <span>冒険スタート</span>
              </button>
            </div>
          </div>
        )}

        {/* C-3: BATTLE CONTROLS (1 DIE = 1 INSTANT ACTION, NO AUTO/ALL-IN BUTTONS) */}
        {gameState && gameState.phase === 'battle' && turnPreview && (
          <div className="flex h-full flex-col justify-between gap-1">
            {/* Guide, Selected Die Effect & Combo Strip */}
            <div className="flex flex-col gap-0.5 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-xs font-black">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-300">
                  <span>
                    {executingEnemyTurn
                      ? '敵の反撃ターン'
                      : activeDie
                        ? `出目[${activeDie.currentPip}] ${ENGRAVINGS[activeDie.currentEngravingId].name}`
                        : 'ターン終了'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-300">残{unusedCount}/4</span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-xs font-black ${
                      turnPreview.formation.id !== 'none'
                        ? 'border-amber-400/60 bg-amber-500/25 text-amber-200'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                    }`}
                  >
                    {FORMATION_SHORT_LABELS[turnPreview.formation.id] ?? '倍率'} x
                    {turnPreview.finalMult.toFixed(2)}
                  </span>
                </div>
              </div>
              {activeDie && !executingEnemyTurn && (
                <div className="flex flex-wrap items-center gap-x-1.5 text-xs font-bold text-sky-200">
                  {activeDie.currentEngravingId.startsWith('base_') ? (
                    <span className="text-slate-400">
                      下の技をタップすると即座に発動
                    </span>
                  ) : (
                    <>
                      <span className="text-amber-300">発動効果:</span>
                      {formatEngravingEffectParts(
                        ENGRAVINGS[activeDie.currentEngravingId]
                      ).map((part, pIdx) => (
                        <span key={pIdx} className="whitespace-nowrap">
                          {part}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 4 Direct Instant Action Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              {COMMAND_CARDS.map((card) => {
                const preview = commandActionPreviews[card.id]
                const isBonus = preview?.bonusTriggered ?? false
                const isDisabled = executingEnemyTurn || !activeDie

                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={isDisabled}
                    data-testid={`slot-${card.id}`}
                    onClick={() => handleCommandTap(card.id)}
                    className={`flex h-[98px] cursor-pointer flex-col items-center justify-between rounded-xl border-2 bg-slate-900/95 p-1.5 transition-all active:scale-95 disabled:opacity-50 ${
                      isBonus
                        ? `${card.borderClass} ${card.activeRingClass}`
                        : card.borderClass
                    }`}
                  >
                    <span className="text-xs font-black text-white">
                      {card.title}
                    </span>

                    <WeaponIconSvg slotId={card.id} className="h-6 w-6" />

                    <span
                      className={`w-full rounded-md px-1 py-0.5 text-center text-xs font-black leading-tight whitespace-nowrap ${card.badgeClass}`}
                    >
                      {preview ? preview.summaryLabel : card.conditionLabel}
                    </span>

                    <span
                      className={`text-xs font-extrabold leading-tight whitespace-nowrap ${
                        isBonus ? 'text-amber-300' : 'text-slate-400'
                      }`}
                    >
                      {preview ? preview.bonusTag : card.conditionLabel}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 4 Physical 3D Pip Dice (Lock Toggle Placed at Bottom Row — Zero Overlap with Die Icons) */}
            <div className="grid grid-cols-4 gap-1.5">
              {gameState.dice.map((die) => {
                const eng = ENGRAVINGS[die.currentEngravingId]
                const isSelected = activeDie?.id === die.id
                const isUsed = die.assignedSlot !== null

                return (
                  <div
                    key={die.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`die-card-${die.id}`}
                    onClick={() => {
                      if (isUsed || executingEnemyTurn) return
                      playClickSfx()
                      setSelectedDieId(die.id)
                    }}
                    onKeyDown={(e) => {
                      if (
                        (e.key === 'Enter' || e.key === ' ') &&
                        !isUsed &&
                        !executingEnemyTurn
                      ) {
                        setSelectedDieId(die.id)
                      }
                    }}
                    className={`relative flex h-[96px] cursor-pointer flex-col items-center justify-between rounded-2xl border-2 px-1 py-1.5 transition-all ${
                      isUsed
                        ? 'cursor-default border-slate-800 bg-slate-900/30 opacity-40'
                        : die.locked
                          ? 'border-sky-400 bg-sky-500/10 shadow-md shadow-sky-500/15'
                          : isSelected
                            ? 'border-amber-400 bg-amber-500/15 -translate-y-0.5 shadow-lg shadow-amber-500/20'
                            : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                    } ${rollingAnim && !die.locked && !isUsed ? 'animate-bounce' : ''}`}
                  >
                    {isUsed && (
                      <span className="absolute top-1 right-1.5 rounded bg-slate-800 px-1 text-xs font-black text-slate-300">
                        済
                      </span>
                    )}

                    <div className="flex flex-1 items-center justify-center">
                      <PipDieSvg
                        pip={die.currentPip}
                        archetype={eng.archetype}
                        isSpecial={!die.currentEngravingId.startsWith('base_')}
                        hasAttack={Boolean(eng.bonusAttack)}
                        hasShield={Boolean(eng.bonusShield)}
                        hasPoison={Boolean(eng.applyPoison)}
                        hasMana={Boolean(eng.bonusMana)}
                        multiHit={eng.multiHit}
                        size={46}
                      />
                    </div>

                    <div className="flex w-full items-center justify-center gap-1">
                      {!isUsed && (
                        <button
                          type="button"
                          aria-label={die.locked ? 'ロック解除' : '出目ロック'}
                          onClick={(e) => handleToggleLock(die.id, e)}
                          className={`rounded px-1 py-0.5 transition ${
                            die.locked
                              ? 'bg-sky-500/25 text-sky-300'
                              : 'bg-slate-800 text-slate-400 hover:text-amber-300'
                          }`}
                        >
                          {die.locked ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Unlock className="h-3 w-3" />
                          )}
                        </button>
                      )}
                      <span
                        className={`text-xs font-extrabold whitespace-nowrap ${
                          isSelected ? 'text-amber-300' : 'text-slate-300'
                        }`}
                      >
                        {isUsed
                          ? '発動済'
                          : die.locked
                            ? '固定中'
                            : isSelected
                              ? '選択中'
                              : `出目${die.currentPip}`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Bottom Utility Buttons: Reroll & +1 Pip ONLY */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="dice-forge-reroll-btn"
                disabled={gameState.rerollsLeft <= 0 || executingEnemyTurn}
                onClick={handleReroll}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-black text-slate-100 transition hover:bg-slate-700 disabled:opacity-40"
              >
                <Dices className="h-4 w-4 text-amber-400" />
                <span>振り直し (残{gameState.rerollsLeft})</span>
              </button>

              <button
                type="button"
                data-testid="dice-forge-manipulate-btn"
                disabled={
                  gameState.mana < 1 || executingEnemyTurn || !activeDie
                }
                onClick={() => handleManipulateDie('plus1')}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-950/70 py-2 text-xs font-black text-violet-200 transition hover:bg-violet-900/80 disabled:opacity-40"
              >
                <Zap className="h-4 w-4 text-violet-400" />
                <span>選択ダイス出目+1 (1MP)</span>
              </button>
            </div>
          </div>
        )}

        {/* C-4: STAGE CLEAR LEVEL-UP REWARD (INSIDE ZONE C, ZERO TRUNCATION) */}
        {gameState &&
          gameState.phase === 'reward' &&
          gameState.rewardOffer && (
            <div
              data-testid="dice-forge-reward-modal"
              className="flex h-full flex-col justify-between gap-1 rounded-2xl border border-emerald-500/40 bg-slate-900/95 p-2"
            >
              <div className="flex items-center justify-between text-xs font-black">
                <span className="text-amber-300">
                  LEVEL UP! Lv.{gameState.floor}→{gameState.floor + 1} (HP+3 攻+1 回復+5)
                </span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">
                  STAGE {gameState.floor} CLEAR
                </span>
              </div>

              {/* 3 Dice Face Upgrades with Target Face & Non-Wrapping Effect Tokens */}
              <div className="grid flex-1 grid-cols-3 gap-1.5">
                {gameState.rewardOffer.engravings.map((engId, idx) => {
                  const eng = ENGRAVINGS[engId]
                  const isSelected = selectedRewardEngraving === engId
                  const effParts = formatEngravingEffectParts(eng)
                  return (
                    <button
                      key={engId}
                      type="button"
                      data-testid={`reward-engraving-${idx}`}
                      onClick={() => {
                        playClickSfx()
                        setSelectedRewardEngraving(engId)
                      }}
                      className={`flex cursor-pointer flex-col items-center justify-between rounded-xl border-2 p-1.5 text-center transition-all ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/15 shadow-md'
                          : 'border-slate-800 bg-slate-950/90 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-extrabold whitespace-nowrap text-sky-300">
                        ダイス面強化[{eng.pip}]
                      </span>
                      <PipDieSvg
                        pip={eng.pip}
                        archetype={eng.archetype}
                        isSpecial
                        hasAttack={Boolean(eng.bonusAttack)}
                        hasShield={Boolean(eng.bonusShield)}
                        hasPoison={Boolean(eng.applyPoison)}
                        hasMana={Boolean(eng.bonusMana)}
                        multiHit={eng.multiHit}
                        size={34}
                      />
                      <span className="text-xs font-black leading-tight text-white">
                        {eng.name}
                      </span>
                      <div className="flex flex-wrap items-center justify-center gap-x-1 text-xs font-extrabold leading-tight text-amber-300">
                        {effParts.map((part, pIdx) => (
                          <span key={pIdx} className="whitespace-nowrap">
                            {part}
                          </span>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Optional Relic Choice with Explicit Heading & Full Effect Bar */}
              {gameState.rewardOffer.relics.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-extrabold text-violet-300">
                    <span>追加遺物を1つ選択</span>
                    <span className="text-slate-400">
                      所持 {gameState.relics.length}/5
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {gameState.rewardOffer.relics.map((rId) => {
                      const rel = RELICS[rId]
                      const isSelected = selectedRewardRelic === rId
                      return (
                        <button
                          key={rId}
                          type="button"
                          onClick={() => {
                            playClickSfx()
                            setSelectedRewardRelic(rId)
                          }}
                          className={`flex cursor-pointer items-center justify-center rounded-lg border px-1 py-1 text-center text-xs font-extrabold leading-tight ${
                            isSelected
                              ? 'border-violet-400 bg-violet-950/80 text-violet-100'
                              : 'border-slate-800 bg-slate-950 text-slate-300'
                          }`}
                        >
                          <span>{rel.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  {selectedRewardRelic && (
                    <div className="rounded-lg bg-slate-950 px-2 py-1 text-center text-xs font-bold text-violet-200">
                      遺物効果: {RELICS[selectedRewardRelic].shortEffect}
                    </div>
                  )}
                </div>
              )}

              {/* Confirm & Advance Button */}
              <div className="flex gap-2">
                {gameState.rewardOffer.nextFloorChoices.map((nodeType) => (
                  <button
                    key={nodeType}
                    type="button"
                    data-testid={`next-floor-${nodeType}`}
                    onClick={() => handleConfirmReward(nodeType)}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-sm font-black text-slate-950 shadow-lg transition hover:from-amber-400 hover:to-orange-400"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>
                      強化して次へ (STAGE {gameState.floor + 1}
                      {nodeType === 'boss'
                        ? '・BOSS'
                        : nodeType === 'elite'
                          ? '・強敵'
                          : ''}
                      )
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* C-5: FALLBACK ALTAR / SHOP */}
        {gameState &&
          (gameState.phase === 'altar' || gameState.phase === 'shop') && (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/95 p-4">
              <div className="text-base font-black text-amber-300">
                STAGE {gameState.floor} 休憩所
              </div>
              <button
                type="button"
                onClick={() => {
                  playShieldGainSfx()
                  setGameState(
                    step(
                      gameState,
                      gameState.phase === 'altar'
                        ? { type: 'ALTAR_ACTION', choice: 'heal_full' }
                        : { type: 'LEAVE_SHOP' }
                    )
                  )
                }}
                className="w-full cursor-pointer rounded-xl bg-amber-500 py-3.5 text-sm font-black text-slate-950"
              >
                HP全快で次のステージへ
              </button>
            </div>
          )}

        {/* C-6: VICTORY / GAMEOVER RESULT DECK */}
        {gameState &&
          (gameState.phase === 'victory' || gameState.phase === 'gameover') && (
            <div
              data-testid="dice-forge-result-panel"
              className="flex h-full flex-col items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/95 p-3.5 text-center"
            >
              <div className="flex items-center gap-2">
                {gameState.phase === 'victory' ? (
                  <Trophy className="h-7 w-7 text-amber-400" />
                ) : (
                  <Swords className="h-7 w-7 text-rose-400" />
                )}
                <h2 className="text-xl font-black text-white">
                  {gameState.phase === 'victory' ? '完全制覇！' : '敗北'}
                </h2>
              </div>

              <div className="grid w-full grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs font-extrabold">
                <div className="flex flex-col">
                  <span className="text-slate-400">到達ステージ</span>
                  <span className="text-base font-black text-amber-300">
                    STAGE {gameState.floor}/12
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-400">最大単発ダメージ</span>
                  <span className="text-base font-black text-rose-300">
                    {gameState.stats.maxSingleTurnDamage}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleStartNewRun(gameState.starterClass)}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-sm font-black text-slate-950 shadow-lg"
              >
                <RotateCcw className="h-4 w-4" />
                <span>もう一度遊ぶ</span>
              </button>
            </div>
          )}
      </div>

      {/* ==================================================================== */}
      {/* FULL ABILITY INSPECTION MODAL (OPTIONAL DETAIL VIEW)                 */}
      {/* ==================================================================== */}
      {gameState && showDiceNetModal && (
        <div
          data-testid="dice-forge-net-modal"
          className="absolute inset-0 z-40 flex flex-col justify-between bg-slate-950/95 p-3.5 backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <span className="text-sm font-black text-sky-300">
              HERO STATUS (Lv.{gameState.floor})
            </span>
            <button
              type="button"
              onClick={() => setShowDiceNetModal(false)}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-slate-800 px-3 py-1 text-xs font-extrabold text-slate-200 hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" />
              <span>閉じる</span>
            </button>
          </div>

          <div className="my-2 flex flex-1 flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-4 gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-center text-xs font-black">
              <div>
                <div className="text-slate-400">HP</div>
                <div className="text-emerald-300">
                  {gameState.hp}/{gameState.maxHp}
                </div>
              </div>
              <div>
                <div className="text-slate-400">基礎攻撃</div>
                <div className="text-rose-300">{gameState.baseAttack}</div>
              </div>
              <div>
                <div className="text-slate-400">基礎防御</div>
                <div className="text-sky-300">{gameState.baseDefense}</div>
              </div>
              <div>
                <div className="text-slate-400">MP</div>
                <div className="text-violet-300">
                  {gameState.mana}/{gameState.maxMana}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
              <div className="mb-1 text-xs font-black text-sky-300">
                クラス固有特性
              </div>
              <div className="text-xs font-bold text-slate-200">
                {activeClassDef.name} | {activeClassDef.specialtyLabel} |{' '}
                {activeClassDef.passiveLabel}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
              <div className="mb-2 text-xs font-black text-amber-300">
                所持遺物 ({gameState.relics.length}/5)
              </div>
              <div className="flex flex-col gap-1.5">
                {gameState.relics.map((rId) => (
                  <div
                    key={rId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-slate-950 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-black text-amber-200">
                      {RELICS[rId].name}
                    </span>
                    <span className="font-bold text-slate-300">
                      {RELICS[rId].shortEffect}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
              <div className="mb-2 text-xs font-black text-sky-300">
                習得ダイススキル ({forgedFacesCount}面)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {gameState.dice.flatMap((die) =>
                  die.faces
                    .filter((f) => !f.engravingId.startsWith('base_'))
                    .map((f, idx) => {
                      const eng = ENGRAVINGS[f.engravingId]
                      return (
                        <div
                          key={`${die.id}-${f.faceIndex}-${idx}`}
                          className="flex items-center gap-2 rounded-lg bg-slate-950 p-1.5 text-xs font-bold text-slate-200"
                        >
                          <PipDieSvg
                            pip={f.pip}
                            archetype={eng.archetype}
                            isSpecial
                            hasAttack={Boolean(eng.bonusAttack)}
                            hasShield={Boolean(eng.bonusShield)}
                            hasPoison={Boolean(eng.applyPoison)}
                            hasMana={Boolean(eng.bonusMana)}
                            size={28}
                          />
                          <div className="flex flex-col">
                            <span className="font-black text-white">
                              {eng.name}
                            </span>
                            <div className="flex flex-wrap gap-x-1 text-amber-300">
                              {formatEngravingEffectParts(eng).map(
                                (part, pIdx) => (
                                  <span key={pIdx} className="whitespace-nowrap">
                                    {part}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
