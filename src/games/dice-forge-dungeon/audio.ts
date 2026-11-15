/**
 * ダイス・フォージ・ダンジョン サウンドエンジン (`audio.ts`)
 *
 * 1. `public/assets/games/dice-forge-dungeon/audio/` に配置された無料フリー効果音（.mp3）があればそれを優先再生します。
 * 2. コンボ連鎖音（`se_combo_step.mp3`）などでは `playbackRate` でピッチを段階的に引き上げます。
 * 3. 素材ファイルがまだ配置されていない場合でも、エラーを出さずに Web Audio API のシンセ音へ自動フォールバックします。
 * 4. E2Eテスト検証用に `window.__diceForgeDungeonAudioCount` をカウントアップします。
 */

declare global {
  interface Window {
    __diceForgeDungeonAudioCount?: number
  }
}

export type SoundEffectKey =
  | 'dice_roll'
  | 'dice_place'
  | 'combo_step'
  | 'attack_slash'
  | 'guard_shield'
  | 'magic_burst'
  | 'forge_hammer'
  | 'victory'

const ASSET_BASE = `${import.meta.env.BASE_URL || '/'}assets/games/dice-forge-dungeon/audio`

const SOUND_FILE_MAP: Record<SoundEffectKey, string> = {
  dice_roll: `${ASSET_BASE}/se_dice_roll.mp3`,
  dice_place: `${ASSET_BASE}/se_dice_place.mp3`,
  combo_step: `${ASSET_BASE}/se_combo_step.mp3`,
  attack_slash: `${ASSET_BASE}/se_attack_slash.mp3`,
  guard_shield: `${ASSET_BASE}/se_guard_shield.mp3`,
  magic_burst: `${ASSET_BASE}/se_magic_burst.mp3`,
  forge_hammer: `${ASSET_BASE}/se_forge_hammer.mp3`,
  victory: `${ASSET_BASE}/se_victory.mp3`,
}

let audioCtx: AudioContext | null = null
let isMuted = false
const decodedBufferCache = new Map<SoundEffectKey, AudioBuffer | 'missing'>()
const loadingPromises = new Map<SoundEffectKey, Promise<void>>()

function incrementAudioTrigger(): void {
  if (typeof window !== 'undefined') {
    window.__diceForgeDungeonAudioCount =
      (window.__diceForgeDungeonAudioCount ?? 0) + 1
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (Ctx) {
      audioCtx = new Ctx()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

async function tryLoadBuffer(
  ctx: AudioContext,
  key: SoundEffectKey
): Promise<void> {
  if (decodedBufferCache.has(key) || loadingPromises.has(key)) return
  const p = (async () => {
    try {
      const res = await fetch(SOUND_FILE_MAP[key])
      if (!res.ok) {
        decodedBufferCache.set(key, 'missing')
        return
      }
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('text/html')) {
        decodedBufferCache.set(key, 'missing')
        return
      }
      const arr = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(arr)
      decodedBufferCache.set(key, buf)
    } catch {
      decodedBufferCache.set(key, 'missing')
    }
  })()
  loadingPromises.set(key, p)
  await p
}

function playFallbackSynth(
  ctx: AudioContext,
  key: SoundEffectKey,
  stepIndex = 0
): void {
  const now = ctx.currentTime

  switch (key) {
    case 'dice_place': {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320, now)
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.045)
      gain.gain.setValueAtTime(0.14, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.055)
      break
    }

    case 'dice_roll': {
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.055
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(260 + i * 95, t)
        osc.frequency.exponentialRampToValueAtTime(480 + i * 70, t + 0.04)
        gain.gain.setValueAtTime(0.11, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.05)
      }
      break
    }

    case 'combo_step': {
      const freq = 330 * Math.pow(2, (stepIndex * 2) / 12)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.09)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.11)
      break
    }

    case 'attack_slash': {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, now)
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.12)
      gain.gain.setValueAtTime(0.16, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.14)
      break
    }

    case 'guard_shield': {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(280, now)
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.1)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.13)
      break
    }

    case 'magic_burst': {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.14)
      gain.gain.setValueAtTime(0.14, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.16)
      break
    }

    case 'forge_hammer': {
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, idx) => {
        const t = now + idx * 0.055
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(f, t)
        gain.gain.setValueAtTime(0.13, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.13)
      })
      break
    }

    case 'victory': {
      const fanfare = [523.25, 659.25, 783.99, 1046.5]
      fanfare.forEach((f, idx) => {
        const t = now + idx * 0.08
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(f, t)
        gain.gain.setValueAtTime(0.16, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.22)
      })
      break
    }
  }
}

export function playSound(key: SoundEffectKey, stepIndex = 0): void {
  incrementAudioTrigger()
  if (isMuted) return
  const ctx = getAudioContext()
  if (!ctx) return

  const cached = decodedBufferCache.get(key)
  if (cached && cached !== 'missing') {
    const source = ctx.createBufferSource()
    source.buffer = cached
    if (key === 'combo_step' && stepIndex > 0) {
      source.playbackRate.value = Math.min(2.0, 1 + stepIndex * 0.1)
    }
    const gain = ctx.createGain()
    gain.gain.value = 0.45
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start(0)
    return
  }

  if (!cached) {
    void tryLoadBuffer(ctx, key)
  }
  playFallbackSynth(ctx, key, stepIndex)
}

export function setAudioMuted(muted: boolean): void {
  isMuted = muted
}

export function getAudioMuted(): boolean {
  return isMuted
}
