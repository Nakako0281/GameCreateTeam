/**
 * Web Audio API シンセ効果音モジュール (外部音声ファイル不要・ゼロ遅延合成)
 */

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext
  __sliceAudioTriggerCount?: number
}

let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const win = window as WindowWithWebkitAudio
  const AudioCtx = window.AudioContext ?? win.webkitAudioContext
  if (!AudioCtx) return null

  if (!sharedCtx) {
    sharedCtx = new AudioCtx()
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {})
  }
  win.__sliceAudioTriggerCount = (win.__sliceAudioTriggerCount ?? 0) + 1
  return sharedCtx
}

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * durationSec))
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/**
 * 狙い定め（ドラッグ中）のレーザー共鳴・コア警告音
 */
export function playAimTickSound(
  angleNorm: number,
  hitGold: boolean,
  hitIron: boolean
): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  if (hitIron) {
    // 鉄芯（💀）重なり時：危険な低音スパーク警告音「ジジジッ！」
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(105, now)
    osc.frequency.linearRampToValueAtTime(72, now + 0.06)
    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065)
  } else if (hitGold) {
    // 黄金コア（✨）ロックオン時：きらめく高域倍音「キラーン♪」
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1180, now)
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.07)
    gain.gain.setValueAtTime(0.07, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075)
  } else {
    // 通常レーザー牽引音
    osc.type = 'sine'
    const freq = 260 + Math.abs(angleNorm) * 320
    osc.frequency.setValueAtTime(freq, now)
    gain.gain.setValueAtTime(0.03, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
  }

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.08)
}

/**
 * 一閃リリース時の居合斬撃音「シュパァッ！」＋断面開口音
 */
export function playSlashAndOpenSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // 1. 居合の風切り音（バンドパスフィルタを通したホワイトノイズ急降下）
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 0.14)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.setValueAtTime(3.2, now)
  filter.frequency.setValueAtTime(3400, now)
  filter.frequency.exponentialRampToValueAtTime(320, now + 0.12)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.26, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13)

  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(now)
  noise.stop(now + 0.14)

  // 2. 刀身の金属閃光トーン「シャキィィン！」
  const bladeOsc = ctx.createOscillator()
  const bladeGain = ctx.createGain()
  bladeOsc.type = 'triangle'
  bladeOsc.frequency.setValueAtTime(920, now + 0.03)
  bladeOsc.frequency.exponentialRampToValueAtTime(1840, now + 0.18)
  bladeGain.gain.setValueAtTime(0.12, now + 0.03)
  bladeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

  bladeOsc.connect(bladeGain)
  bladeGain.connect(ctx.destination)
  bladeOsc.start(now + 0.03)
  bladeOsc.stop(now + 0.23)
}

/**
 * 50:50 神スライス時の和音ファンファーレ＆カメラ連写シャッター音「カシャシャシャッ！」
 */
export function playPerfectShutterSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // 1. 黄金和音チャイム (C5, E5, G5, C6)
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = now + idx * 0.045
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, start)
    gain.gain.setValueAtTime(0.11, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.45)
  })

  // 2. カメラ連写シャッター音（4連バースト）
  for (let i = 0; i < 4; i++) {
    const burstStart = now + 0.08 + i * 0.065
    const noise = ctx.createBufferSource()
    noise.buffer = createNoiseBuffer(ctx, 0.035)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(1800, burstStart)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.18, burstStart)
    gain.gain.exponentialRampToValueAtTime(0.001, burstStart + 0.032)

    noise.connect(hp)
    hp.connect(gain)
    gain.connect(ctx.destination)
    noise.start(burstStart)
    noise.stop(burstStart + 0.035)
  }
}

/**
 * GOOD 判定時（天秤が傾きつつ耐えた時）の計量チャイム音
 */
export function playGoodBalanceSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const notes = [440, 554.37, 659.25]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = now + i * 0.055
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0.1, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.26)
  })
}

/**
 * 鉄芯（💀）激突時の刀身破断「ガキィィン！！」＆大地粉砕重低音「ズドォォォン！！」
 */
export function playIronCrashSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // 1. 非整数倍音の金属破断クラッシュ音「ガキィィン！！」
  const clangFreqs = [880, 1397, 2110]
  clangFreqs.forEach((freq) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, now)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + 0.28)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.31)
  })

  // 2. まな板・床粉砕の重低音爆発スイープ「ズドォォォン！！」
  const subOsc = ctx.createOscillator()
  const subGain = ctx.createGain()
  subOsc.type = 'sawtooth'
  subOsc.frequency.setValueAtTime(145, now + 0.05)
  subOsc.frequency.exponentialRampToValueAtTime(24, now + 0.55)
  subGain.gain.setValueAtTime(0.28, now + 0.05)
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58)
  subOsc.connect(subGain)
  subGain.connect(ctx.destination)
  subOsc.start(now + 0.05)
  subOsc.stop(now + 0.6)

  // 3. ガラス＆岩盤破砕ノイズ
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 0.45)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1200, now + 0.04)
  lp.frequency.exponentialRampToValueAtTime(180, now + 0.48)
  const nGain = ctx.createGain()
  nGain.gain.setValueAtTime(0.24, now + 0.04)
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48)

  noise.connect(lp)
  lp.connect(nGain)
  nGain.connect(ctx.destination)
  noise.start(now + 0.04)
  noise.stop(now + 0.5)
}

/**
 * 比率大ズレ時の天秤カタパルト暴走「ビヨォン！バキィッ！ドゴォン！」
 */
export function playCatapultCrashSound(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // 1. カタパルト反発音「ビヨォォン！」
  const springOsc = ctx.createOscillator()
  const springGain = ctx.createGain()
  springOsc.type = 'sine'
  springOsc.frequency.setValueAtTime(140, now)
  springOsc.frequency.exponentialRampToValueAtTime(620, now + 0.16)
  springOsc.frequency.exponentialRampToValueAtTime(95, now + 0.36)
  springGain.gain.setValueAtTime(0.2, now)
  springGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38)
  springOsc.connect(springGain)
  springGain.connect(ctx.destination)
  springOsc.start(now)
  springOsc.stop(now + 0.4)

  // 2. 床陥没＆木材破砕ノイズ「バキィッ！ドゴォン！」
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 0.38)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(680, now + 0.08)
  filter.frequency.exponentialRampToValueAtTime(140, now + 0.42)
  const nGain = ctx.createGain()
  nGain.gain.setValueAtTime(0.24, now + 0.08)
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44)

  noise.connect(filter)
  filter.connect(nGain)
  nGain.connect(ctx.destination)
  noise.start(now + 0.08)
  noise.stop(now + 0.46)
}

