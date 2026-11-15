import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Coins,
  Dices,
  Flame,
  Hammer,
  Layers,
  Lock,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
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
  ALL_SLOT_IDS,
  calculateTurnPreview,
  canForgeEngravingOnDie,
  getSlotCategory,
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
  EngravingId,
  GameState,
  RelicId,
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

const WEAPON_CARDS: {
  id: SlotId
  title: string
  tag: string
  borderClass: string
  activeBgClass: string
  badgeClass: string
}[] = [
  {
    id: 'strike_1',
    title: 'BLADE',
    tag: 'DMG',
    borderClass: 'border-rose-500/50 hover:border-rose-400',
    activeBgClass: 'bg-rose-950/60 border-rose-400',
    badgeClass: 'bg-rose-500/25 text-rose-200',
  },
  {
    id: 'strike_2',
    title: 'FANG',
    tag: 'HIT',
    borderClass: 'border-orange-500/50 hover:border-orange-400',
    activeBgClass: 'bg-orange-950/60 border-orange-400',
    badgeClass: 'bg-orange-500/25 text-orange-200',
  },
  {
    id: 'guard_1',
    title: 'AEGIS',
    tag: 'DEF',
    borderClass: 'border-sky-500/50 hover:border-sky-400',
    activeBgClass: 'bg-sky-950/60 border-sky-400',
    badgeClass: 'bg-sky-500/25 text-sky-200',
  },
  {
    id: 'arcana_1',
    title: 'ARCANA',
    tag: 'MP+ATK',
    borderClass: 'border-violet-500/50 hover:border-violet-400',
    activeBgClass: 'bg-violet-950/60 border-violet-400',
    badgeClass: 'bg-violet-500/25 text-violet-200',
  },
  {
    id: 'alchemy_1',
    title: 'VENOM',
    tag: 'PSN+G',
    borderClass: 'border-emerald-500/50 hover:border-emerald-400',
    activeBgClass: 'bg-emerald-950/60 border-emerald-400',
    badgeClass: 'bg-emerald-500/25 text-emerald-200',
  },
]

const CLASS_SHORT_NAMES: Record<StarterClassId, string> = {
  mage: '魔導師',
  assassin: '暗殺者',
  blacksmith: '鍛冶師',
}

const playClickSfx = () => playSound('dice_place')
const playDiceSnapSfx = () => playSound('dice_place')
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
  const [selectedClass, setSelectedClass] = useState<StarterClassId>('mage')
  const [gameState, setGameState] = useState<GameState | null>(null)

  // Battle interaction states
  const [selectedDieId, setSelectedDieId] = useState<number | null>(0)
  const [rollingAnim, setRollingAnim] = useState(false)
  const [executingTurn, setExecutingTurn] = useState(false)
  const [showDiceNetModal, setShowDiceNetModal] = useState(false)
  const [activePopupText, setActivePopupText] = useState<string | null>(null)

  // Forge / Reward modal selection states
  const [selectedRewardEngraving, setSelectedRewardEngraving] =
    useState<EngravingId | null>(null)
  const [selectedForgeDieId, setSelectedForgeDieId] = useState<number>(0)
  const [selectedForgeFaceIdx, setSelectedForgeFaceIdx] = useState<number>(0)
  const [selectedRewardRelic, setSelectedRewardRelic] =
    useState<RelicId | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const titleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const floaterIdRef = useRef(1)

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
    displayedHeroHp: 64,
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

  // Default reward selections when entering reward/shop phase
  useEffect(() => {
    if (gameState?.phase === 'reward' && gameState.rewardOffer) {
      setSelectedRewardEngraving(gameState.rewardOffer.engravings[0] ?? null)
      setSelectedRewardRelic(gameState.rewardOffer.relics[0] ?? null)
      setSelectedForgeDieId(0)
      setSelectedForgeFaceIdx(0)
    }
  }, [gameState?.phase, gameState?.floor, gameState?.rewardOffer])

  // Auto-select first unassigned die whenever dice state updates
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

  // Calculate live per-slot delta preview for the currently selected die
  const slotLivePreviews = useMemo(() => {
    const map: Record<SlotId, string> = {
      strike_1: '+DMG',
      strike_2: '+HIT',
      guard_1: '+DEF',
      arcana_1: '+MP',
      alchemy_1: '+PSN',
    }
    if (!gameState || gameState.phase !== 'battle' || !turnPreview) return map
    const activeDie =
      gameState.dice.find(
        (d) => d.id === selectedDieId && d.assignedSlot === null
      ) ?? gameState.dice.find((d) => d.assignedSlot === null)
    if (!activeDie) return map

    for (const sId of ALL_SLOT_IDS) {
      if (gameState.slots[sId] !== null) continue
      const simState = step(gameState, {
        type: 'ASSIGN_DIE',
        dieId: activeDie.id,
        slotId: sId,
      })
      const simPreview = calculateTurnPreview(simState)
      const cat = getSlotCategory(sId)
      if (cat === 'guard') {
        const diffDef = Math.max(
          1,
          simPreview.totalShieldGain - turnPreview.totalShieldGain
        )
        map[sId] = `+${diffDef} DEF`
      } else if (cat === 'alchemy') {
        const diffPsn = Math.max(
          1,
          simPreview.totalPoisonApplied - turnPreview.totalPoisonApplied
        )
        map[sId] = `+${diffPsn} PSN`
      } else if (cat === 'arcana') {
        const diffDmg = Math.max(
          1,
          simPreview.totalDamage - turnPreview.totalDamage
        )
        const diffMp = Math.max(
          1,
          simPreview.totalManaGain - turnPreview.totalManaGain
        )
        map[sId] = `${diffDmg}D +${diffMp}M`
      } else {
        const diffDmg = Math.max(
          1,
          simPreview.totalDamage - turnPreview.totalDamage
        )
        map[sId] = `${diffDmg} DMG`
      }
    }
    return map
  }, [gameState, selectedDieId, turnPreview])

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

      if (opts.hitstop) {
        a.hitstopTimer = Math.max(a.hitstopTimer, opts.hitstop)
      }
      if (opts.shake) {
        a.screenShake = Math.max(a.screenShake, opts.shake)
      }
      if (opts.redFlash) {
        a.redFlashAlpha = Math.max(a.redFlashAlpha, opts.redFlash)
      }
      if (opts.goldFlash) {
        a.goldFlashAlpha = Math.max(a.goldFlashAlpha, opts.goldFlash)
      }

      if (isEnemy) {
        a.heroOffsetX = 48
        a.heroPose = opts.slashType === 'arcana' ? 'cast' : 'slash'
        a.heroPoseTimer = 0.28
        a.enemyOffsetX = 16
        a.enemyFlashWhite = 0.16
        a.enemyScale = 1.16
        a.enemyPose = 'hit'
        a.enemyPoseTimer = 0.25
      } else {
        if (opts.slashType === 'shield') {
          a.heroPose = 'guard'
          a.heroPoseTimer = 0.25
        } else {
          a.enemyOffsetX = -52
          a.heroOffsetX = -14
          a.heroPose = 'hit'
          a.heroPoseTimer = 0.28
        }
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

      // Burst Particles + Expanding Ring
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

      for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.35
        const speed = 65 + Math.random() * 135
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

      floaterIdRef.current += 1
      a.floaters.push({
        id: floaterIdRef.current,
        x: cx + (Math.random() - 0.5) * 18,
        y: cy - 24,
        vy: -58,
        text: opts.text,
        subtext: opts.subtext,
        color: opts.color,
        scale: 1.35,
        alpha: 1,
        life: 0,
        maxLife: 0.85,
      })

      setActivePopupText(opts.text)
    },
    []
  )

  // Title Screen Live Canvas Preview Loop
  useEffect(() => {
    if (gameState) return
    const cvs = titleCanvasRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return

    let rafId = 0
    let last = performance.now()
    const previewAnim: ArenaAnimState = {
      ...animRef.current,
      displayedHeroHp: STARTER_CLASSES[selectedClass].maxHp,
      displayedHeroShield: selectedClass === 'blacksmith' ? 12 : 0,
      displayedEnemyHp: 38,
      displayedEnemyShield: 0,
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      previewAnim.time += dt
      const cw = cvs.clientWidth || 360
      const ch = cvs.clientHeight || 280
      if (cvs.width !== cw || cvs.height !== ch) {
        cvs.width = cw
        cvs.height = ch
      }
      renderDungeonArena(ctx, cvs.width, cvs.height, previewAnim, {
        classId: selectedClass,
        floor: 1,
        area: 1,
        heroHp: STARTER_CLASSES[selectedClass].maxHp,
        heroMaxHp: STARTER_CLASSES[selectedClass].maxHp,
        heroShield: selectedClass === 'blacksmith' ? 12 : 0,
        heroMana: STARTER_CLASSES[selectedClass].startingMana,
        enemyIcon: 'GOBLIN',
        enemyName: 'GOBLIN',
        enemyHp: 38,
        enemyMaxHp: 38,
        enemyShield: 0,
        enemyPoison: selectedClass === 'assassin' ? 6 : 0,
        enemyThorns: 0,
        enemyIntentDamage: 8,
        enemyIntentHits: 1,
        enemyIntentShield: 0,
        isBoss: false,
        isElite: false,
      })
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [gameState, selectedClass])

  // Battle Screen 60fps Canvas Animation Loop
  useEffect(() => {
    if (!gameState) return
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

      // Projected HP & Shield reflect live assigned dice immediately!
      const preview =
        gameState.phase === 'battle' ? calculateTurnPreview(gameState) : null
      const targetEnemyHp = preview
        ? Math.max(
            0,
            gameState.enemy.hp -
              Math.max(0, preview.totalDamage - gameState.enemy.shield)
          )
        : gameState.enemy.hp
      const targetHeroShield = preview
        ? gameState.shield + preview.totalShieldGain
        : gameState.shield

      if (a.hitstopTimer > 0) {
        a.hitstopTimer = Math.max(0, a.hitstopTimer - rawDt)
      } else {
        const dt = rawDt
        a.time += dt
        a.screenShake = Math.max(0, a.screenShake - dt * 28)
        a.redFlashAlpha = Math.max(0, a.redFlashAlpha - dt * 2.2)
        a.goldFlashAlpha = Math.max(0, a.goldFlashAlpha - dt * 2.2)
        a.enemyFlashWhite = Math.max(0, a.enemyFlashWhite - dt)

        // Spring return for Hero & Enemy offsets
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

        // Smooth Lerp HP & Shield Bars
        a.displayedHeroHp +=
          (gameState.hp - a.displayedHeroHp) * Math.min(1, dt * 12)
        a.displayedHeroShield +=
          (targetHeroShield - a.displayedHeroShield) * Math.min(1, dt * 14)
        a.displayedEnemyHp +=
          (targetEnemyHp - a.displayedEnemyHp) * Math.min(1, dt * 12)
        a.displayedEnemyShield +=
          (gameState.enemy.shield - a.displayedEnemyShield) *
          Math.min(1, dt * 12)

        // Update Slashes
        for (let i = a.slashes.length - 1; i >= 0; i--) {
          a.slashes[i].progress += dt * 4.2
          if (a.slashes[i].progress >= 1) a.slashes.splice(i, 1)
        }

        // Update Particles
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

        // Update Floaters
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

      renderDungeonArena(ctx, cvs.width, cvs.height, a, {
        classId: gameState.starterClass,
        floor: gameState.floor,
        area: gameState.area,
        heroHp: gameState.hp,
        heroMaxHp: gameState.maxHp,
        heroShield: Math.round(targetHeroShield),
        heroMana: gameState.mana,
        enemyIcon: gameState.enemy.icon,
        enemyName: gameState.enemy.name,
        enemyHp: Math.round(targetEnemyHp),
        enemyMaxHp: gameState.enemy.maxHp,
        enemyShield: gameState.enemy.shield,
        enemyPoison:
          gameState.enemy.poison + (preview?.totalPoisonApplied ?? 0),
        enemyThorns: gameState.enemy.thorns,
        enemyIntentDamage:
          gameState.enemy.currentIntent.damage + gameState.enemy.strength,
        enemyIntentHits: gameState.enemy.currentIntent.hits || 1,
        enemyIntentShield: gameState.enemy.currentIntent.shieldGain,
        isBoss: gameState.enemy.isBoss,
        isElite: gameState.enemy.isElite,
      })

      rafId = requestAnimationFrame(renderLoop)
    }

    rafId = requestAnimationFrame(renderLoop)
    return () => cancelAnimationFrame(rafId)
  }, [gameState])

  // Start new run
  const handleStartNewRun = (classId: StarterClassId = selectedClass) => {
    playClickSfx()
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    const next = initGameState(seed, classId, 0)
    animRef.current.displayedHeroHp = next.hp
    animRef.current.displayedHeroShield = next.shield
    animRef.current.displayedEnemyHp = next.enemy.hp
    animRef.current.displayedEnemyShield = next.enemy.shield
    setGameState(next)
    setSelectedDieId(0)
  }

  // Resume saved run
  const handleResumeRun = () => {
    if (!savedRun) return
    playClickSfx()
    animRef.current.displayedHeroHp = savedRun.hp
    animRef.current.displayedHeroShield = savedRun.shield
    animRef.current.displayedEnemyHp = savedRun.enemy.hp
    animRef.current.displayedEnemyShield = savedRun.enemy.shield
    setGameState(savedRun)
    setSelectedDieId(0)
  }

  // Reroll unlocked dice
  const handleReroll = () => {
    if (!gameState || gameState.rerollsLeft <= 0 || executingTurn) return
    playDiceRollSfx()
    setRollingAnim(true)
    setTimeout(() => setRollingAnim(false), 240)
    const lockIds = gameState.dice.filter((d) => d.locked).map((d) => d.id)
    setGameState(step(gameState, { type: 'REROLL_DICE', lockDieIds: lockIds }))
  }

  // Toggle lock on a die
  const handleToggleLock = (dieId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!gameState || executingTurn) return
    playClickSfx()
    const clone = structuredClone(gameState)
    const die = clone.dice.find((d) => d.id === dieId)
    if (die && die.assignedSlot === null) {
      die.locked = !die.locked
      setGameState(clone)
    }
  }

  // Mana manipulation (+1 / -1 / flip)
  const handleManipulateDie = (
    mode: 'plus1' | 'minus1' | 'flip' = 'plus1'
  ) => {
    if (!gameState || gameState.mana < 1 || executingTurn) return
    const targetId =
      selectedDieId ??
      gameState.dice.find((d) => d.assignedSlot === null)?.id ??
      0
    playManaShiftSfx()
    const next = step(gameState, {
      type: 'MANIPULATE_DIE',
      dieId: targetId,
      mode,
    })
    setGameState(next)
    spawnImpactVisuals({
      target: 'hero',
      text: mode === 'plus1' ? 'PIP +1' : mode === 'minus1' ? 'PIP -1' : 'FLIP',
      color: '#c084fc',
      slashType: 'arcana',
    })
  }

  // Direct Weapon Card Tap: Assigns Die AND Immediately Executes Visual Strike on Canvas!
  const handleWeaponCardTap = (slotId: SlotId) => {
    if (!gameState || gameState.phase !== 'battle' || executingTurn) return

    const existingDieId = gameState.slots[slotId]
    const activeUnassigned =
      gameState.dice.find(
        (d) => d.id === selectedDieId && d.assignedSlot === null
      ) ?? gameState.dice.find((d) => d.assignedSlot === null)

    // If slot already has a die and no unassigned die is selected, unassign it
    if (existingDieId !== null && !activeUnassigned) {
      playDiceSnapSfx()
      const next = step(gameState, {
        type: 'ASSIGN_DIE',
        dieId: existingDieId,
        slotId: null,
      })
      setGameState(next)
      setSelectedDieId(existingDieId)
      return
    }

    const dieToUse =
      activeUnassigned ??
      (selectedDieId !== null
        ? gameState.dice.find((d) => d.id === selectedDieId)
        : undefined)
    if (!dieToUse) return

    const prevPreview = calculateTurnPreview(gameState)
    const nextState = step(gameState, {
      type: 'ASSIGN_DIE',
      dieId: dieToUse.id,
      slotId,
    })
    const nextPreview = calculateTurnPreview(nextState)
    setGameState(nextState)

    // Trigger Immediate Tactile Combat Animation on Canvas!
    const cat = getSlotCategory(slotId)
    const dmgDelta = Math.max(
      0,
      nextPreview.totalDamage - prevPreview.totalDamage
    )
    const defDelta = Math.max(
      0,
      nextPreview.totalShieldGain - prevPreview.totalShieldGain
    )
    const psnDelta = Math.max(
      0,
      nextPreview.totalPoisonApplied - prevPreview.totalPoisonApplied
    )

    if (cat === 'guard') {
      playShieldGainSfx()
      spawnImpactVisuals({
        target: 'hero',
        text: `+${ Math.max(defDelta, dieToUse.currentPip) } DEF`,
        color: '#38bdf8',
        slashType: 'shield',
        shake: 3,
      })
    } else if (cat === 'alchemy') {
      playSlashHitSfx(1)
      spawnImpactVisuals({
        target: 'enemy',
        text: `+${Math.max(psnDelta, dieToUse.currentPip)} PSN`,
        color: '#34d399',
        slashType: 'dagger',
        shake: 4,
        hitstop: 0.05,
      })
    } else if (cat === 'arcana') {
      playSlashHitSfx(2)
      spawnImpactVisuals({
        target: 'enemy',
        text: `-${Math.max(dmgDelta, dieToUse.currentPip)}!`,
        subtext: `+${Math.max(1, nextPreview.totalManaGain - prevPreview.totalManaGain)} MP`,
        color: '#c084fc',
        slashType: 'arcana',
        shake: 5,
        hitstop: 0.065,
      })
    } else {
      const isHeavy = dmgDelta >= 15
      if (isHeavy) {
        playHeavyImpactSfx()
      } else {
        playSlashHitSfx(slotId === 'strike_2' ? 2 : 1)
      }
      spawnImpactVisuals({
        target: 'enemy',
        text: `-${Math.max(dmgDelta, dieToUse.currentPip)}!`,
        color: slotId === 'strike_2' ? '#fbbf24' : '#fb7185',
        slashType: slotId === 'strike_2' ? 'dagger' : 'sword',
        shake: isHeavy ? 8 : 5,
        hitstop: isHeavy ? 0.085 : 0.06,
        goldFlash: isHeavy ? 0.18 : 0,
      })
    }

    if (nextPreview.formation.id !== 'none') {
      playComboFanfareSfx(nextPreview.finalMult)
      animRef.current.comboBanner = {
        text: nextPreview.formation.name,
        mult: `x${nextPreview.finalMult.toFixed(2)}`,
        alpha: 1,
        scale: 1.35,
      }
    }
  }

  // Quick-assign any remaining unassigned dice and execute turn choreography
  const handleExecuteTurn = () => {
    if (!gameState || gameState.phase !== 'battle' || executingTurn) return

    // If player hasn't placed all dice yet, automatically snap remaining dice into best open weapons first
    let workingState = structuredClone(gameState)
    const unassigned = workingState.dice.filter((d) => d.assignedSlot === null)
    if (unassigned.length > 0) {
      const prioritySlots: SlotId[] = [
        'strike_1',
        'guard_1',
        'strike_2',
        'arcana_1',
        'alchemy_1',
      ]
      for (const die of unassigned) {
        const freeSlot = prioritySlots.find(
          (s) => workingState.slots[s] === null
        )
        if (freeSlot) {
          workingState = step(workingState, {
            type: 'ASSIGN_DIE',
            dieId: die.id,
            slotId: freeSlot,
          })
        }
      }
      setGameState(workingState)
    }

    const preview = calculateTurnPreview(workingState)
    setExecutingTurn(true)

    // Step 1: Hero Finisher Impact
    if (preview.totalDamage >= 18) {
      playHeavyImpactSfx()
    } else {
      playSlashHitSfx(Math.max(1, preview.totalHits))
    }

    spawnImpactVisuals({
      target: 'enemy',
      text: preview.totalDamage > 0 ? `-${preview.totalDamage}!` : `+${preview.totalShieldGain} DEF`,
      subtext:
        preview.finalMult > 1
          ? `COMBO x${preview.finalMult.toFixed(2)}`
          : undefined,
      color: preview.totalDamage >= 20 ? '#fbbf24' : '#fb7185',
      slashType: 'sword',
      shake: preview.totalDamage >= 20 ? 10 : 6,
      hitstop: 0.08,
      goldFlash: preview.totalDamage >= 20 ? 0.22 : 0,
    })

    // Step 2: Enemy Counterattack or Death Burst after 320ms
    setTimeout(() => {
      const next = step(workingState, { type: 'EXECUTE_TURN' })

      if (next.phase === 'reward' || next.phase === 'victory') {
        playVictorySfx()
      } else if (next.phase === 'gameover') {
        playGameOverSfx()
      } else if (preview.expectedIncomingDamage > 0) {
        playDamageSfx()
        spawnImpactVisuals({
          target: 'hero',
          text: `-${preview.expectedIncomingDamage}`,
          color: '#f43f5e',
          slashType: 'enemy_claw',
          shake: 9,
          hitstop: 0.07,
          redFlash: 0.36,
        })
      } else {
        playShieldGainSfx()
        spawnImpactVisuals({
          target: 'hero',
          text: 'BLOCK!',
          color: '#38bdf8',
          slashType: 'shield',
          shake: 3,
        })
      }

      if (next.phase === 'victory' || next.phase === 'gameover') {
        const finalScore =
          next.stats.totalDamageDealt * 10 +
          next.floor * 500 +
          (next.phase === 'victory' ? 5000 : 0)
        const updatedMeta = recordRunCompletion(next, finalScore)
        setMetaStats(updatedMeta)
      }

      setGameState(next)
      setExecutingTurn(false)
    }, 340)
  }

  // Quick-assign helper (for instant 1-tap weapon load if desired)
  const handleQuickLoadWeapons = () => {
    if (!gameState || gameState.phase !== 'battle' || executingTurn) return
    playDiceSnapSfx()
    let s = structuredClone(gameState)
    for (const sId of ALL_SLOT_IDS) {
      const dId = s.slots[sId]
      if (dId !== null) {
        s = step(s, { type: 'ASSIGN_DIE', dieId: dId, slotId: null })
      }
    }
    const sortedDice = [...s.dice].sort((a, b) => b.currentPip - a.currentPip)
    const targetSlots: SlotId[] = [
      'strike_1',
      'guard_1',
      'strike_2',
      'arcana_1',
    ]
    for (let i = 0; i < Math.min(sortedDice.length, targetSlots.length); i++) {
      s = step(s, {
        type: 'ASSIGN_DIE',
        dieId: sortedDice[i].id,
        slotId: targetSlots[i],
      })
    }
    const prev = calculateTurnPreview(s)
    setGameState(s)
    spawnImpactVisuals({
      target: 'enemy',
      text: `${prev.totalDamage} DMG`,
      subtext: `x${prev.finalMult.toFixed(2)}`,
      color: '#fbbf24',
      slashType: 'sword',
      shake: 5,
      hitstop: 0.06,
    })
  }

  // Confirm Floor Reward & Forge
  const handleConfirmReward = (
    nextNode: 'normal' | 'elite' | 'altar' | 'shop' | 'boss'
  ) => {
    if (!gameState || gameState.phase !== 'reward') return
    playForgeHammerSfx()
    const next = step(gameState, {
      type: 'CHOOSE_REWARD',
      engravingId: selectedRewardEngraving ?? undefined,
      targetDieId: selectedForgeDieId,
      targetFaceIndex: selectedForgeFaceIdx,
      relicId: selectedRewardRelic ?? undefined,
      replaceRelicIndex: 0,
      nextNodeType: nextNode,
    })
    setGameState(next)
  }

  // ============================================================================
  // 1. TITLE SCREEN (Zero-Explanation, Visual Hero & Dice Preview)
  // ============================================================================
  if (!gameState) {
    return (
      <div
        data-testid="dice-forge-title-screen"
        className="flex h-full w-full flex-col gap-3 bg-slate-950 p-3 text-slate-100 select-none overflow-hidden"
      >
        {/* Top Banner + Live Animated Dungeon Preview (Expands to fill available space) */}
        <div className="relative flex-1 min-h-[210px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
          <canvas
            ref={titleCanvasRef}
            width={360}
            height={300}
            className="block h-full w-full"
          />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-slate-950/90 to-transparent px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Dices className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-black tracking-wider text-amber-300">
                DICE FORGE DUNGEON
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-slate-900/90 px-2.5 py-0.5 text-xs font-extrabold text-amber-300 border border-amber-500/30">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>HI {metaStats.highScore}</span>
            </div>
          </div>
        </div>

        {/* 3 Visual Hero Cards (Minimal Text: Icon + Short Name + Stat Pills + Starting Die) */}
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(STARTER_CLASSES) as StarterClassId[]).map((cid) => {
            const cls = STARTER_CLASSES[cid]
            const isSelected = selectedClass === cid
            const sampleArchetype =
              cid === 'mage'
                ? 'arcana'
                : cid === 'assassin'
                  ? 'assassin'
                  : 'fortress'
            const samplePip =
              cid === 'mage' ? 6 : cid === 'assassin' ? 2 : 4

            return (
              <button
                key={cid}
                type="button"
                data-testid={`class-select-${cid}`}
                onClick={() => {
                  playClickSfx()
                  setSelectedClass(cid)
                }}
                className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 py-3.5 px-2 transition-all ${
                  isSelected
                    ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/10 scale-[1.02]'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <ClassCrestSvg classId={cid} className="h-14 w-14" />
                <span className="mt-2 text-sm font-black text-white">
                  {CLASS_SHORT_NAMES[cid]}
                </span>
                <div className="mt-1 flex items-center gap-1 text-xs font-extrabold text-slate-300">
                  <span className="text-emerald-400">HP{cls.maxHp}</span>
                  <span>/</span>
                  <span className="text-sky-400">MP{cls.startingMana}</span>
                </div>
                <div className="mt-2.5">
                  <PipDieSvg
                    pip={samplePip}
                    archetype={sampleArchetype}
                    isSpecial
                    hasAttack={cid !== 'blacksmith'}
                    hasShield={cid === 'blacksmith'}
                    hasPoison={cid === 'assassin'}
                    hasMana={cid === 'mage'}
                    size={48}
                  />
                </div>
              </button>
            )
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {savedRun && (
            <button
              type="button"
              data-testid="dice-forge-continue-btn"
              onClick={handleResumeRun}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-emerald-400/50 bg-emerald-600 py-3 text-sm font-black text-white shadow-md transition hover:bg-emerald-500 active:scale-98"
            >
              <RotateCcw className="h-4 w-4" />
              <span>CONTINUE (F{savedRun.floor}/12)</span>
            </button>
          )}
          <button
            type="button"
            data-testid="dice-forge-start-btn"
            onClick={() => handleStartNewRun(selectedClass)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-base font-black text-slate-950 shadow-lg shadow-amber-500/25 transition hover:from-amber-400 hover:to-orange-400 active:scale-98"
          >
            <Play className="h-5 w-5 fill-current" />
            <span>BATTLE START</span>
          </button>
        </div>
      </div>
    )
  }

  // ============================================================================
  // 2. MAIN GAMEPLAY VIEWPORT (Battle / Reward / Altar / Shop / Victory / GameOver)
  // ============================================================================
  return (
    <div
      data-testid="dice-forge-canvas"
      className="relative flex h-full w-full flex-col justify-between bg-slate-950 p-2.5 text-slate-100 select-none overflow-hidden"
    >
      {/* Top Compact HUD Bar (Zero Emojis, All Custom Vector Icons) */}
      <div className="flex items-center justify-between gap-1 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-amber-500/20 px-2 py-0.5 text-xs font-black text-amber-300 border border-amber-500/30">
            F{gameState.floor}/12
          </span>
          <div className="flex items-center gap-1 text-xs font-extrabold text-amber-400">
            <Coins className="h-3.5 w-3.5" />
            <span>{gameState.gold}G</span>
          </div>
          <div className="flex items-center gap-1 text-xs font-extrabold text-violet-300">
            <Zap className="h-3.5 w-3.5 text-violet-400" />
            <span>
              {gameState.mana}/{gameState.maxMana}
            </span>
          </div>
        </div>

        {/* Relic Vector Badges + 6-Face Net Inspect Button */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            {gameState.relics.map((rId) => (
              <div
                key={rId}
                title={`${RELICS[rId].name}: ${RELICS[rId].description}`}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-amber-500/40 bg-slate-800 text-xs font-black text-amber-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            ))}
          </div>
          <button
            type="button"
            data-testid="dice-forge-inspect-btn"
            onClick={() => {
              playClickSfx()
              setShowDiceNetModal(true)
            }}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-extrabold text-slate-200 hover:bg-slate-700"
          >
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span>24F</span>
          </button>
        </div>
      </div>

      {/* Live 60fps Canvas Dungeon Battlefield (Expands to fill upper viewport) */}
      <div
        data-testid="battle-duel-stage"
        className="relative my-1.5 flex-1 min-h-[210px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-inner"
      >
        <canvas
          ref={canvasRef}
          width={360}
          height={300}
          className="block h-full w-full"
        />

        {/* Spatial Actor Hitboxes for E2E & Direct Inspection */}
        <div
          data-testid="player-avatar-actor"
          className="pointer-events-none absolute bottom-3 left-6 h-24 w-20"
        />
        <div
          data-testid="enemy-avatar-actor"
          className="pointer-events-none absolute right-6 bottom-3 h-24 w-24"
        />

        {/* Synchronized Impact Popup Badge (Top-Left Combat Feed Pill) */}
        {activePopupText && (
          <div
            data-testid="battle-floating-popup"
            className="pointer-events-none absolute top-3 left-3 rounded-full border border-amber-400/80 bg-slate-950/90 px-3 py-0.5 text-xs font-black text-amber-300 shadow-lg"
          >
            {activePopupText}
          </div>
        )}
      </div>

      {/* Direct Action Weapon Cards (Tapping any weapon immediately strikes with the selected die!) */}
      {gameState.phase === 'battle' && turnPreview && (
        <div className="flex flex-col gap-1.5">
          {/* Combo Multiplier & Total Damage Preview Strip */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1">
            <div className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-rose-400" />
              <span className="text-sm font-black text-rose-300">
                {turnPreview.totalDamage} DMG
              </span>
              <Shield className="ml-1 h-4 w-4 text-sky-400" />
              <span className="text-sm font-black text-sky-300">
                +{turnPreview.totalShieldGain}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-black text-amber-300 border border-amber-500/40">
                x{turnPreview.finalMult.toFixed(2)}
              </span>
            </div>
          </div>

          {/* 5 Interactive Weapon / Skill Cards */}
          <div className="grid grid-cols-5 gap-1.5">
            {WEAPON_CARDS.map((w) => {
              const assignedDieId = gameState.slots[w.id]
              const assignedDie =
                assignedDieId !== null
                  ? gameState.dice.find((d) => d.id === assignedDieId)
                  : null
              const assignedEng = assignedDie
                ? ENGRAVINGS[assignedDie.currentEngravingId]
                : null

              return (
                <button
                  key={w.id}
                  type="button"
                  data-testid={`slot-${w.id}`}
                  onClick={() => handleWeaponCardTap(w.id)}
                  className={`relative flex h-[88px] cursor-pointer flex-col items-center justify-between rounded-xl border-2 p-1.5 transition-all active:scale-95 ${
                    assignedDie
                      ? w.activeBgClass
                      : `bg-slate-900/90 ${w.borderClass}`
                  }`}
                >
                  <span className="text-xs font-black tracking-tight text-slate-200">
                    {w.title}
                  </span>

                  {assignedDie && assignedEng ? (
                    <PipDieSvg
                      pip={assignedDie.currentPip}
                      archetype={assignedEng.archetype}
                      isSpecial={!assignedDie.currentEngravingId.startsWith('base_')}
                      hasAttack={Boolean(assignedEng.bonusAttack)}
                      hasShield={Boolean(assignedEng.bonusShield)}
                      hasPoison={Boolean(assignedEng.applyPoison)}
                      hasMana={Boolean(assignedEng.bonusMana)}
                      multiHit={assignedEng.multiHit}
                      size={40}
                    />
                  ) : (
                    <WeaponIconSvg slotId={w.id} className="h-8 w-8" />
                  )}

                  <span
                    className={`w-full truncate rounded-md px-1 py-0.5 text-center text-xs font-extrabold ${w.badgeClass}`}
                  >
                    {assignedDie
                      ? `P${assignedDie.currentPip}`
                      : slotLivePreviews[w.id]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Bottom Physical 3D Dice Tray & Action Controls */}
      {gameState.phase === 'battle' && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {/* 4 Physical 3D Pip Dice */}
          <div className="grid grid-cols-4 gap-2">
            {gameState.dice.map((die) => {
              const eng = ENGRAVINGS[die.currentEngravingId]
              const isSelected = selectedDieId === die.id
              const isAssigned = die.assignedSlot !== null

              return (
                <div
                  key={die.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`die-card-${die.id}`}
                  onClick={() => {
                    playClickSfx()
                    if (isAssigned) {
                      const next = step(gameState, {
                        type: 'ASSIGN_DIE',
                        dieId: die.id,
                        slotId: null,
                      })
                      setGameState(next)
                    }
                    setSelectedDieId(die.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedDieId(die.id)
                    }
                  }}
                  className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 py-1.5 transition-all ${
                    isAssigned
                      ? 'border-slate-800 bg-slate-900/40 opacity-45'
                      : isSelected
                        ? 'border-amber-400 bg-amber-500/15 -translate-y-1 shadow-lg shadow-amber-500/20'
                        : 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                  } ${rollingAnim && !die.locked && !isAssigned ? 'animate-bounce' : ''}`}
                >
                  {/* Lock Toggle Button */}
                  {!isAssigned && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleLock(die.id, e)}
                      className="absolute top-1 right-1 rounded-md bg-slate-950/80 p-1 text-slate-400 hover:text-amber-300"
                      title="Lock Die"
                    >
                      {die.locked ? (
                        <Lock className="h-3 w-3 text-amber-400" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                    </button>
                  )}

                  <PipDieSvg
                    pip={die.currentPip}
                    archetype={eng.archetype}
                    isSpecial={!die.currentEngravingId.startsWith('base_')}
                    hasAttack={Boolean(eng.bonusAttack)}
                    hasShield={Boolean(eng.bonusShield)}
                    hasPoison={Boolean(eng.applyPoison)}
                    hasMana={Boolean(eng.bonusMana)}
                    multiHit={eng.multiHit}
                    size={50}
                  />
                </div>
              )
            })}
          </div>

          {/* Bottom Tactile Control Strip */}
          <div className="grid grid-cols-12 gap-1.5">
            <button
              type="button"
              data-testid="dice-forge-reroll-btn"
              disabled={gameState.rerollsLeft <= 0 || executingTurn}
              onClick={handleReroll}
              className="col-span-3 flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-black text-slate-100 transition hover:bg-slate-700 disabled:opacity-40"
            >
              <Dices className="h-4 w-4 text-amber-400" />
              <span>ROLL ({gameState.rerollsLeft})</span>
            </button>

            <button
              type="button"
              data-testid="dice-forge-manipulate-btn"
              disabled={gameState.mana < 1 || executingTurn}
              onClick={() => handleManipulateDie('plus1')}
              className="col-span-3 flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-violet-500/40 bg-violet-950/70 py-2.5 text-xs font-black text-violet-200 transition hover:bg-violet-900/80 disabled:opacity-40"
            >
              <Zap className="h-4 w-4 text-violet-400" />
              <span>+1 PIP</span>
            </button>

            <button
              type="button"
              data-testid="dice-forge-auto-assign-btn"
              disabled={executingTurn}
              onClick={handleQuickLoadWeapons}
              className="col-span-2 flex cursor-pointer items-center justify-center rounded-xl border border-sky-500/40 bg-sky-950/70 py-2.5 text-xs font-black text-sky-200 transition hover:bg-sky-900/80"
            >
              <span>LOAD</span>
            </button>

            <button
              type="button"
              data-testid="dice-forge-execute-turn"
              disabled={executingTurn}
              onClick={handleExecuteTurn}
              className="col-span-4 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 py-2.5 text-xs font-black text-slate-950 shadow-md shadow-rose-500/20 transition hover:from-rose-400 hover:to-amber-400 active:scale-95"
            >
              <Flame className="h-4 w-4 fill-current" />
              <span>STRIKE</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* 3. FLOOR CLEAR & FORGE REWARD MODAL (Zero Emojis, Visual Pip Die Forging) */}
      {/* ============================================================================ */}
      {gameState.phase === 'reward' && gameState.rewardOffer && (
        <div
          data-testid="dice-forge-reward-modal"
          className="absolute inset-0 z-30 flex flex-col justify-between bg-slate-950/95 p-3 backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-amber-400" />
              <span className="text-base font-black text-amber-300">
                FORGE DICE FACE
              </span>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-black text-emerald-300">
              FLOOR {gameState.floor} CLEAR
            </span>
          </div>

          {/* Step 1: Pick New Engraving (Visual Pip Die Cards) */}
          <div className="my-1.5 grid grid-cols-3 gap-2">
            {gameState.rewardOffer.engravings.map((engId, idx) => {
              const eng = ENGRAVINGS[engId]
              const isSelected = selectedRewardEngraving === engId
              return (
                <button
                  key={engId}
                  type="button"
                  data-testid={`reward-engraving-${idx}`}
                  onClick={() => {
                    playClickSfx()
                    setSelectedRewardEngraving(engId)
                  }}
                  className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 p-2 transition-all ${
                    isSelected
                      ? 'border-amber-400 bg-amber-500/15 shadow-md'
                      : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <PipDieSvg
                    pip={eng.pip}
                    archetype={eng.archetype}
                    isSpecial
                    hasAttack={Boolean(eng.bonusAttack)}
                    hasShield={Boolean(eng.bonusShield)}
                    hasPoison={Boolean(eng.applyPoison)}
                    hasMana={Boolean(eng.bonusMana)}
                    multiHit={eng.multiHit}
                    size={46}
                  />
                  <span className="mt-1 truncate w-full text-center text-xs font-black text-white">
                    {eng.name}
                  </span>
                  <div className="mt-0.5 flex flex-wrap justify-center gap-1 text-xs font-extrabold text-amber-300">
                    {eng.bonusAttack && <span>+{eng.bonusAttack}ATK</span>}
                    {eng.bonusShield && <span>+{eng.bonusShield}DEF</span>}
                    {eng.applyPoison && <span>+{eng.applyPoison}PSN</span>}
                    {eng.bonusMana && <span>+{eng.bonusMana}MP</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Step 2: Select Target Die & 6 Faces */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-2.5">
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {gameState.dice.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    playClickSfx()
                    setSelectedForgeDieId(d.id)
                  }}
                  className={`cursor-pointer rounded-xl py-1.5 text-xs font-black transition ${
                    selectedForgeDieId === d.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  DIE {d.id + 1}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {gameState.dice[selectedForgeDieId].faces.map((f) => {
                const fEng = ENGRAVINGS[f.engravingId]
                const valid = selectedRewardEngraving
                  ? canForgeEngravingOnDie(
                      gameState.dice[selectedForgeDieId],
                      selectedRewardEngraving,
                      f.faceIndex
                    )
                  : true
                return (
                  <button
                    key={f.faceIndex}
                    type="button"
                    disabled={!valid}
                    onClick={() => {
                      playClickSfx()
                      setSelectedForgeFaceIdx(f.faceIndex)
                    }}
                    className={`flex cursor-pointer flex-col items-center rounded-xl border-2 p-1 transition ${
                      selectedForgeFaceIdx === f.faceIndex
                        ? 'border-amber-400 bg-amber-500/20'
                        : 'border-slate-800 bg-slate-950'
                    } disabled:opacity-35`}
                  >
                    <PipDieSvg
                      pip={f.pip}
                      archetype={fEng.archetype}
                      isSpecial={!f.engravingId.startsWith('base_')}
                      size={34}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Optional Relic Choice */}
          {gameState.rewardOffer.relics.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
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
                    className={`flex cursor-pointer items-center gap-1.5 rounded-xl border p-2 text-left ${
                      isSelected
                        ? 'border-violet-400 bg-violet-950/60'
                        : 'border-slate-800 bg-slate-900'
                    }`}
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
                    <span className="truncate text-xs font-extrabold text-violet-200">
                      {rel.name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Next Floor Route Buttons */}
          <div className="flex gap-2">
            {gameState.rewardOffer.nextFloorChoices.map((nodeType) => (
              <button
                key={nodeType}
                type="button"
                data-testid={`next-floor-${nodeType}`}
                onClick={() => handleConfirmReward(nodeType)}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:from-amber-400 hover:to-orange-400 active:scale-98"
              >
                <Hammer className="h-4 w-4" />
                <span>FORGE &amp; NEXT ({nodeType.toUpperCase()})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* 4. ALTAR / SHOP PHASE OVERLAY */}
      {/* ============================================================================ */}
      {(gameState.phase === 'altar' || gameState.phase === 'shop') && (
        <div className="absolute inset-0 z-30 flex flex-col justify-between bg-slate-950/95 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-base font-black text-amber-300">
              {gameState.phase === 'altar' ? 'ARCANE ALTAR' : 'BLACKSMITH SHOP'}
            </span>
            <span className="text-xs font-extrabold text-amber-400">
              {gameState.gold}G / HP {gameState.hp}/{gameState.maxHp}
            </span>
          </div>

          {gameState.phase === 'altar' ? (
            <div className="my-auto flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  playShieldGainSfx()
                  setGameState(
                    step(gameState, { type: 'ALTAR_ACTION', choice: 'heal_full' })
                  )
                }}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-500/50 bg-emerald-950/50 p-4 text-sm font-black text-emerald-200"
              >
                <span>FULL HP RESTORE</span>
                <span>HP 100%</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playForgeHammerSfx()
                  setGameState(
                    step(gameState, {
                      type: 'ALTAR_ACTION',
                      choice: 'upgrade_two_faces',
                      targetDieId: 0,
                    })
                  )
                }}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-amber-500/50 bg-amber-950/50 p-4 text-sm font-black text-amber-200"
              >
                <span>FORGE 2 RARE FACES</span>
                <span>DIE 1</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playComboFanfareSfx(1.5)
                  setGameState(
                    step(gameState, {
                      type: 'ALTAR_ACTION',
                      choice: 'sacrifice_hp_for_relic',
                    })
                  )
                }}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-violet-500/50 bg-violet-950/50 p-4 text-sm font-black text-violet-200"
              >
                <span>GAIN RANDOM RELIC</span>
                <span>-12 HP</span>
              </button>
            </div>
          ) : (
            <div className="my-auto flex flex-col gap-3">
              <button
                type="button"
                disabled={gameState.gold < 25}
                onClick={() => {
                  playShieldGainSfx()
                  setGameState(step(gameState, { type: 'SHOP_BUY_HEAL' }))
                }}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-500/40 bg-slate-900 p-3.5 text-sm font-black text-emerald-300 disabled:opacity-40"
              >
                <span>REPAIR ARMOR (+22 HP)</span>
                <span>25G</span>
              </button>
              {gameState.rewardOffer?.engravings.map((engId) => {
                const eng = ENGRAVINGS[engId]
                return (
                  <button
                    key={engId}
                    type="button"
                    disabled={gameState.gold < eng.cost}
                    onClick={() => {
                      playForgeHammerSfx()
                      setGameState(
                        step(gameState, {
                          type: 'SHOP_BUY_ENGRAVING',
                          engravingId: engId,
                          targetDieId: 0,
                          targetFaceIndex: 0,
                        })
                      )
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm font-black text-amber-200 disabled:opacity-40"
                  >
                    <div className="flex items-center gap-2">
                      <PipDieSvg
                        pip={eng.pip}
                        archetype={eng.archetype}
                        isSpecial
                        size={36}
                      />
                      <span>{eng.name}</span>
                    </div>
                    <span>{eng.cost}G</span>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  playClickSfx()
                  setGameState(step(gameState, { type: 'LEAVE_SHOP' }))
                }}
                className="mt-2 w-full cursor-pointer rounded-2xl bg-amber-500 py-3.5 text-sm font-black text-slate-950"
              >
                NEXT FLOOR
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================================ */}
      {/* 5. 24-FACE DICE CROSS NET MODAL (Visual Pip Inspection) */}
      {/* ============================================================================ */}
      {showDiceNetModal && (
        <div
          data-testid="dice-forge-net-modal"
          className="absolute inset-0 z-40 flex flex-col justify-between bg-slate-950/95 p-3 backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-sm font-black text-sky-300">
              24 DICE FACES
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

          <div className="my-2 flex flex-col gap-2 overflow-y-auto">
            {gameState.dice.map((die) => (
              <div
                key={die.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-2"
              >
                <div className="mb-1.5 text-xs font-black text-amber-300">
                  DIE {die.id + 1}
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {die.faces.map((f) => {
                    const eng = ENGRAVINGS[f.engravingId]
                    return (
                      <div
                        key={f.faceIndex}
                        className="flex flex-col items-center rounded-lg bg-slate-950 p-1"
                      >
                        <PipDieSvg
                          pip={f.pip}
                          archetype={eng.archetype}
                          isSpecial={!f.engravingId.startsWith('base_')}
                          hasAttack={Boolean(eng.bonusAttack)}
                          hasShield={Boolean(eng.bonusShield)}
                          hasPoison={Boolean(eng.applyPoison)}
                          hasMana={Boolean(eng.bonusMana)}
                          size={36}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* 6. VICTORY / GAMEOVER RESULT OVERLAY */}
      {/* ============================================================================ */}
      {(gameState.phase === 'victory' || gameState.phase === 'gameover') && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-slate-950/95 p-5 text-center backdrop-blur-md">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-3xl ${
              gameState.phase === 'victory'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-rose-500/20 text-rose-400'
            }`}
          >
            {gameState.phase === 'victory' ? (
              <Trophy className="h-10 w-10" />
            ) : (
              <Swords className="h-10 w-10" />
            )}
          </div>

          <h2 className="text-xl font-black text-white">
            {gameState.phase === 'victory' ? 'TOWER CONQUERED' : 'DEFEATED'}
          </h2>

          <div className="grid w-full grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs font-extrabold">
            <div className="flex flex-col">
              <span className="text-slate-400">FLOOR</span>
              <span className="text-base font-black text-amber-300">
                F{gameState.floor}/12
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-400">MAX DMG</span>
              <span className="text-base font-black text-rose-300">
                {gameState.stats.maxSingleTurnDamage}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleStartNewRun(gameState.starterClass)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-sm font-black text-slate-950 shadow-lg"
          >
            <RotateCcw className="h-4 w-4" />
            <span>RETRY</span>
          </button>
        </div>
      )}
    </div>
  )
}
