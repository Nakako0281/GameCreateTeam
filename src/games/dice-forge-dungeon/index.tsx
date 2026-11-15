import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ENGRAVINGS,
  RELICS,
  STARTER_CLASSES,
} from './data'
import {
  ALL_SLOT_IDS,
  calculateTurnPreview,
  canForgeEngravingOnDie,
  initGameState,
  step,
} from './logic'
import {
  clearActiveRun,
  loadActiveRun,
  loadMetaProfile,
  recordRunCompletion,
  saveActiveRun,
  type PlayerMetaProfile,
} from './storage'
import {
  getAudioMuted,
  playSound,
  setAudioMuted,
} from './audio'
import type {
  EngravingId,
  GameState,
  RelicId,
  SlotId,
  StarterClassId,
} from './types'

type NextFloorChoice = 'elite' | 'altar' | 'shop' | 'normal' | 'boss'

// ============================================================================
// スロット定義（アイコン＋2〜3文字の直感ラベルのみ。長文説明は排除）
// ============================================================================

const SLOT_META: Record<
  SlotId,
  {
    label: string
    icon: string
    hint: string
    border: string
    bg: string
  }
> = {
  strike_1: {
    label: '斬撃',
    icon: '⚔️',
    hint: 'ATK',
    border: 'border-rose-500/60',
    bg: 'bg-rose-950/40',
  },
  strike_2: {
    label: '強撃',
    icon: '🗡️',
    hint: 'ATK+',
    border: 'border-rose-500/60',
    bg: 'bg-rose-950/40',
  },
  guard_1: {
    label: '障壁',
    icon: '🛡️',
    hint: 'DEF',
    border: 'border-sky-500/60',
    bg: 'bg-sky-950/40',
  },
  arcana_1: {
    label: '魔導',
    icon: '🔮',
    hint: 'MP×1.5',
    border: 'border-violet-500/60',
    bg: 'bg-violet-950/40',
  },
  alchemy_1: {
    label: '錬金',
    icon: '⚗️',
    hint: '毒/金',
    border: 'border-emerald-500/60',
    bg: 'bg-emerald-950/40',
  },
}

// クラス選択用の超圧縮タグ（R-06: 初期画面で長文を読ませない）
const CLASS_SHORT_TAGS: Record<StarterClassId, string> = {
  mage: '高出目×マナ増幅',
  assassin: '小目1・2×猛毒連撃',
  blacksmith: '偶数×盾反撃要塞',
}

// 刻印の超短縮ラベル（「素の刻印 [1]」のような冗長表現を排除）
function formatShortEngravingName(engId: EngravingId): string {
  if (engId.startsWith('base_')) return '通常'
  const eng = ENGRAVINGS[engId]
  return eng ? eng.name.replace(/の\d$/, '') : '刻印'
}

// 刻印効果を15文字前後のタグ形式に圧縮
function formatCompactEffect(engId: EngravingId): string {
  const eng = ENGRAVINGS[engId]
  if (!eng) return ''
  const parts: string[] = []
  if (eng.bonusAttack) parts.push(`威力+${eng.bonusAttack}`)
  if (eng.multiHit && eng.multiHit > 1) parts.push(`${eng.multiHit}連撃`)
  if (eng.bonusShield) parts.push(`盾+${eng.bonusShield}`)
  if (eng.applyPoison) parts.push(`毒+${eng.applyPoison}`)
  if (eng.bonusMana) parts.push(`MP+${eng.bonusMana}`)
  if (eng.goldGain) parts.push(`金+${eng.goldGain}G`)
  if (eng.healHp) parts.push(`HP+${eng.healHp}`)
  if (eng.applyThorns) parts.push(`棘+${eng.applyThorns}`)
  if (eng.shieldBashRatio)
    parts.push(`盾${Math.round(eng.shieldBashRatio * 100)}%追撃`)
  if (eng.multiplyEnemyPoison) parts.push(`敵毒×${eng.multiplyEnemyPoison}`)
  if (eng.manaOverchargeScale)
    parts.push(`MP×${eng.manaOverchargeScale}追撃`)
  if (eng.comboMultAdd) parts.push(`役倍率+${eng.comboMultAdd}`)
  return parts.length > 0 ? parts.join(' / ') : `出目${eng.pip}`
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  alpha: number
}

interface SlashTrail {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  alpha: number
  width: number
}

// ターン実行時のコレオグラフィ段階（R-07: 予備動作 ➔ ヒットストップ ➔ 被弾リアクション）
type BattleAnimPhase =
  | 'idle'
  | 'slot_relay' // スロット順次発光＋役倍率ポップ
  | 'player_lunge' // プレイヤーが敵へ踏み込み＋斬撃軌跡
  | 'enemy_hitstop' // 着弾ヒットストップ＋敵白/赤点滅＋ダメージ数値跳躍
  | 'enemy_lunge' // 敵が反撃で踏み込み
  | 'player_hit' // プレイヤー被弾（画面赤フラッシュ＆シェイク）またはBLOCK!

interface FloatingPopup {
  id: number
  target: 'enemy' | 'player' | 'center'
  text: string
  subText?: string
  colorClass: string
}

export default function DiceForgeDungeonGame() {
  const [profile, setProfile] = useState<PlayerMetaProfile>(() =>
    loadMetaProfile()
  )
  const [savedRun, setSavedRun] = useState<GameState | null>(() =>
    loadActiveRun()
  )
  const [inTitle, setInTitle] = useState<boolean>(true)
  const [selectedClass, setSelectedClass] = useState<StarterClassId>('mage')
  const [selectedAscension, setSelectedAscension] = useState<number>(0)

  const [gameState, setGameState] = useState<GameState>(() =>
    initGameState(Date.now() & 0x7fffffff, 'mage', 0)
  )

  // 操作・モーダル状態
  const [selectedDieId, setSelectedDieId] = useState<number | null>(0)
  const [lockDieIds, setLockDieIds] = useState<number[]>([])
  const [showDiceInspectModal, setShowDiceInspectModal] =
    useState<boolean>(false)
  const [inspectDieId, setInspectDieId] = useState<number>(0)
  const [showCompendium, setShowCompendium] = useState<boolean>(false)
  const [muted, setMuted] = useState<boolean>(() => getAudioMuted())

  // 段階的開示（Progressive Disclosure）用の短時間ポップアップヒント
  const [toastHint, setToastHint] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  // アクション・コレオグラフィ＆アニメーション状態（R-07）
  const [animPhase, setAnimPhase] = useState<BattleAnimPhase>('idle')
  const [activeRelaySlotIdx, setActiveRelaySlotIdx] = useState<number>(-1)
  const [isDiceRolling, setIsDiceRolling] = useState<boolean>(false)
  const [screenShake, setScreenShake] = useState<'none' | 'light' | 'heavy'>(
    'none'
  )
  const [screenFlash, setScreenFlash] = useState<
    'none' | 'red_damage' | 'blue_block' | 'gold_crit'
  >('none')
  const [popups, setPopups] = useState<FloatingPopup[]>([])
  const [justPlacedSlot, setJustPlacedSlot] = useState<SlotId | null>(null)

  // 報酬鍛造画面での選択状態
  const [rewardEngravingId, setRewardEngravingId] =
    useState<EngravingId | null>(null)
  const [rewardTargetDieId, setRewardTargetDieId] = useState<number>(0)
  const [rewardTargetFaceIdx, setRewardTargetFaceIdx] = useState<number>(0)
  const [rewardRelicId, setRewardRelicId] = useState<RelicId | null>(null)

  // Canvas 2D（パーティクル・斬撃スラッシュ軌跡・衝撃波）
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const slashesRef = useRef<SlashTrail[]>([])
  const animTimeoutsRef = useRef<number[]>([])

  const clearAnimTimeouts = () => {
    for (const id of animTimeoutsRef.current) {
      window.clearTimeout(id)
    }
    animTimeoutsRef.current = []
  }

  useEffect(() => {
    return () => {
      clearAnimTimeouts()
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  const showQuickToast = (text: string) => {
    setToastHint(text)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => {
      setToastHint(null)
    }, 2000)
  }

  // リアルタイムターンプレビュー
  const preview = useMemo(() => calculateTurnPreview(gameState), [gameState])

  // ラン進行中の自動セーブ（localStorage）
  useEffect(() => {
    if (!inTitle) {
      if (gameState.phase === 'victory' || gameState.phase === 'gameover') {
        clearActiveRun()
        setSavedRun(null)
      } else {
        saveActiveRun(gameState)
        setSavedRun(gameState)
      }
    }
  }, [gameState, inTitle])

  // 報酬画面に入った際、デフォルトの選択状態をセット
  useEffect(() => {
    if (gameState.phase === 'reward' && gameState.rewardOffer) {
      const firstEng = gameState.rewardOffer.engravings[0] ?? null
      setRewardEngravingId(firstEng)
      setRewardRelicId(gameState.rewardOffer.relics[0] ?? null)
      let foundDie = 0
      let foundFace = 0
      outer: for (const d of gameState.dice) {
        for (const f of d.faces) {
          if (
            f.engravingId.startsWith('base_') &&
            (!firstEng || canForgeEngravingOnDie(d, firstEng, f.faceIndex))
          ) {
            foundDie = d.id
            foundFace = f.faceIndex
            break outer
          }
        }
      }
      setRewardTargetDieId(foundDie)
      setRewardTargetFaceIdx(foundFace)
    }
  }, [gameState.phase, gameState.rewardOffer, gameState.dice])

  // Canvas 2D パーティクル＆斬撃スラッシュ軌跡描画ループ
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId = 0
    const render = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // エリアに応じた背景魔導サークル演出
      const grad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.5,
        8,
        w * 0.5,
        h * 0.5,
        w * 0.58
      )
      if (gameState.area === 1) {
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.16)')
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)')
      } else if (gameState.area === 2) {
        grad.addColorStop(0, 'rgba(168, 85, 247, 0.18)')
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)')
      } else {
        grad.addColorStop(0, 'rgba(244, 63, 94, 0.2)')
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)')
      }
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // 斬撃スラッシュ軌跡の描画・減衰
      const slashes = slashesRef.current
      for (let i = slashes.length - 1; i >= 0; i--) {
        const s = slashes[i]
        s.alpha -= 0.075
        if (s.alpha <= 0) {
          slashes.splice(i, 1)
          continue
        }
        ctx.save()
        ctx.globalAlpha = Math.max(0, s.alpha)
        ctx.strokeStyle = s.color
        ctx.lineWidth = s.width * s.alpha
        ctx.lineCap = 'round'
        ctx.shadowColor = s.color
        ctx.shadowBlur = 12
        ctx.beginPath()
        ctx.moveTo(s.x1, s.y1)
        ctx.lineTo(s.x2, s.y2)
        ctx.stroke()
        ctx.restore()
      }

      // パーティクル更新
      const list = particlesRef.current
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.14
        p.alpha -= 0.028
        if (p.alpha <= 0) {
          list.splice(i, 1)
          continue
        }
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      animId = requestAnimationFrame(render)
    }
    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [gameState.area])

  const spawnParticlesAt = (
    rx: number,
    ry: number,
    color: string,
    count = 24
  ) => {
    const canvas = canvasRef.current
    const cx = canvas ? canvas.width * rx : 200
    const cy = canvas ? canvas.height * ry : 85
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45
      const speed = 1.8 + Math.random() * 4.8
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.3,
        size: 2.8 + Math.random() * 3.5,
        color,
        alpha: 1,
      })
    }
  }

  const spawnSlashEffect = (
    target: 'enemy' | 'player',
    color = '#fb7185'
  ) => {
    const canvas = canvasRef.current
    const w = canvas ? canvas.width : 380
    const h = canvas ? canvas.height : 170
    const cx = target === 'enemy' ? w * 0.74 : w * 0.26
    const cy = h * 0.48
    slashesRef.current.push(
      {
        x1: cx - 44,
        y1: cy - 36,
        x2: cx + 44,
        y2: cy + 36,
        color,
        alpha: 1,
        width: 7,
      },
      {
        x1: cx + 38,
        y1: cy - 32,
        x2: cx - 38,
        y2: cy + 32,
        color: '#fef08a',
        alpha: 0.95,
        width: 4,
      }
    )
  }

  const triggerDiceRollAnim = () => {
    setIsDiceRolling(true)
    const tid = window.setTimeout(() => setIsDiceRolling(false), 260)
    animTimeoutsRef.current.push(tid)
  }

  const finalScore = useMemo(() => {
    const cleared = gameState.phase === 'victory'
    const floorsCleared = cleared ? 12 : Math.max(0, gameState.floor - 1)
    return (
      floorsCleared * 1000 +
      Math.round(gameState.stats.totalDamageDealt * 1.2) +
      gameState.stats.maxSingleTurnDamage * 4 +
      (cleared ? 3500 + gameState.hp * 25 : 0)
    )
  }, [gameState])

  // 新規ラン開始
  const handleStartNewRun = (clsId: StarterClassId = selectedClass) => {
    clearAnimTimeouts()
    playSound('dice_roll')
    clearActiveRun()
    const fresh = initGameState(
      (Date.now() ^ Math.floor(Math.random() * 100000)) & 0x7fffffff,
      clsId,
      selectedAscension
    )
    setGameState(fresh)
    setSavedRun(null)
    setInTitle(false)
    setSelectedDieId(0)
    setLockDieIds([])
    setAnimPhase('idle')
    setPopups([])
    triggerDiceRollAnim()
  }

  // セーブデータから再開
  const handleContinueRun = () => {
    if (!savedRun) return
    clearAnimTimeouts()
    playSound('dice_place')
    setGameState(savedRun)
    setInTitle(false)
    setSelectedDieId(0)
    setAnimPhase('idle')
  }

  // クイック自動配置（残りの未配置ダイスをスロットへスナップ配置）
  const handleAutoAssignRemaining = () => {
    if (animPhase !== 'idle') return
    playSound('dice_place')
    let next = gameState
    const unassigned = next.dice.filter((d) => d.assignedSlot === null)
    for (const die of unassigned) {
      const eng = ENGRAVINGS[die.currentEngravingId]
      const curPrev = calculateTurnPreview(next)
      const incoming =
        (next.enemy.currentIntent.damage + next.enemy.strength) *
        (next.enemy.currentIntent.hits || 1)
      let targetSlot: SlotId | null = null
      if (
        next.slots.guard_1 === null &&
        (eng.archetype === 'fortress' ||
          incoming > next.shield + curPrev.totalShieldGain + 4)
      ) {
        targetSlot = 'guard_1'
      } else if (next.slots.strike_1 === null) {
        targetSlot = 'strike_1'
      } else if (next.slots.strike_2 === null) {
        targetSlot = 'strike_2'
      } else if (next.slots.arcana_1 === null) {
        targetSlot = 'arcana_1'
      } else if (next.slots.alchemy_1 === null) {
        targetSlot = 'alchemy_1'
      }
      if (targetSlot) {
        next = step(next, {
          type: 'ASSIGN_DIE',
          dieId: die.id,
          slotId: targetSlot,
        })
      }
    }
    setGameState(next)
    const afterPrev = calculateTurnPreview(next)
    if (afterPrev.formation.id !== 'none') {
      playSound('combo_step', 2)
    }
  }

  // スロットタップ時の配置・解除（バウンスフィードバック付き）
  const handleSlotTap = (slotId: SlotId) => {
    if (animPhase !== 'idle') return
    const occupyingDieId = gameState.slots[slotId]
    if (selectedDieId !== null) {
      const selDie = gameState.dice.find((d) => d.id === selectedDieId)
      if (selDie && selDie.assignedSlot === slotId) {
        playSound('dice_place')
        const next = step(gameState, {
          type: 'ASSIGN_DIE',
          dieId: selDie.id,
          slotId: null,
        })
        setGameState(next)
        return
      }
      playSound('dice_place')
      setJustPlacedSlot(slotId)
      const tid = window.setTimeout(() => setJustPlacedSlot(null), 220)
      animTimeoutsRef.current.push(tid)

      const next = step(gameState, {
        type: 'ASSIGN_DIE',
        dieId: selectedDieId,
        slotId,
      })
      setGameState(next)
      const nextUnassigned = next.dice.find((d) => d.assignedSlot === null)
      setSelectedDieId(nextUnassigned ? nextUnassigned.id : null)
      const nextPrev = calculateTurnPreview(next)
      if (nextPrev.formation.id !== 'none') {
        playSound('combo_step', 1)
      }
      return
    }

    if (occupyingDieId !== null && occupyingDieId !== undefined) {
      playSound('dice_place')
      const next = step(gameState, {
        type: 'ASSIGN_DIE',
        dieId: occupyingDieId,
        slotId: null,
      })
      setGameState(next)
      setSelectedDieId(occupyingDieId)
    }
  }

  // リロール実行（ダイス回転アニメーション付き）
  const handleReroll = () => {
    if (animPhase !== 'idle' || gameState.rerollsLeft <= 0) return
    playSound('dice_roll')
    triggerDiceRollAnim()
    spawnParticlesAt(0.5, 0.75, '#38bdf8', 14)
    const next = step(gameState, {
      type: 'REROLL_DICE',
      lockDieIds,
    })
    setGameState(next)
  }

  // マナ介入（出目操作）
  const handleManipulateDie = (mode: 'plus1' | 'minus1' | 'flip') => {
    if (animPhase !== 'idle') return
    const targetId =
      selectedDieId ??
      gameState.dice.find((d) => d.assignedSlot === null)?.id ??
      0
    if (gameState.mana < 1) {
      showQuickToast('⚠️ MP不足')
      return
    }
    playSound('magic_burst')
    spawnParticlesAt(0.28, 0.5, '#a855f7', 16)
    const next = step(gameState, {
      type: 'MANIPULATE_DIE',
      dieId: targetId,
      mode,
    })
    setGameState(next)
  }

  // ==========================================================================
  // ターン実行：桜井政博氏の原則＆『Balatro』『Slay the Spire』式コレオグラフィ
  //   0msの即時書き換えを廃止し、予備動作 ➔ ヒットストップ ➔ ダメージ跳躍 ➔ 敵反撃 ➔ 被弾フラッシュを再生
  // ==========================================================================
  const handleExecuteTurn = () => {
    if (animPhase !== 'idle') return
    clearAnimTimeouts()

    let current = gameState
    const assignedCount = ALL_SLOT_IDS.filter(
      (s) => current.slots[s] !== null
    ).length
    if (assignedCount === 0) {
      const slotOrder: SlotId[] = [
        'strike_1',
        'guard_1',
        'strike_2',
        'arcana_1',
      ]
      for (let i = 0; i < current.dice.length; i++) {
        current = step(current, {
          type: 'ASSIGN_DIE',
          dieId: current.dice[i].id,
          slotId: slotOrder[i],
        })
      }
      setGameState(current)
    }

    const turnPrev = calculateTurnPreview(current)
    const nextState = step(current, { type: 'EXECUTE_TURN' })
    const enemyDefeated =
      nextState.phase === 'reward' || nextState.phase === 'victory'
    const playerTookDamage = nextState.hp < current.hp
    const damageTakenAmount = Math.max(0, current.hp - nextState.hp)
    const enemyIntendedAttack =
      current.enemy.currentIntent.damage > 0 ||
      current.enemy.currentIntent.type === 'attack' ||
      current.enemy.currentIntent.type === 'heavy_attack' ||
      current.enemy.currentIntent.type === 'multi_attack' ||
      current.enemy.currentIntent.type === 'attack_defend' ||
      current.enemy.currentIntent.type === 'enrage_attack'

    // Phase 1: スロット順次リレー発火（0〜140ms）
    setAnimPhase('slot_relay')
    setActiveRelaySlotIdx(0)
    playSound('combo_step', 1)

    const tSlot2 = window.setTimeout(() => {
      setActiveRelaySlotIdx(1)
      if (turnPrev.finalMult >= 1.4) {
        playSound('combo_step', 2)
      }
    }, 70)

    // Phase 2: プレイヤーの踏み込み（Lunge）＆ 斬撃軌跡（140ms）
    const tLunge = window.setTimeout(() => {
      setActiveRelaySlotIdx(-1)
      setAnimPhase('player_lunge')
      if (turnPrev.totalShieldGain > 0) {
        playSound('guard_shield')
        spawnParticlesAt(0.24, 0.5, '#38bdf8', 16)
        setPopups((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            target: 'player',
            text: `+${turnPrev.totalShieldGain} 🛡️`,
            colorClass: 'text-sky-300',
          },
        ])
      }
      if (turnPrev.totalDamage > 0 || turnPrev.totalPoisonApplied > 0) {
        playSound('attack_slash')
        spawnSlashEffect(
          'enemy',
          turnPrev.finalMult >= 1.6 ? '#fbbf24' : '#fb7185'
        )
      }
    }, 140)

    // Phase 3: 着弾ヒットストップ（瞬間停止）＋ 敵フラッシュ・ノックバック・ダメージ数値ポップ（230ms）
    const tHitstop = window.setTimeout(() => {
      setAnimPhase('enemy_hitstop')
      setScreenShake(turnPrev.totalDamage >= 30 ? 'heavy' : 'light')
      if (turnPrev.finalMult >= 1.6) {
        setScreenFlash('gold_crit')
      }
      spawnParticlesAt(0.75, 0.48, '#f43f5e', 28)

      const dmgText =
        turnPrev.totalDamage > 0 ? `-${turnPrev.totalDamage}!` : 'HIT!'
      const poisonSub =
        turnPrev.totalPoisonApplied > 0
          ? `☣️+${turnPrev.totalPoisonApplied}`
          : undefined

      setPopups((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          target: 'enemy',
          text: dmgText,
          subText: poisonSub,
          colorClass:
            turnPrev.finalMult >= 1.6 ? 'text-amber-300' : 'text-rose-400',
        },
      ])
    }, 230)

    // Phase 4: 敵撃破バースト または 敵の反撃モーション（390ms）
    const tCounter = window.setTimeout(() => {
      setScreenShake('none')
      setScreenFlash('none')

      if (enemyDefeated) {
        // 敵撃破時は爆発パーティクルを出して報酬へ
        spawnParticlesAt(0.75, 0.48, '#fbbf24', 36)
        playSound('victory')
        setPopups((prev) => [
          ...prev,
          {
            id: Date.now() + 3,
            target: 'enemy',
            text: '💥 K.O.!!',
            colorClass: 'text-amber-300',
          },
        ])
      } else {
        // 敵が生き残った場合：敵の反撃踏み込み＋被弾フラッシュまたはBLOCK!
        setAnimPhase('enemy_lunge')
        if (playerTookDamage) {
          playSound('attack_slash')
          spawnSlashEffect('player', '#f43f5e')
          setScreenFlash('red_damage')
          setScreenShake('heavy')
          setPopups((prev) => [
            ...prev,
            {
              id: Date.now() + 4,
              target: 'player',
              text: `-${damageTakenAmount} HP!`,
              colorClass: 'text-rose-400',
            },
          ])
        } else if (enemyIntendedAttack) {
          playSound('guard_shield')
          setScreenFlash('blue_block')
          setScreenShake('light')
          setPopups((prev) => [
            ...prev,
            {
              id: Date.now() + 5,
              target: 'player',
              text: '🛡️ BLOCK!',
              colorClass: 'text-sky-300',
            },
          ])
        }
      }
    }, 390)

    // Phase 5: 状態確定＆次ターンのダイスロール演出（560ms）
    const tFinish = window.setTimeout(() => {
      setScreenShake('none')
      setScreenFlash('none')
      setAnimPhase('idle')
      setPopups([])
      setGameState(nextState)
      setSelectedDieId(0)
      setLockDieIds([])

      if (nextState.phase === 'battle') {
        triggerDiceRollAnim()
      }

      if (nextState.phase === 'victory' || nextState.phase === 'gameover') {
        const cleared = nextState.phase === 'victory'
        const floorsCleared = cleared ? 12 : Math.max(0, nextState.floor - 1)
        const calcScore =
          floorsCleared * 1000 +
          Math.round(nextState.stats.totalDamageDealt * 1.2) +
          nextState.stats.maxSingleTurnDamage * 4 +
          (cleared ? 3500 + nextState.hp * 25 : 0)
        const updated = recordRunCompletion(nextState, calcScore)
        setProfile(updated)
        clearActiveRun()
        setSavedRun(null)
      }
    }, 560)

    animTimeoutsRef.current.push(tSlot2, tLunge, tHitstop, tCounter, tFinish)
  }

  // 鍛造報酬確定＆次フロア進行
  const handleConfirmReward = (nextNodeType: NextFloorChoice) => {
    playSound('forge_hammer')
    spawnParticlesAt(0.5, 0.5, '#fbbf24', 28)
    const next = step(gameState, {
      type: 'CHOOSE_REWARD',
      engravingId: rewardEngravingId ?? undefined,
      targetDieId: rewardTargetDieId,
      targetFaceIndex: rewardTargetFaceIdx,
      relicId: rewardRelicId ?? undefined,
      replaceRelicIndex: 0,
      nextNodeType,
    })
    saveActiveRun(next)
    setSavedRun(next)
    setGameState(next)
    setSelectedDieId(0)
    setLockDieIds([])
    if (next.phase === 'battle') {
      triggerDiceRollAnim()
    }
  }

  const toggleMute = () => {
    const nextMute = !muted
    setMuted(nextMute)
    setAudioMuted(nextMute)
  }

  const handleShareX = () => {
    const statusText =
      gameState.phase === 'victory'
        ? `🏆全12階層完全制覇！(Lv${gameState.ascension})`
        : `💀Floor ${gameState.floor} 到達`
    const clsName = STARTER_CLASSES[gameState.starterClass].name
    const text = `🎲『ダイス・フォージ・ダンジョン』\nクラス：${clsName}\n結果：${statusText}\nスコア：${finalScore.toLocaleString()} pt（最大一撃 ${gameState.stats.maxSingleTurnDamage} DMG）\n#AIゲームラボ #DiceForgeDungeon`
    const url = window.location.href
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  // ==========================================================================
  // 1. タイトル ＆ クラス選択画面（R-06: 文字を極限まで削ぎ落とし、1秒で開始可能）
  // ==========================================================================
  if (inTitle) {
    return (
      <div
        data-testid="dice-forge-title-screen"
        className="relative h-full w-full flex flex-col justify-between bg-slate-950 text-slate-100 px-3.5 py-3 overflow-hidden select-none"
      >
        {/* ヒーローエンブレム＆タイトル（長文説明なし） */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-3xl shadow-lg shadow-amber-500/20 animate-bounce">
            🎲
          </div>
          <h1 className="text-xl font-black tracking-tight text-white">
            ダイス・フォージ・ダンジョン
          </h1>
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-300">
            <span>🏆 BEST {profile.highScore.toLocaleString()}</span>
            <span>・</span>
            <button
              type="button"
              onClick={() => setShowCompendium(true)}
              className="px-2.5 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
            >
              📖 図鑑 {profile.discoveredEngravings.length}/
              {Object.keys(ENGRAVINGS).length}
            </button>
          </div>
        </div>

        {/* オートセーブ再開ボタン（存在する場合） */}
        {savedRun && (
          <div className="bg-emerald-950/75 border-2 border-emerald-400/70 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-lg">
            <div className="text-xs font-bold">
              <div className="text-emerald-300">
                💾 Floor {savedRun.floor}/12 中断データ
              </div>
              <div className="text-white">
                {STARTER_CLASSES[savedRun.starterClass].icon}{' '}
                {STARTER_CLASSES[savedRun.starterClass].name} ❤️{savedRun.hp}/
                {savedRun.maxHp}
              </div>
            </div>
            <button
              type="button"
              data-testid="dice-forge-continue-btn"
              onClick={handleContinueRun}
              className="px-3.5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs shrink-0 shadow cursor-pointer"
            >
              ▶ 再開
            </button>
          </div>
        )}

        {/* スタータークラス3種選択（長文を全廃し、アイコン＋名前＋10文字タグのみ） */}
        <div className="space-y-2">
          {(Object.keys(STARTER_CLASSES) as StarterClassId[]).map((cid) => {
            const cls = STARTER_CLASSES[cid]
            const isSelected = selectedClass === cid
            return (
              <button
                key={cid}
                type="button"
                data-testid={`class-select-${cid}`}
                onClick={() => {
                  playSound('dice_place')
                  setSelectedClass(cid)
                }}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border-2 transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-950/90 border-amber-400 scale-[1.02] shadow-lg shadow-amber-500/10'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${
                      isSelected
                        ? 'bg-amber-400/20 border border-amber-400/60'
                        : 'bg-slate-800'
                    }`}
                  >
                    {cls.icon}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-black text-white">
                      {cls.name}
                    </div>
                    <div className="text-xs font-bold text-amber-300">
                      {CLASS_SHORT_TAGS[cid]}
                    </div>
                  </div>
                </div>
                <div className="text-right text-xs font-black text-slate-200">
                  <div>❤️ {cls.maxHp}</div>
                  <div className="text-amber-300">💰 {cls.startingGold}G</div>
                </div>
              </button>
            )
          })}
        </div>

        {/* 難度選択 ＆ 出撃ボタン */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs">
            <span className="font-bold text-slate-400">🔥 難度:</span>
            {[0, 1, 2, 3].map((lv) => {
              const unlocked = lv <= profile.unlockedAscension
              return (
                <button
                  key={lv}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => setSelectedAscension(lv)}
                  className={`px-2.5 py-1 rounded-lg font-black text-xs cursor-pointer ${
                    selectedAscension === lv
                      ? 'bg-amber-400 text-slate-950'
                      : unlocked
                        ? 'bg-slate-800 text-slate-200'
                        : 'bg-slate-900 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  Lv{lv}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            data-testid="dice-forge-start-btn"
            onClick={() => handleStartNewRun(selectedClass)}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:brightness-110 active:scale-98 text-slate-950 font-black text-base shadow-xl shadow-orange-500/25 cursor-pointer transition"
          >
            🎲 出撃スタート
          </button>
        </div>

        {/* 図鑑モーダル */}
        {showCompendium && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 flex flex-col justify-between p-3 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h2 className="text-sm font-black text-amber-300">
                📖 図鑑（{profile.totalClears}勝 / {profile.totalRuns}戦）
              </h2>
              <button
                type="button"
                onClick={() => setShowCompendium(false)}
                className="px-2.5 py-1 rounded bg-slate-800 text-xs font-bold cursor-pointer"
              >
                閉じる
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 my-2 pr-1">
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(ENGRAVINGS).map((e) => (
                  <div
                    key={e.id}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="font-bold text-white">
                      {e.icon} {e.name} (出目{e.pip})
                    </div>
                    <div className="text-amber-300">
                      {formatCompactEffect(e.id)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 現在のクラス情報
  const currentClassMeta = STARTER_CLASSES[gameState.starterClass]

  // 画面シェイク用クラス
  const shakeClass =
    screenShake === 'heavy'
      ? 'translate-x-1.5 -translate-y-1'
      : screenShake === 'light'
        ? '-translate-x-1 translate-y-0.5'
        : ''

  // ==========================================================================
  // 2. メインゲーム画面（対峙アリーナ＋アニメーション演出＋直感ダイスUI）
  // ==========================================================================
  return (
    <div
      className={`relative h-full w-full flex flex-col justify-between bg-slate-950 text-slate-100 px-2.5 py-1.5 overflow-hidden select-none transition-transform duration-75 ${shakeClass}`}
    >
      {/* 被弾・クリティカル・ブロック時の全画面フラッシュオーバーレイ（R-07） */}
      {screenFlash !== 'none' && (
        <div
          data-testid="battle-screen-flash"
          className={`pointer-events-none absolute inset-0 z-30 transition-opacity duration-150 ${
            screenFlash === 'red_damage'
              ? 'bg-rose-600/35 ring-8 ring-inset ring-rose-500/80'
              : screenFlash === 'blue_block'
                ? 'bg-sky-500/25 ring-4 ring-inset ring-sky-400/80'
                : 'bg-amber-400/25'
          }`}
        />
      )}

      {/* ① トップステータスバー（アイコン＋数字のみ） */}
      <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1 shrink-0">
        <div className="flex items-center gap-2 text-xs font-black">
          <span className="px-2 py-0.5 rounded bg-indigo-500/25 border border-indigo-400/40 text-indigo-200">
            🏰 F{gameState.floor}/12
          </span>
          <span className="text-rose-400">
            ❤️ {gameState.hp}/{gameState.maxHp}
          </span>
          <span className="text-sky-300">🛡️ {gameState.shield}</span>
          <span className="text-violet-300">
            🔮 {gameState.mana}/{gameState.maxMana}
          </span>
          <span className="text-amber-300">💰 {gameState.gold}G</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleMute}
            className="px-2 py-0.5 rounded bg-slate-800 text-xs font-bold text-slate-200 cursor-pointer"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            type="button"
            onClick={() => {
              saveActiveRun(gameState)
              setSavedRun(loadActiveRun())
              setInTitle(true)
            }}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
          >
            💾中断
          </button>
        </div>
      </div>

      {/* ② レリックバー＋エリアボスアイコン（タップ時のみ詳細トースト表示） */}
      <div className="flex items-center justify-between gap-1.5 bg-slate-900/60 border border-slate-800/80 rounded-lg px-2 py-1 shrink-0">
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((idx) => {
            const rId = gameState.relics[idx]
            const rel = rId ? RELICS[rId] : null
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (rel) {
                    showQuickToast(`👑 ${rel.name}: ${rel.description}`)
                  }
                }}
                className={`w-7 h-7 rounded-md border flex items-center justify-center text-sm cursor-pointer transition ${
                  rel
                    ? 'bg-slate-800 border-amber-400/60 hover:scale-110'
                    : 'bg-slate-900/40 border-slate-800 text-slate-600'
                }`}
              >
                {rel ? rel.icon : '・'}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            showQuickToast(
              `⚠️ ボス【${gameState.upcomingBoss.name}】${gameState.upcomingBoss.traitDescription}`
            )
          }
          className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs font-bold truncate cursor-pointer"
        >
          {gameState.upcomingBoss.icon} BOSS: {gameState.upcomingBoss.traitName}
        </button>
      </div>

      {/* ③ 対峙バトルアリーナ（左：プレイヤー vs 右：敵モンスター ＋ モーション＆ヒットストップ） */}
      <div className="relative flex-1 min-h-0 flex flex-col justify-between bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 my-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="dice-forge-canvas"
          width={380}
          height={180}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* タップ時の段階的開示（Progressive Disclosure）トースト */}
        {toastHint && (
          <div className="absolute top-2 left-2 right-2 z-30 bg-slate-950/95 border border-amber-400/60 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-200 shadow-lg text-center">
            {toastHint}
          </div>
        )}

        {/* 対峙ステージ（左：プレイヤー / 右：敵モンスター） */}
        <div
          data-testid="battle-duel-stage"
          className="relative z-10 flex-1 flex items-center justify-between px-3 my-auto"
        >
          {/* 左側：プレイヤーキャラクター */}
          <div
            data-testid="player-avatar-actor"
            className={`relative flex flex-col items-center transition-all duration-150 ${
              animPhase === 'player_lunge'
                ? 'translate-x-16 scale-125'
                : animPhase === 'enemy_lunge' && gameState.hp < gameState.maxHp
                  ? '-translate-x-3 scale-95 brightness-150'
                  : 'translate-x-0 scale-100'
            }`}
          >
            {/* プレイヤー頭上のポップアップ（+Shield / -HP / BLOCK!） */}
            {popups
              .filter((p) => p.target === 'player')
              .map((p) => (
                <div
                  key={p.id}
                  data-testid="battle-floating-popup"
                  className={`absolute -top-7 whitespace-nowrap text-base font-black drop-shadow animate-bounce ${p.colorClass}`}
                >
                  {p.text}
                </div>
              ))}

            {/* プレイヤーアバター＆シールドオーラ */}
            <div
              className={`relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl transition-all ${
                gameState.shield + preview.totalShieldGain > 0
                  ? 'bg-sky-950/90 border-2 border-sky-400 ring-4 ring-sky-400/25'
                  : 'bg-slate-950/90 border-2 border-indigo-400/60'
              }`}
            >
              {currentClassMeta.icon}
              {(gameState.shield > 0 || preview.totalShieldGain > 0) && (
                <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-sky-500 text-slate-950 font-black text-xs shadow">
                  🛡️{gameState.shield + preview.totalShieldGain}
                </span>
              )}
            </div>

            {/* プレイヤーHPゲージ */}
            <div className="w-24 h-2 bg-slate-950 border border-slate-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200"
                style={{
                  width: `${Math.max(0, Math.min(100, (gameState.hp / gameState.maxHp) * 100))}%`,
                }}
              />
            </div>
            <div className="text-xs font-black text-emerald-300 mt-0.5">
              ❤️ {gameState.hp}/{gameState.maxHp}
            </div>
          </div>

          {/* 中央：VS ＆ 共鳴役倍率バッジ */}
          <div className="flex flex-col items-center justify-center gap-1 px-1">
            {preview.formation.id !== 'none' ? (
              <div
                className={`px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs shadow-lg transition-transform ${
                  animPhase === 'slot_relay' || animPhase === 'player_lunge'
                    ? 'scale-125'
                    : 'scale-100'
                }`}
              >
                ✨ {preview.formation.name} ×{preview.finalMult.toFixed(2)}
              </div>
            ) : (
              <div className="text-xs font-black text-slate-500">VS</div>
            )}
            {preview.totalDamage > 0 && (
              <div className="text-sm font-black text-rose-400">
                ⚔️ {preview.totalDamage}
              </div>
            )}
          </div>

          {/* 右側：敵モンスター */}
          <div
            data-testid="enemy-avatar-actor"
            className={`relative flex flex-col items-center transition-all duration-150 ${
              animPhase === 'enemy_hitstop'
                ? 'translate-x-3 -translate-y-1 scale-110 brightness-200 saturate-200'
                : animPhase === 'enemy_lunge'
                  ? '-translate-x-16 scale-125'
                  : 'translate-x-0 scale-100'
            }`}
          >
            {/* 敵頭上のダメージポップアップ（-29! / K.O.!!） */}
            {popups
              .filter((p) => p.target === 'enemy')
              .map((p) => (
                <div
                  key={p.id}
                  data-testid="battle-floating-popup"
                  className={`absolute -top-9 z-20 whitespace-nowrap text-xl font-black drop-shadow-md animate-bounce ${p.colorClass}`}
                >
                  {p.text}{' '}
                  {p.subText && (
                    <span className="text-xs text-emerald-300">
                      {p.subText}
                    </span>
                  )}
                </div>
              ))}

            {/* 敵の次ターン行動インテント（Slay the Spire式：アイコン＋数字で直感表示） */}
            <button
              type="button"
              onClick={() =>
                showQuickToast(
                  `⚠️ 敵の次ターン行動: ${gameState.enemy.currentIntent.label}`
                )
              }
              className="mb-1 px-2.5 py-0.5 rounded-full bg-rose-950/90 border border-rose-500/70 text-xs font-black text-rose-200 shadow cursor-pointer flex items-center gap-1"
            >
              <span>
                {gameState.enemy.currentIntent.type.includes('attack')
                  ? '🗡️'
                  : '🛡️'}
              </span>
              <span>{gameState.enemy.currentIntent.label}</span>
            </button>

            {/* 敵アバター */}
            <button
              type="button"
              onClick={() =>
                showQuickToast(
                  `${gameState.enemy.icon} ${gameState.enemy.name}: ${gameState.enemy.traitDescription}`
                )
              }
              className={`relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl cursor-pointer transition-all ${
                animPhase === 'enemy_hitstop'
                  ? 'bg-rose-500 border-2 border-white'
                  : 'bg-slate-950/90 border-2 border-rose-500/60'
              }`}
            >
              {gameState.enemy.icon}
              {gameState.enemy.poison > 0 && (
                <span className="absolute -bottom-2 -left-2 px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs">
                  ☣️{gameState.enemy.poison}
                </span>
              )}
              {gameState.enemy.shield > 0 && (
                <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-sky-400 text-slate-950 font-black text-xs">
                  🛡️{gameState.enemy.shield}
                </span>
              )}
            </button>

            {/* 敵HPゲージ＆名前 */}
            <div className="w-24 h-2 bg-slate-950 border border-slate-800 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all duration-200"
                style={{
                  width: `${Math.max(0, Math.min(100, (gameState.enemy.hp / gameState.enemy.maxHp) * 100))}%`,
                }}
              />
            </div>
            <div className="text-xs font-black text-rose-300 mt-0.5 truncate max-w-[110px]">
              {gameState.enemy.name.slice(0, 6)} {gameState.enemy.hp}/
              {gameState.enemy.maxHp}
            </div>
          </div>
        </div>

        {/* リアルタイム結果プレビューバー（アイコン＋数字で一目で分かる1行バー） */}
        <div
          data-testid="dice-forge-preview-bar"
          className="relative z-10 flex items-center justify-between bg-slate-950/90 border border-indigo-500/40 rounded-xl px-3 py-1.5 text-xs font-black"
        >
          <span className="text-amber-300">
            ✨ {preview.formation.name} ×{preview.finalMult.toFixed(2)}
          </span>
          <span className="text-rose-300">
            ⚔️ {preview.totalDamage}
            {preview.totalPoisonApplied > 0
              ? ` (+☣️${preview.totalPoisonApplied})`
              : ''}
          </span>
          <span className="text-sky-300">🛡️ +{preview.totalShieldGain}</span>
          <span
            className={
              preview.expectedIncomingDamage > 0
                ? 'text-amber-300'
                : 'text-emerald-300'
            }
          >
            次HP {preview.expectedHpAfterTurn}
          </span>
        </div>
      </div>

      {/* ④ タクティカル・スロット（5枠横並び・バウンス＆リレー発光アニメーション付き） */}
      <div className="grid grid-cols-5 gap-1.5 my-1 shrink-0">
        {ALL_SLOT_IDS.map((slotId, slotIdx) => {
          const meta = SLOT_META[slotId]
          const assignedDieId = gameState.slots[slotId]
          const die =
            assignedDieId !== null
              ? gameState.dice.find((d) => d.id === assignedDieId)
              : null
          const eng = die ? ENGRAVINGS[die.currentEngravingId] : null
          const isJustPlaced = justPlacedSlot === slotId
          const isRelayActive =
            animPhase === 'slot_relay' &&
            die !== null &&
            activeRelaySlotIdx >= 0 &&
            slotIdx <= activeRelaySlotIdx + 2

          return (
            <button
              key={slotId}
              type="button"
              data-testid={`slot-${slotId}`}
              onClick={() => handleSlotTap(slotId)}
              className={`h-20 rounded-xl border-2 p-1 flex flex-col items-center justify-between transition-all duration-150 cursor-pointer ${meta.border} ${meta.bg} ${
                isJustPlaced || isRelayActive
                  ? 'scale-110 ring-2 ring-amber-300 brightness-125'
                  : selectedDieId !== null && !die
                    ? 'ring-1 ring-amber-400/60'
                    : ''
              }`}
            >
              <div className="text-xs font-black text-slate-200 truncate w-full text-center">
                {meta.icon}
                {meta.label}
              </div>
              {die && eng ? (
                <div className="w-full rounded-lg bg-slate-900 border border-amber-400 py-1 px-1 text-center shadow-inner">
                  <div className="text-base font-black text-amber-300 leading-none">
                    {eng.icon} {die.currentPip}
                  </div>
                  <div className="text-xs font-bold text-slate-200 truncate mt-0.5">
                    {formatShortEngravingName(die.currentEngravingId)}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-bold py-2">
                  {meta.hint}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ⑤ ダイストレイ（立体サイコロ4個）＆ 操作コントロールバー */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-2 space-y-1.5 shrink-0">
        {/* サイコロ4個（冗長な文字を廃止し、大きな出目数字＋アイコンのサイコロ表現） */}
        <div className="grid grid-cols-4 gap-1.5">
          {gameState.dice.map((die) => {
            const eng = ENGRAVINGS[die.currentEngravingId]
            const isSelected = selectedDieId === die.id
            const isAssigned = die.assignedSlot !== null
            const isLocked = lockDieIds.includes(die.id)

            return (
              <div key={die.id} className="relative">
                <button
                  type="button"
                  data-testid={`die-tray-${die.id}`}
                  onClick={() => {
                    if (animPhase !== 'idle') return
                    playSound('dice_place')
                    if (isAssigned) {
                      const next = step(gameState, {
                        type: 'ASSIGN_DIE',
                        dieId: die.id,
                        slotId: null,
                      })
                      setGameState(next)
                      setSelectedDieId(die.id)
                    } else {
                      setSelectedDieId(die.id)
                    }
                    showQuickToast(
                      `🎲 ${eng.name} (出目${die.currentPip}): ${formatCompactEffect(die.currentEngravingId)}`
                    )
                  }}
                  className={`w-full rounded-xl border-2 p-1.5 text-center transition-all duration-150 cursor-pointer ${
                    isDiceRolling && !isLocked
                      ? 'rotate-12 scale-90 brightness-125'
                      : ''
                  } ${
                    isAssigned
                      ? 'bg-slate-950/60 border-slate-800 opacity-50 scale-95'
                      : isSelected
                        ? 'bg-indigo-950 border-amber-400 -translate-y-1 shadow-lg shadow-amber-400/20'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>#{die.id + 1}</span>
                    <span>{isAssigned ? '✓' : isLocked ? '🔒' : eng.icon}</span>
                  </div>
                  <div className="text-xl font-black text-white leading-tight my-0.5">
                    {die.currentPip}
                  </div>
                  <div className="text-xs font-bold text-amber-300 truncate">
                    {formatShortEngravingName(die.currentEngravingId)}
                  </div>
                </button>
                {!isAssigned && (
                  <button
                    type="button"
                    onClick={() => {
                      setLockDieIds((prev) =>
                        prev.includes(die.id)
                          ? prev.filter((id) => id !== die.id)
                          : [...prev, die.id]
                      )
                    }}
                    className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
                  >
                    {isLocked ? '🔒' : '🔓'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* アクションボタン群 */}
        <div className="grid grid-cols-5 gap-1">
          <button
            type="button"
            data-testid="dice-forge-reroll-btn"
            disabled={animPhase !== 'idle' || gameState.rerollsLeft <= 0}
            onClick={handleReroll}
            className="py-2 px-1 rounded-lg bg-sky-600 hover:bg-sky-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs cursor-pointer transition"
          >
            🔄振直({gameState.rerollsLeft})
          </button>
          <button
            type="button"
            data-testid="dice-forge-manipulate-btn"
            disabled={animPhase !== 'idle' || gameState.mana < 1}
            onClick={() => handleManipulateDie('plus1')}
            className="py-2 px-1 rounded-lg bg-violet-700 hover:bg-violet-600 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs cursor-pointer transition"
          >
            🔮+1
          </button>
          <button
            type="button"
            disabled={animPhase !== 'idle' || gameState.mana < 1}
            onClick={() => handleManipulateDie('flip')}
            className="py-2 px-1 rounded-lg bg-purple-700 hover:bg-purple-600 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs cursor-pointer transition"
          >
            🔮反転
          </button>
          <button
            type="button"
            data-testid="dice-forge-inspect-btn"
            onClick={() => {
              setInspectDieId(selectedDieId ?? 0)
              setShowDiceInspectModal(true)
            }}
            className="py-2 px-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs cursor-pointer"
          >
            ⚒️6面図
          </button>
          <button
            type="button"
            data-testid="dice-forge-auto-assign-btn"
            disabled={animPhase !== 'idle'}
            onClick={handleAutoAssignRemaining}
            className="py-2 px-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs cursor-pointer transition"
          >
            ✨自動
          </button>
        </div>

        <button
          type="button"
          data-testid="dice-forge-execute-turn"
          disabled={animPhase !== 'idle'}
          onClick={handleExecuteTurn}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:brightness-110 active:scale-98 disabled:opacity-60 text-slate-950 font-black text-sm shadow-md cursor-pointer transition"
        >
          ⚡ ターン実行（⚔️{preview.totalDamage} / 🛡️+{preview.totalShieldGain}）
        </button>
      </div>

      {/* ====================================================================
          モーダルA: ダイス6面「十字展開図（Cross Net View）」確認モーダル
         ==================================================================== */}
      {showDiceInspectModal && (
        <div
          data-testid="dice-forge-net-modal"
          className="absolute inset-0 z-40 bg-slate-950/95 flex flex-col justify-between p-3 text-slate-100"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-sm font-black text-amber-300">
              ⚒️ 6面十字展開図
            </h2>
            <button
              type="button"
              onClick={() => setShowDiceInspectModal(false)}
              className="px-3 py-1 rounded bg-slate-800 text-xs font-bold cursor-pointer"
            >
              閉じる
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 my-2">
            {gameState.dice.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setInspectDieId(d.id)}
                className={`py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  inspectDieId === d.id
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-900 text-slate-300 border-slate-800'
                }`}
              >
                #{d.id + 1}
              </button>
            ))}
          </div>

          {(() => {
            const targetDie = gameState.dice[inspectDieId] ?? gameState.dice[0]
            const renderFaceCell = (faceIdx: number) => {
              const f = targetDie.faces[faceIdx]
              const eng = ENGRAVINGS[f.engravingId]
              return (
                <div className="p-2 rounded-xl bg-slate-900 border border-amber-400/50 text-center">
                  <div className="text-xs text-slate-400 font-bold">
                    面{faceIdx + 1}
                  </div>
                  <div className="text-lg font-black text-white">
                    {eng.icon} {f.pip}
                  </div>
                  <div className="text-xs font-bold text-amber-300 truncate">
                    {formatShortEngravingName(f.engravingId)}
                  </div>
                </div>
              )
            }
            return (
              <div className="flex-1 flex flex-col justify-center space-y-2">
                <div className="grid grid-cols-4 gap-1.5 items-center">
                  <div />
                  {renderFaceCell(0)}
                  <div />
                  <div />
                  {renderFaceCell(1)}
                  {renderFaceCell(2)}
                  {renderFaceCell(3)}
                  {renderFaceCell(4)}
                  <div />
                  {renderFaceCell(5)}
                  <div />
                  <div />
                </div>
                <div className="space-y-1 bg-slate-900/80 border border-slate-800 rounded-xl p-2 max-h-40 overflow-y-auto">
                  {targetDie.faces.map((f) => {
                    const eng = ENGRAVINGS[f.engravingId]
                    return (
                      <div key={f.faceIndex} className="text-xs">
                        <span className="font-bold text-amber-300">
                          面{f.faceIndex + 1}【{eng.name}】:
                        </span>{' '}
                        <span className="text-slate-200">
                          {formatCompactEffect(f.engravingId)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ====================================================================
          モーダルB: フロア突破・6面鍛造報酬画面 (phase === 'reward')
         ==================================================================== */}
      {gameState.phase === 'reward' && gameState.rewardOffer && (
        <div
          data-testid="dice-forge-reward-modal"
          className="absolute inset-0 z-40 bg-slate-950/95 flex flex-col justify-between p-3 text-slate-100 overflow-y-auto"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-amber-300">
              ⚒️ Floor {gameState.floor} 突破！ダイス鍛造
            </h2>
            <span className="text-xs font-bold text-emerald-400">
              💰 {gameState.gold}G
            </span>
          </div>

          {/* 1. 彫り込む刻印の選択（3択・コンパクトタグ表示） */}
          <div className="space-y-1.5">
            {gameState.rewardOffer.engravings.map((engId) => {
              const eng = ENGRAVINGS[engId]
              const selected = rewardEngravingId === engId
              return (
                <button
                  key={engId}
                  type="button"
                  onClick={() => {
                    playSound('dice_place')
                    setRewardEngravingId(engId)
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border-2 text-xs transition cursor-pointer ${
                    selected
                      ? 'bg-indigo-950 border-amber-400 scale-[1.01]'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-base font-black text-amber-300">
                      {eng.icon}
                      {eng.pip}
                    </span>
                    <div className="text-left">
                      <div className="font-black text-white">{eng.name}</div>
                      <div className="text-amber-300 font-bold">
                        {formatCompactEffect(engId)}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                    出目{eng.pip}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 2. 彫り込むダイスと面の選択 */}
          <div className="space-y-1.5 bg-slate-900/80 border border-slate-800 rounded-xl p-2">
            <div className="grid grid-cols-4 gap-1">
              {gameState.dice.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setRewardTargetDieId(d.id)}
                  className={`py-1 rounded text-xs font-black cursor-pointer ${
                    rewardTargetDieId === d.id
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  🎲 #{d.id + 1}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {gameState.dice[rewardTargetDieId].faces.map((f) => {
                const eng = ENGRAVINGS[f.engravingId]
                const canForge =
                  !rewardEngravingId ||
                  canForgeEngravingOnDie(
                    gameState.dice[rewardTargetDieId],
                    rewardEngravingId,
                    f.faceIndex
                  )
                return (
                  <button
                    key={f.faceIndex}
                    type="button"
                    disabled={!canForge}
                    onClick={() => setRewardTargetFaceIdx(f.faceIndex)}
                    className={`p-1.5 rounded-lg border text-xs text-center cursor-pointer ${
                      rewardTargetFaceIdx === f.faceIndex
                        ? 'bg-amber-400/20 border-amber-400 text-white font-black'
                        : canForge
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950 border-rose-900 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-sm font-black">
                      {eng.icon} {f.pip}
                    </div>
                    <div className="truncate">
                      {formatShortEngravingName(f.engravingId)}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. レリック報酬 */}
          {gameState.rewardOffer.relics.length > 0 && (
            <div className="grid grid-cols-3 gap-1">
              {gameState.rewardOffer.relics.map((rId) => {
                const rel = RELICS[rId]
                const selected = rewardRelicId === rId
                return (
                  <button
                    key={rId}
                    type="button"
                    onClick={() => setRewardRelicId(rId)}
                    className={`p-1.5 rounded-lg border-2 text-xs text-left cursor-pointer ${
                      selected
                        ? 'bg-violet-950 border-amber-400'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="font-bold text-white truncate">
                      {rel.icon} {rel.name}
                    </div>
                    <div className="text-slate-300 line-clamp-2">
                      {rel.description}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* 4. 次フロアルート選択ボタン */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {gameState.rewardOffer.nextFloorChoices.map((nodeType) => (
              <button
                key={nodeType}
                type="button"
                data-testid={`next-floor-${nodeType}`}
                onClick={() => handleConfirmReward(nodeType)}
                className="py-3 px-3 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 font-black text-xs shadow-lg cursor-pointer"
              >
                {nodeType === 'elite'
                  ? '⚔️ 精鋭エリート戦へ'
                  : nodeType === 'altar'
                    ? '⛩️ 魔導祭壇へ'
                    : nodeType === 'shop'
                      ? '🏪 魔導商店へ'
                      : nodeType === 'boss'
                        ? '👑 エリアボス戦へ'
                        : '🏰 次のフロアへ'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ====================================================================
          モーダルC: 秘境の祭壇 (phase === 'altar')
         ==================================================================== */}
      {gameState.phase === 'altar' && (
        <div
          data-testid="dice-forge-altar-modal"
          className="absolute inset-0 z-40 bg-slate-950/95 flex flex-col justify-center gap-3 p-4 text-slate-100"
        >
          <div className="text-center space-y-1">
            <div className="text-4xl">⛩️</div>
            <h2 className="text-base font-black text-amber-300">
              Floor {gameState.floor}: 秘境の魔導祭壇
            </h2>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                playSound('forge_hammer')
                setGameState(
                  step(gameState, {
                    type: 'ALTAR_ACTION',
                    choice: 'upgrade_two_faces',
                    targetDieId: 0,
                  })
                )
              }}
              className="w-full p-3 rounded-xl bg-indigo-950 border-2 border-indigo-400 text-left text-xs cursor-pointer"
            >
              <div className="font-black text-white">
                ⚒️ 双刻印：ダイス#1の2面を上位刻印へ鍛造
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                playSound('magic_burst')
                setGameState(
                  step(gameState, {
                    type: 'ALTAR_ACTION',
                    choice: 'sacrifice_hp_for_relic',
                  })
                )
              }}
              className="w-full p-3 rounded-xl bg-violet-950 border-2 border-violet-400 text-left text-xs cursor-pointer"
            >
              <div className="font-black text-white">
                🩸 血の契約：HP-12 ➔ ランダム遺物を獲得
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                playSound('guard_shield')
                setGameState(
                  step(gameState, {
                    type: 'ALTAR_ACTION',
                    choice: 'heal_full',
                  })
                )
              }}
              className="w-full p-3 rounded-xl bg-emerald-950 border-2 border-emerald-400 text-left text-xs cursor-pointer"
            >
              <div className="font-black text-white">
                💚 聖泉：HPを最大値（{gameState.maxHp}）まで全回復
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ====================================================================
          モーダルD: 鍛冶屋＆魔導商店 (phase === 'shop')
         ==================================================================== */}
      {gameState.phase === 'shop' && gameState.rewardOffer && (
        <div
          data-testid="dice-forge-shop-modal"
          className="absolute inset-0 z-40 bg-slate-950/95 flex flex-col justify-between p-3 text-slate-100"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h2 className="text-base font-black text-amber-300">
                🏪 魔導商店 (F{gameState.floor})
              </h2>
              <div className="text-xs font-bold text-slate-300">
                💰 {gameState.gold}G / ❤️ {gameState.hp}/{gameState.maxHp}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                playSound('guard_shield')
                setGameState(step(gameState, { type: 'SHOP_BUY_HEAL' }))
              }}
              disabled={gameState.gold < 25 || gameState.hp >= gameState.maxHp}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 disabled:bg-slate-800 text-xs font-black text-white cursor-pointer"
            >
              💚 HP+22 (25G)
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 my-2">
            {gameState.rewardOffer.engravings.map((engId) => {
              const eng = ENGRAVINGS[engId]
              return (
                <div
                  key={engId}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-white">
                      {eng.icon} {eng.name} (出目{eng.pip})
                    </div>
                    <div className="text-amber-300 font-bold">
                      {formatCompactEffect(engId)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={gameState.gold < eng.cost}
                    onClick={() => {
                      playSound('forge_hammer')
                      setGameState(
                        step(gameState, {
                          type: 'SHOP_BUY_ENGRAVING',
                          engravingId: engId,
                          targetDieId: 0,
                          targetFaceIndex: 0,
                        })
                      )
                    }}
                    className="px-2.5 py-1.5 rounded bg-amber-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-black shrink-0 cursor-pointer"
                  >
                    💰{eng.cost}G
                  </button>
                </div>
              )
            })}

            {gameState.rewardOffer.relics.map((rId) => {
              const rel = RELICS[rId]
              const owned = gameState.relics.includes(rId)
              return (
                <div
                  key={rId}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-white">
                      {rel.icon} {rel.name}
                    </div>
                    <div className="text-slate-300">{rel.description}</div>
                  </div>
                  <button
                    type="button"
                    disabled={owned || gameState.gold < rel.cost}
                    onClick={() => {
                      playSound('forge_hammer')
                      setGameState(
                        step(gameState, {
                          type: 'SHOP_BUY_RELIC',
                          relicId: rId,
                          replaceRelicIndex: 0,
                        })
                      )
                    }}
                    className="px-2.5 py-1.5 rounded bg-violet-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-black shrink-0 cursor-pointer"
                  >
                    {owned ? '済' : `💰${rel.cost}G`}
                  </button>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              playSound('dice_place')
              setGameState(step(gameState, { type: 'LEAVE_SHOP' }))
            }}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm cursor-pointer"
          >
            👑 ボス決戦へ進む
          </button>
        </div>
      )}

      {/* ====================================================================
          モーダルE: 勝利 / 敗北 リザルト画面 (phase === 'victory' | 'gameover')
         ==================================================================== */}
      {(gameState.phase === 'victory' || gameState.phase === 'gameover') && (
        <div
          data-testid="dice-forge-result-overlay"
          className="absolute inset-0 z-50 bg-slate-950/95 flex flex-col justify-between p-4 text-slate-100"
        >
          <div className="text-center space-y-1">
            <div className="text-4xl">
              {gameState.phase === 'victory' ? '🏆' : '💀'}
            </div>
            <h2 className="text-lg font-black text-white">
              {gameState.phase === 'victory'
                ? '全12階層 完全制覇！！'
                : `Floor ${gameState.floor} 敗北…`}
            </h2>
          </div>

          <div className="bg-slate-900 border border-amber-400/50 rounded-2xl p-3 space-y-2 text-center">
            <div className="text-xs font-bold text-amber-300">FINAL SCORE</div>
            <div className="text-3xl font-black text-white">
              {finalScore.toLocaleString()} <span className="text-sm">pt</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs border-t border-slate-800 pt-2">
              <div>
                <div className="text-slate-400">到達</div>
                <div className="font-bold text-white">
                  F{gameState.floor}/12
                </div>
              </div>
              <div>
                <div className="text-slate-400">最大一撃</div>
                <div className="font-bold text-rose-400">
                  {gameState.stats.maxSingleTurnDamage}
                </div>
              </div>
              <div>
                <div className="text-slate-400">鍛造数</div>
                <div className="font-bold text-sky-300">
                  {gameState.stats.engravingsForged}面
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {gameState.relics.map((rId) => {
              const r = RELICS[rId]
              return (
                <span
                  key={rId}
                  className="px-2 py-0.5 rounded bg-slate-800 border border-amber-400/40 text-xs font-bold text-amber-200"
                >
                  {r.icon} {r.name}
                </span>
              )
            })}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              data-testid="dice-forge-retry-btn"
              onClick={() => handleStartNewRun(gameState.starterClass)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black text-sm shadow-lg cursor-pointer"
            >
              🔄 もう1回プレイ
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleShareX}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                𝕏 シェア
              </button>
              <button
                type="button"
                onClick={() => setInTitle(true)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
              >
                🏠 クラス選択
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
