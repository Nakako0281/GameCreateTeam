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

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  alpha: number
}

const SLOT_META: Record<
  SlotId,
  { label: string; short: string; icon: string; border: string; bg: string }
> = {
  strike_1: {
    label: '斬撃 I',
    short: '攻撃',
    icon: '⚔️',
    border: 'border-rose-500/60',
    bg: 'bg-rose-950/40',
  },
  strike_2: {
    label: '斬撃 II',
    short: '攻撃',
    icon: '⚔️',
    border: 'border-rose-500/60',
    bg: 'bg-rose-950/40',
  },
  guard_1: {
    label: '障壁',
    short: 'シールド',
    icon: '🛡️',
    border: 'border-sky-500/60',
    bg: 'bg-sky-950/40',
  },
  arcana_1: {
    label: '魔導炉',
    short: 'MP+魔撃',
    icon: '🔮',
    border: 'border-violet-500/60',
    bg: 'bg-violet-950/40',
  },
  alchemy_1: {
    label: '錬金釜',
    short: '毒+金+盾',
    icon: '⚗️',
    border: 'border-emerald-500/60',
    bg: 'bg-emerald-950/40',
  },
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
  const [selectedDieId, setSelectedDieId] = useState<number | null>(0)
  const [lockDieIds, setLockDieIds] = useState<number[]>([])
  const [infoText, setInfoText] = useState<string>(
    'ダイスをタップしてスロットへ配置しよう。同じ出目や連番で共鳴役倍率が発動！'
  )

  // モーダル状態（6面十字展開図 / 図鑑 / ボス予告）
  const [showDiceInspectModal, setShowDiceInspectModal] =
    useState<boolean>(false)
  const [inspectDieId, setInspectDieId] = useState<number>(0)
  const [showCompendium, setShowCompendium] = useState<boolean>(false)
  const [muted, setMuted] = useState<boolean>(() => getAudioMuted())

  // 報酬・鍛造選択用のローカルステート
  const [rewardEngravingId, setRewardEngravingId] =
    useState<EngravingId | null>(null)
  const [rewardTargetDieId, setRewardTargetDieId] = useState<number>(0)
  const [rewardTargetFaceIdx, setRewardTargetFaceIdx] = useState<number>(0)
  const [rewardRelicId, setRewardRelicId] = useState<RelicId | null>(null)

  // Canvas エフェクト用
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const [burstBanner, setBurstBanner] = useState<string | null>(null)

  const preview = useMemo(() => calculateTurnPreview(gameState), [gameState])

  // オートセーブ処理
  useEffect(() => {
    if (!inTitle) {
      saveActiveRun(gameState)
    }
  }, [gameState, inTitle])

  // 報酬フェーズ遷移時に初期選択をセット
  useEffect(() => {
    if (gameState.phase === 'reward' && gameState.rewardOffer) {
      setRewardEngravingId(gameState.rewardOffer.engravings[0] ?? null)
      setRewardRelicId(gameState.rewardOffer.relics[0] ?? null)
      // 素の面(base_)を自動選択
      outer: for (const d of gameState.dice) {
        for (const f of d.faces) {
          if (f.engravingId.startsWith('base_')) {
            setRewardTargetDieId(d.id)
            setRewardTargetFaceIdx(f.faceIndex)
            break outer
          }
        }
      }
    }
  }, [gameState.phase, gameState.rewardOffer, gameState.dice])

  // Canvas 2D パーティクル＆背景オーラ描画ループ
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
        h * 0.45,
        10,
        w * 0.5,
        h * 0.45,
        w * 0.55
      )
      if (gameState.area === 1) {
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.14)')
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)')
      } else if (gameState.area === 2) {
        grad.addColorStop(0, 'rgba(168, 85, 247, 0.16)')
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)')
      } else {
        grad.addColorStop(0, 'rgba(244, 63, 94, 0.18)')
        grad.addColorStop(1, 'rgba(15, 23, 42, 0)')
      }
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // パーティクル更新
      const list = particlesRef.current
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.12
        p.alpha -= 0.024
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

  const spawnParticles = (color: string, count = 24) => {
    const canvas = canvasRef.current
    const cx = canvas ? canvas.width * 0.5 : 180
    const cy = canvas ? canvas.height * 0.45 : 70
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
      const speed = 1.5 + Math.random() * 4.2
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: 2.5 + Math.random() * 3,
        color,
        alpha: 1,
      })
    }
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
    setInfoText(
      `Floor 1 開始！まずは下部トレイのダイスをタップし、中央の5スロットに配置しよう。`
    )
  }

  // セーブデータから再開
  const handleContinueRun = () => {
    if (!savedRun) return
    playSound('dice_place')
    setGameState(savedRun)
    setInTitle(false)
    setSelectedDieId(0)
  }

  // クイックおまかせ配置（片手プレイ補助：残りの未配置ダイスを空いているスロットへ自動配置）
  const handleAutoAssignRemaining = () => {
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
    setInfoText(
      `自動配置完了！共鳴役【${afterPrev.formation.name} (×${afterPrev.formation.totalMult.toFixed(2)})】➔ 予測 ${afterPrev.totalDamage} DMG / +${afterPrev.totalShieldGain} 🛡️`
    )
  }

  // スロットタップ時の配置・解除
  const handleSlotTap = (slotId: SlotId) => {
    const occupyingDieId = gameState.slots[slotId]
    if (selectedDieId !== null) {
      const selDie = gameState.dice.find((d) => d.id === selectedDieId)
      if (selDie && selDie.assignedSlot === slotId) {
        // 同じスロットを再タップでトレイへ戻す
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
      const next = step(gameState, {
        type: 'ASSIGN_DIE',
        dieId: selectedDieId,
        slotId,
      })
      setGameState(next)
      // 次の未配置ダイスを自動選択
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

  // リロール実行
  const handleReroll = () => {
    if (gameState.rerollsLeft <= 0) return
    playSound('dice_roll')
    spawnParticles('#38bdf8', 16)
    const next = step(gameState, {
      type: 'REROLL_DICE',
      lockDieIds,
    })
    setGameState(next)
    setInfoText(
      `ダイスをリロール！（残りリロール ${next.rerollsLeft}回）`
    )
  }

  // マナ介入（出目操作）
  const handleManipulateDie = (mode: 'plus1' | 'minus1' | 'flip') => {
    const targetId =
      selectedDieId ??
      gameState.dice.find((d) => d.assignedSlot === null)?.id ??
      0
    if (gameState.mana < 1) {
      setInfoText('⚠️ マナ(MP)が足りません！魔導スロット等でチャージしよう。')
      return
    }
    playSound('magic_burst')
    spawnParticles('#a855f7', 18)
    const next = step(gameState, {
      type: 'MANIPULATE_DIE',
      dieId: targetId,
      mode,
    })
    setGameState(next)
    const d = next.dice.find((x) => x.id === targetId)
    if (d) {
      setInfoText(
        `🔮 マナ介入発動！${d.name} の出目を【${d.currentPip}】に変換した！`
      )
    }
  }

  // ターン実行
  const handleExecuteTurn = () => {
    let current = gameState
    // もし1個も配置されていない場合は自動で配置してから実行する（誤タップ親切設計）
    const assignedCount = ALL_SLOT_IDS.filter(
      (s) => current.slots[s] !== null
    ).length
    if (assignedCount === 0) {
      for (let i = 0; i < current.dice.length; i++) {
        const slotOrder: SlotId[] = [
          'strike_1',
          'guard_1',
          'strike_2',
          'arcana_1',
        ]
        current = step(current, {
          type: 'ASSIGN_DIE',
          dieId: current.dice[i].id,
          slotId: slotOrder[i],
        })
      }
    }

    const turnPrev = calculateTurnPreview(current)
    if (turnPrev.finalMult >= 1.5) {
      playSound('combo_step', 3)
      setBurstBanner(
        `${turnPrev.formation.name} ×${turnPrev.finalMult.toFixed(2)} ➔ ${turnPrev.totalDamage} DMG!!`
      )
      setTimeout(() => setBurstBanner(null), 950)
    }
    if (turnPrev.totalDamage > 0) {
      playSound('attack_slash')
      spawnParticles('#f43f5e', 28)
    } else if (turnPrev.totalShieldGain > 0) {
      playSound('guard_shield')
      spawnParticles('#38bdf8', 20)
    }

    const next = step(current, { type: 'EXECUTE_TURN' })
    setGameState(next)
    setSelectedDieId(0)
    setLockDieIds([])

    if (next.phase === 'victory' || next.phase === 'gameover') {
      if (next.phase === 'victory') {
        playSound('victory')
      }
      const cleared = next.phase === 'victory'
      const floorsCleared = cleared ? 12 : Math.max(0, next.floor - 1)
      const calcScore =
        floorsCleared * 1000 +
        Math.round(next.stats.totalDamageDealt * 1.2) +
        next.stats.maxSingleTurnDamage * 4 +
        (cleared ? 3500 + next.hp * 25 : 0)
      const updatedProf = recordRunCompletion(next, calcScore)
      setProfile(updatedProf)
      setSavedRun(null)
    } else if (next.phase === 'reward') {
      playSound('victory')
      setInfoText('✨ 戦闘勝利！ダイス面に彫り込む魔導刻印と次ルートを選ぼう。')
    } else {
      setInfoText(
        `Turn ${next.turn}: 敵の予告「${next.enemy.currentIntent.label}」に備えてダイスを配置しよう。`
      )
    }
  }

  // 報酬確定＆次フロアへ
  const handleConfirmReward = (
    nextNode: 'elite' | 'altar' | 'shop' | 'normal' | 'boss'
  ) => {
    playSound('forge_hammer')
    const next = step(gameState, {
      type: 'CHOOSE_REWARD',
      engravingId: rewardEngravingId ?? undefined,
      targetDieId: rewardTargetDieId,
      targetFaceIndex: rewardTargetFaceIdx,
      relicId: rewardRelicId ?? undefined,
      replaceRelicIndex: 0,
      nextNodeType: nextNode,
    })
    setGameState(next)
    setSelectedDieId(0)
  }

  const toggleMute = () => {
    const nextMute = !muted
    setMuted(nextMute)
    setAudioMuted(nextMute)
  }

  const handleShareX = () => {
    const statusText =
      gameState.phase === 'victory'
        ? `🏆全12フロア完全制覇！(Ascension ${gameState.ascension})`
        : `💀Floor ${gameState.floor} で散る…`
    const clsName = STARTER_CLASSES[gameState.starterClass].name
    const text = `🎲『ダイス・フォージ・ダンジョン』\nクラス：${clsName}\n結果：${statusText}\nスコア：${finalScore.toLocaleString()} pt（最大一撃 ${gameState.stats.maxSingleTurnDamage} DMG / 鍛造 ${gameState.stats.engravingsForged}面）\n#AIゲームラボ #DiceForgeDungeon`
    const url = window.location.href
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  // ==========================================================================
  // 1. タイトル ＆ クラス選択 ＆ 続きから再開画面
  // ==========================================================================
  if (inTitle) {
    return (
      <div
        data-testid="dice-forge-title-screen"
        className="relative h-full w-full flex flex-col justify-between bg-slate-950 text-slate-100 px-3 py-2.5 overflow-hidden select-none"
      >
        {/* ヘッダー＆タイトル */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold">
            <span>🎲 タクティカル6面鍛造×乗算ローグライト</span>
          </div>
          <h1 className="text-lg font-black tracking-tight text-white">
            ダイス・フォージ・ダンジョン
          </h1>
          <p className="text-xs text-slate-300 leading-snug">
            ダイス24面を彫り直し、共鳴役とレリック乗算で運命の12階層を突破せよ
          </p>
        </div>

        {/* オートセーブ再開ボタン（存在する場合） */}
        {savedRun && (
          <div className="bg-emerald-950/60 border border-emerald-400/50 rounded-xl p-2.5 flex items-center justify-between gap-2">
            <div className="text-xs">
              <div className="font-bold text-emerald-300">
                💾 中断セーブデータあり (Floor {savedRun.floor}/12)
              </div>
              <div className="text-slate-300">
                {STARTER_CLASSES[savedRun.starterClass].name} | ❤️{' '}
                {savedRun.hp}/{savedRun.maxHp} | 💰 {savedRun.gold}G
              </div>
            </div>
            <button
              type="button"
              data-testid="dice-forge-continue-btn"
              onClick={handleContinueRun}
              className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0 shadow cursor-pointer"
            >
              続きから再開
            </button>
          </div>
        )}

        {/* スタータークラス3種選択 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>⚔️ 初期クラス・ダイス編成を選択</span>
            <span>ハイスコア: {profile.highScore.toLocaleString()}</span>
          </div>
          <div className="space-y-1.5">
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
                  className={`w-full text-left p-2 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/80 border-amber-400 shadow-md'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-white">
                      {cls.icon} {cls.name}{' '}
                      <span className="text-xs font-bold text-amber-300">
                        （{cls.subtitle}）
                      </span>
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                      ❤️{cls.maxHp} 💰{cls.startingGold}G
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                    {cls.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* 昇天難度（Ascension）＆ 図鑑ボタン */}
        <div className="flex items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-300">🔥 塔難度:</span>
            {[0, 1, 2, 3].map((lv) => {
              const unlocked = lv <= profile.unlockedAscension
              return (
                <button
                  key={lv}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => setSelectedAscension(lv)}
                  className={`px-2 py-0.5 rounded font-bold text-xs cursor-pointer ${
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
            onClick={() => setShowCompendium(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 cursor-pointer"
          >
            📖 図鑑 ({profile.discoveredEngravings.length}/
            {Object.keys(ENGRAVINGS).length})
          </button>
        </div>

        {/* 出撃ボタン */}
        <button
          type="button"
          data-testid="dice-forge-start-btn"
          onClick={() => handleStartNewRun(selectedClass)}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 text-slate-950 font-black text-base shadow-lg cursor-pointer"
        >
          🎲 運命の塔へ出撃する（新規ラン開始）
        </button>

        {/* 図鑑モーダル */}
        {showCompendium && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 flex flex-col justify-between p-3 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h2 className="text-sm font-black text-amber-300">
                📖 魔導刻印＆レリック図鑑（戦績: {profile.totalClears}勝 /{' '}
                {profile.totalRuns}戦）
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
              <div className="text-xs font-bold text-sky-300">
                ⚒️ 魔導刻印一覧 ({profile.discoveredEngravings.length}/
                {Object.keys(ENGRAVINGS).length})
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(ENGRAVINGS).map((e) => (
                  <div
                    key={e.id}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="font-bold text-white">
                      {e.icon} {e.name} (出目{e.pip})
                    </div>
                    <div className="text-slate-300">{e.description}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs font-bold text-violet-300 pt-2">
                👑 レリック一覧 ({profile.discoveredRelics.length}/
                {Object.keys(RELICS).length})
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(RELICS).map((r) => (
                  <div
                    key={r.id}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="font-bold text-white">
                      {r.icon} {r.name}
                    </div>
                    <div className="text-slate-300">{r.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ==========================================================================
  // 2. メインゲーム画面（バトル / 鍛造報酬 / 祭壇 / ショップ / リザルト）
  // ==========================================================================
  return (
    <div className="relative h-full w-full flex flex-col justify-between bg-slate-950 text-slate-100 px-2.5 py-1.5 overflow-hidden select-none">
      {/* ① トップステータスバー */}
      <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1.5 shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/40 text-indigo-200">
            🏰 F{gameState.floor}/12
          </span>
          <span className="text-rose-400">
            ❤️ {gameState.hp}/{gameState.maxHp}
          </span>
          <span className="text-sky-300">🛡️ {gameState.shield}</span>
          <span className="text-violet-300">
            🔮 MP {gameState.mana}/{gameState.maxMana}
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

      {/* ② レリックバー（最大5枠）＋ エリアボス予告 */}
      <div className="flex items-center justify-between gap-1.5 bg-slate-900/60 border border-slate-800/80 rounded-lg px-2 py-1 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold text-slate-400">遺物:</span>
          {[0, 1, 2, 3, 4].map((idx) => {
            const rId = gameState.relics[idx]
            const rel = rId ? RELICS[rId] : null
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (rel) {
                    setInfoText(`👑【${rel.name}】${rel.description}`)
                  }
                }}
                className={`w-7 h-7 rounded-md border flex items-center justify-center text-sm cursor-pointer ${
                  rel
                    ? 'bg-slate-800 border-amber-400/50'
                    : 'bg-slate-900/50 border-slate-800 text-slate-600'
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
            setInfoText(
              `⚠️ エリア${gameState.area}ボス予告: ${gameState.upcomingBoss.name} ── 【${gameState.upcomingBoss.traitName}】${gameState.upcomingBoss.traitDescription}`
            )
          }
          className="px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs font-bold truncate cursor-pointer"
        >
          {gameState.upcomingBoss.icon} ボス予告:{' '}
          {gameState.upcomingBoss.traitName}
        </button>
      </div>

      {/* ③ バトルアリーナ（Canvas + 敵情報 + リアルタイムシナジー予測） */}
      <div className="relative flex-1 min-h-0 flex flex-col justify-between bg-slate-900/75 border border-slate-800 rounded-xl p-2 my-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="dice-forge-canvas"
          width={380}
          height={180}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* 敵情報カード */}
        <div className="relative z-10 flex items-center justify-between gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl shrink-0">
              {gameState.enemy.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-white truncate">
                  {gameState.enemy.name}
                </span>
                {gameState.enemy.trait !== 'none' && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-bold shrink-0">
                    {gameState.enemy.traitName}
                  </span>
                )}
              </div>
              {/* 敵HPバー */}
              <div className="flex items-center gap-2 text-xs font-bold mt-0.5">
                <span className="text-rose-400">
                  HP {gameState.enemy.hp}/{gameState.enemy.maxHp}
                </span>
                {gameState.enemy.shield > 0 && (
                  <span className="text-sky-300">
                    🛡️{gameState.enemy.shield}
                  </span>
                )}
                {gameState.enemy.poison > 0 && (
                  <span className="text-emerald-400">
                    ☣️毒{gameState.enemy.poison}
                  </span>
                )}
                {gameState.enemy.thorns > 0 && (
                  <span className="text-amber-300">
                    🌵棘{gameState.enemy.thorns}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 敵の次ターン確定行動予告 */}
          <div className="bg-rose-950/80 border border-rose-500/50 rounded-lg px-2 py-1 text-right shrink-0">
            <div className="text-xs font-bold text-rose-300">⚠️ 次ターン予告</div>
            <div className="text-xs font-black text-white">
              {gameState.enemy.currentIntent.label}
            </div>
          </div>
        </div>

        {/* 中央モンスタービジュアル＆HPゲージ＆乗算リレー表示 */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto py-1">
          <div className="relative w-16 h-16 rounded-2xl bg-slate-950/85 border-2 border-indigo-400/50 shadow-lg flex items-center justify-center text-4xl">
            {gameState.enemy.icon}
            <span className="absolute -bottom-2 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-xs font-black text-amber-300">
              Turn {gameState.turn}
            </span>
          </div>
          <div className="w-48 h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden mt-2.5">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all duration-300"
              style={{
                width: `${Math.max(0, Math.min(100, (gameState.enemy.hp / gameState.enemy.maxHp) * 100))}%`,
              }}
            />
          </div>
          {burstBanner && (
            <div className="mt-1 px-3 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-xs shadow-lg animate-bounce">
              💥 {burstBanner}
            </div>
          )}
        </div>

        {/* リアルタイム結果プレビュー＆共鳴役計算バー */}
        <div
          data-testid="dice-forge-preview-bar"
          className="relative z-10 bg-slate-950/90 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 space-y-1"
        >
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-black">
              <span className="text-amber-300">
                ✨ 共鳴役: {preview.formation.name} (×
                {preview.formation.totalMult.toFixed(2)})
              </span>
              {preview.relicMult > 1 && (
                <span className="text-violet-300">
                  × 遺物{preview.relicMult.toFixed(2)}
                </span>
              )}
            </div>
            <span className="font-black text-white">
              総倍率 ×{preview.finalMult.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs font-bold border-t border-slate-800/80 pt-1">
            <span className="text-rose-300">
              ⚔️ 予測与ダメ: {preview.totalDamage}
              {preview.totalPoisonApplied > 0
                ? ` (+毒${preview.totalPoisonApplied})`
                : ''}
            </span>
            <span className="text-sky-300">
              🛡️ 獲得盾: +{preview.totalShieldGain}
            </span>
            <span
              className={
                preview.expectedIncomingDamage > 0
                  ? 'text-amber-300'
                  : 'text-emerald-300'
              }
            >
              ターン後HP: {preview.expectedHpAfterTurn}/{gameState.maxHp}
            </span>
          </div>
        </div>

        {/* 1行インフォバー（最小12px厳守） */}
        <div className="relative z-10 bg-slate-950/75 rounded px-2 py-1 text-xs text-slate-200 truncate">
          💡 {infoText}
        </div>
      </div>

      {/* ④ タクティカル・スロット（5枠横並び） */}
      <div className="grid grid-cols-5 gap-1.5 my-1 shrink-0">
        {ALL_SLOT_IDS.map((slotId) => {
          const meta = SLOT_META[slotId]
          const assignedDieId = gameState.slots[slotId]
          const die =
            assignedDieId !== null
              ? gameState.dice.find((d) => d.id === assignedDieId)
              : null
          const eng = die ? ENGRAVINGS[die.currentEngravingId] : null

          return (
            <button
              key={slotId}
              type="button"
              data-testid={`slot-${slotId}`}
              onClick={() => handleSlotTap(slotId)}
              className={`h-20 rounded-xl border p-1 flex flex-col items-center justify-between transition cursor-pointer ${meta.border} ${meta.bg} ${
                selectedDieId !== null && !die
                  ? 'ring-1 ring-amber-400/70'
                  : ''
              }`}
            >
              <div className="text-xs font-bold text-slate-200 truncate w-full text-center">
                {meta.icon}
                {meta.label}
              </div>
              {die && eng ? (
                <div className="w-full rounded-lg bg-slate-900/95 border border-amber-400/80 py-1 px-1 text-center">
                  <div className="text-sm font-black text-amber-300 leading-none">
                    {eng.icon} {die.currentPip}
                  </div>
                  <div className="text-xs font-bold text-slate-200 truncate mt-0.5">
                    {eng.name.replace(/の\d$/, '')}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-bold py-2">
                  {meta.short}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ⑤ ダイストレイ（4個）＆ 操作コントロールバー */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-2 space-y-1.5 shrink-0">
        {/* ダイス4個一覧 */}
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
                    playSound('dice_place')
                    if (isAssigned) {
                      // 配置済みの場合はトレイに戻して選択
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
                    setInfoText(
                      `🎲【${eng.name} (出目${die.currentPip})】${eng.description}`
                    )
                  }}
                  className={`w-full rounded-xl border p-1.5 text-center transition cursor-pointer ${
                    isAssigned
                      ? 'bg-slate-950/60 border-slate-800 opacity-55'
                      : isSelected
                        ? 'bg-indigo-950 border-amber-400 ring-2 ring-amber-400/50'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>#{die.id + 1}</span>
                    <span>
                      {isAssigned
                        ? '配置済'
                        : isLocked
                          ? '🔒固定'
                          : `出目${die.currentPip}`}
                    </span>
                  </div>
                  <div className="text-base font-black text-white my-0.5">
                    {eng.icon} {die.currentPip}
                  </div>
                  <div className="text-xs font-bold text-amber-300 truncate">
                    {eng.name}
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
            disabled={gameState.rerollsLeft <= 0}
            onClick={handleReroll}
            className="py-2 px-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs cursor-pointer"
          >
            🔄振直({gameState.rerollsLeft})
          </button>
          <button
            type="button"
            data-testid="dice-forge-manipulate-btn"
            disabled={gameState.mana < 1}
            onClick={() => handleManipulateDie('plus1')}
            className="py-2 px-1 rounded-lg bg-violet-700 hover:bg-violet-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs cursor-pointer"
          >
            🔮出目+1
          </button>
          <button
            type="button"
            disabled={gameState.mana < 1}
            onClick={() => handleManipulateDie('flip')}
            className="py-2 px-1 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs cursor-pointer"
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
            onClick={handleAutoAssignRemaining}
            className="py-2 px-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs cursor-pointer"
          >
            ✨自動配置
          </button>
        </div>

        <button
          type="button"
          data-testid="dice-forge-execute-turn"
          onClick={handleExecuteTurn}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-md cursor-pointer"
        >
          ⚡ ターン実行（予測 {preview.totalDamage} DMG / +{preview.totalShieldGain} 🛡️）
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
              ⚒️ 魔導ダイス 6面十字展開図（Cross Net View）
            </h2>
            <button
              type="button"
              onClick={() => setShowDiceInspectModal(false)}
              className="px-3 py-1 rounded bg-slate-800 text-xs font-bold cursor-pointer"
            >
              閉じる
            </button>
          </div>

          {/* ダイス切り替えタブ */}
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
                #{d.id + 1} {d.name.slice(0, 3)}
              </button>
            ))}
          </div>

          {/* 十字展開図 (4列×3行グリッドで6面を展開) */}
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
                  <div className="text-base font-black text-white">
                    {eng.icon} {f.pip}
                  </div>
                  <div className="text-xs font-bold text-amber-300 truncate">
                    {eng.name}
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
                <div className="space-y-1 bg-slate-900/80 border border-slate-800 rounded-xl p-2 max-h-48 overflow-y-auto">
                  {targetDie.faces.map((f) => {
                    const eng = ENGRAVINGS[f.engravingId]
                    return (
                      <div key={f.faceIndex} className="text-xs">
                        <span className="font-bold text-amber-300">
                          面{f.faceIndex + 1}【{eng.name}】:
                        </span>{' '}
                        <span className="text-slate-200">
                          {eng.description}
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
          モーダルB: フロア突破・6面十字鍛造報酬画面 (phase === 'reward')
         ==================================================================== */}
      {gameState.phase === 'reward' && gameState.rewardOffer && (
        <div
          data-testid="dice-forge-reward-modal"
          className="absolute inset-0 z-40 bg-slate-950/95 flex flex-col justify-between p-3 text-slate-100 overflow-y-auto"
        >
          <div>
            <div className="text-xs font-bold text-emerald-400">
              ✨ Floor {gameState.floor} 突破報酬！
            </div>
            <h2 className="text-base font-black text-white">
              ⚒️ 魔導鍛造工房：新しい刻印をダイス面に彫り込もう
            </h2>
          </div>

          {/* 1. 彫り込む刻印の選択 (3択) */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-amber-300">
              ① 獲得する魔導刻印を選択（3択）
            </div>
            <div className="space-y-1">
              {gameState.rewardOffer.engravings.map((engId) => {
                const eng = ENGRAVINGS[engId]
                const selected = rewardEngravingId === engId
                return (
                  <button
                    key={engId}
                    type="button"
                    onClick={() => setRewardEngravingId(engId)}
                    className={`w-full text-left p-2 rounded-xl border text-xs transition cursor-pointer ${
                      selected
                        ? 'bg-indigo-950 border-amber-400'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="font-black text-white">
                      {eng.icon} 【{eng.name}】（出目 {eng.pip} /{' '}
                      {eng.archetype.toUpperCase()}）
                    </div>
                    <div className="text-slate-300">{eng.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. 彫り込むダイスと面の選択（6面展開プレビュー） */}
          <div className="space-y-1 bg-slate-900/80 border border-slate-800 rounded-xl p-2">
            <div className="text-xs font-bold text-sky-300">
              ② 彫り直すダイスと面を選択（同一特殊刻印は1ダイス2面まで）
            </div>
            <div className="grid grid-cols-4 gap-1">
              {gameState.dice.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setRewardTargetDieId(d.id)}
                  className={`py-1 rounded text-xs font-bold cursor-pointer ${
                    rewardTargetDieId === d.id
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  #{d.id + 1}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1">
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
                        ? 'bg-amber-400/20 border-amber-400 text-white font-bold'
                        : canForge
                          ? 'bg-slate-950 border-slate-800 text-slate-300'
                          : 'bg-slate-950 border-rose-900 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      面{f.faceIndex + 1}: {eng.icon}
                      {f.pip}
                    </div>
                    <div className="truncate">{eng.name}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. レリック報酬（存在する場合） */}
          {gameState.rewardOffer.relics.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-violet-300">
                ③ ボーナス遺物（レリック）を1つ獲得
              </div>
              <div className="grid grid-cols-3 gap-1">
                {gameState.rewardOffer.relics.map((rId) => {
                  const rel = RELICS[rId]
                  const selected = rewardRelicId === rId
                  return (
                    <button
                      key={rId}
                      type="button"
                      onClick={() => setRewardRelicId(rId)}
                      className={`p-1.5 rounded-lg border text-xs text-left cursor-pointer ${
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
            </div>
          )}

          {/* 4. 次フロアルート選択ボタン */}
          <div className="space-y-1 pt-1">
            <div className="text-xs font-bold text-emerald-300">
              ④ 鍛造を確定して次のフロアへ進む
            </div>
            <div className="grid grid-cols-2 gap-2">
              {gameState.rewardOffer.nextFloorChoices.map((nodeType) => (
                <button
                  key={nodeType}
                  type="button"
                  data-testid={`next-floor-${nodeType}`}
                  onClick={() => handleConfirmReward(nodeType)}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow cursor-pointer"
                >
                  {nodeType === 'elite'
                    ? '⚔️ 精鋭エリート戦へ'
                    : nodeType === 'altar'
                      ? '⛩️ 秘境の魔導祭壇へ'
                      : nodeType === 'shop'
                        ? '🏪 鍛冶屋＆魔導商店へ'
                        : nodeType === 'boss'
                          ? '👑 エリアボス決戦へ'
                          : '🏰 次のフロアへ進む'}
                </button>
              ))}
            </div>
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
            <div className="text-3xl">⛩️</div>
            <h2 className="text-base font-black text-amber-300">
              Floor {gameState.floor}: 秘境の魔導祭壇
            </h2>
            <p className="text-xs text-slate-300">
              古代の魔力が脈動している。1つの祝福を選択しよう。
            </p>
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
              className="w-full p-3 rounded-xl bg-indigo-950 border border-indigo-400 text-left text-xs cursor-pointer"
            >
              <div className="font-black text-white">
                ⚒️ 魔導双刻印：ダイス#1の2面を上位刻印へ一括鍛造する
              </div>
              <div className="text-slate-300">
                クラスの主力刻印を一気に2面彫り込む。
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
              className="w-full p-3 rounded-xl bg-violet-950 border border-violet-400 text-left text-xs cursor-pointer"
            >
              <div className="font-black text-white">
                🩸 血の契約：HPを12捧げ、ランダムな遺物（レリック）を獲得
              </div>
              <div className="text-slate-300">
                現在HP {gameState.hp} ➔ {Math.max(10, gameState.hp - 12)}
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
              className="w-full p-3 rounded-xl bg-emerald-950 border border-emerald-400 text-left text-xs cursor-pointer"
            >
              <div className="font-black text-white">
                💚 聖泉の休息：HPを最大値（{gameState.maxHp}）まで完全回復する
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
                🏪 鍛冶屋 ＆ 魔導商店 (Floor {gameState.floor})
              </h2>
              <div className="text-xs text-slate-300">
                所持金: 💰 {gameState.gold}G / ❤️ HP {gameState.hp}/
                {gameState.maxHp}
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
              💚 回復+22 (25G)
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 my-2">
            <div className="text-xs font-bold text-sky-300">
              ⚒️ 刻印の購入（購入するとダイスの素の面へ自動鍛造）
            </div>
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
                    <div className="text-slate-300">{eng.description}</div>
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

            <div className="text-xs font-bold text-violet-300 pt-1">
              👑 レリックの購入
            </div>
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
                    {owned ? '所持済' : `💰${rel.cost}G`}
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
            🏰 商店を出て次のフロア（ボス戦）へ進む
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
            <div className="text-3xl">
              {gameState.phase === 'victory' ? '🏆' : '💀'}
            </div>
            <h2 className="text-lg font-black text-white">
              {gameState.phase === 'victory'
                ? '運命の塔・全12階層 完全制覇！！'
                : `Floor ${gameState.floor} にて力尽きた…`}
            </h2>
            <p className="text-xs text-slate-300">
              {gameState.phase === 'victory'
                ? '鍛え上げた魔導ダイスと遺物のシナジーで最終ボス・クロノスを打ち破った！'
                : `敗因ヒント：敵の予告「${gameState.enemy.currentIntent.label}」に対し、障壁スロットと共鳴役倍率を組み合わせよう。`}
            </p>
          </div>

          {/* スコア＆統計カード */}
          <div className="bg-slate-900 border border-amber-400/50 rounded-2xl p-3 space-y-2 text-center">
            <div className="text-xs font-bold text-amber-300">
              FINAL RUN SCORE
            </div>
            <div className="text-3xl font-black text-white">
              {finalScore.toLocaleString()} <span className="text-sm">pt</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs border-t border-slate-800 pt-2">
              <div>
                <div className="text-slate-400">到達階層</div>
                <div className="font-bold text-white">
                  Floor {gameState.floor}/12
                </div>
              </div>
              <div>
                <div className="text-slate-400">最大1ターン火力</div>
                <div className="font-bold text-rose-400">
                  {gameState.stats.maxSingleTurnDamage} DMG
                </div>
              </div>
              <div>
                <div className="text-slate-400">鍛造した面数</div>
                <div className="font-bold text-sky-300">
                  {gameState.stats.engravingsForged} 面
                </div>
              </div>
            </div>
          </div>

          {/* 最終ビルド（所持レリック一覧） */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 space-y-1">
            <div className="text-xs font-bold text-slate-300">
              👑 構築したレリック＆ダイス編成
            </div>
            <div className="flex flex-wrap gap-1.5">
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
          </div>

          {/* リトライ＆シェアボタン */}
          <div className="space-y-2">
            <button
              type="button"
              data-testid="dice-forge-retry-btn"
              onClick={() => handleStartNewRun(gameState.starterClass)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black text-sm shadow-lg cursor-pointer"
            >
              🔄 もう1回プレイ（別ビルドで再挑戦）
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleShareX}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                𝕏 で結果をシェア
              </button>
              <button
                type="button"
                onClick={() => setInTitle(true)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
              >
                🏠 クラス選択へ戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
