import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Flame, RotateCcw, Sparkles, RefreshCw } from 'lucide-react'
import {
  ROUNDS,
  pickRandomScandal,
  stepBowPhysics,
  evaluateRoundStop,
  evaluateFinalPressResult,
  buildShareTweetUrl,
  type ScandalPrompt,
  type RoundRecord,
} from './logic'

type BowPhase = 'ready' | 'holding' | 'braking' | 'round_result' | 'final_scoop'

export default function ShazaiAngleChallenge() {
  const [scandal, setScandal] = useState<ScandalPrompt>(() =>
    pickRandomScandal()
  )
  const [roundIdx, setRoundIdx] = useState<number>(0)
  const [phase, setPhase] = useState<BowPhase>('ready')
  const [angle, setAngle] = useState<number>(0)
  const [records, setRecords] = useState<RoundRecord[]>([])

  const angleRef = useRef<number>(0)
  const velocityRef = useRef<number>(0)
  const phaseRef = useRef<BowPhase>('ready')
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)

  const currentRound = ROUNDS[roundIdx] ?? ROUNDS[0]
  const lastRecord = records[records.length - 1] ?? null

  const stopAnimationLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastTimeRef.current = null
  }

  useEffect(() => {
    return () => stopAnimationLoop()
  }, [])

  // ラウンド停止確定時の処理
  const finalizeRoundStop = (stoppedAngle: number) => {
    stopAnimationLoop()
    const record = evaluateRoundStop(currentRound, stoppedAngle)
    const nextRecords = [...records, record]
    setRecords(nextRecords)

    // 放送事故（浅すぎ・床激突・地球貫通・大回転）または最終第3問終了なら号外リザルトへ
    if (record.isAccident || currentRound.roundNumber === 3) {
      phaseRef.current = 'final_scoop'
      setPhase('final_scoop')
    } else {
      phaseRef.current = 'round_result'
      setPhase('round_result')
    }
  }

  // requestAnimationFrame による慣性お辞儀物理ループ
  const runPhysicsLoop = (timestamp: number) => {
    if (
      phaseRef.current !== 'holding' &&
      phaseRef.current !== 'braking'
    ) {
      return
    }

    if (lastTimeRef.current === null) {
      lastTimeRef.current = timestamp
    }
    const dtSec = Math.max(0.004, (timestamp - lastTimeRef.current) / 1000)
    lastTimeRef.current = timestamp

    const next = stepBowPhysics(
      angleRef.current,
      velocityRef.current,
      phaseRef.current,
      currentRound,
      dtSec
    )

    angleRef.current = next.angle
    velocityRef.current = next.velocity
    setAngle(next.angle)

    if (next.stopped) {
      finalizeRoundStop(next.angle)
      return
    }

    rafRef.current = requestAnimationFrame(runPhysicsLoop)
  }

  // 長押し開始（お辞儀スタート）
  const handleStartHold = () => {
    if (phase !== 'ready') return
    angleRef.current = 0
    velocityRef.current = currentRound.initialVelocityPerSec
    phaseRef.current = 'holding'
    setAngle(0)
    setPhase('holding')
    lastTimeRef.current = null
    rafRef.current = requestAnimationFrame(runPhysicsLoop)
  }

  // 指を離す（慣性ブレーキ開始）
  const handleReleaseHold = () => {
    if (phaseRef.current !== 'holding') return
    phaseRef.current = 'braking'
    setPhase('braking')
  }

  // 次のラウンド（第2問・第3問）へ進む
  const handleNextRound = () => {
    stopAnimationLoop()
    const nextIdx = Math.min(ROUNDS.length - 1, roundIdx + 1)
    setRoundIdx(nextIdx)
    angleRef.current = 0
    velocityRef.current = 0
    phaseRef.current = 'ready'
    setAngle(0)
    setPhase('ready')
  }

  // 新しい不祥事で最初から再会見
  const handleRestartWithNewScandal = () => {
    stopAnimationLoop()
    setScandal((prev) => pickRandomScandal(prev.id))
    setRoundIdx(0)
    setRecords([])
    angleRef.current = 0
    velocityRef.current = 0
    phaseRef.current = 'ready'
    setAngle(0)
    setPhase('ready')
  }

  // カメラフラッシュ目くらまし中かどうか
  const isFlashBlinded =
    (phase === 'holding' || phase === 'braking') &&
    currentRound.flashBlindStartAngle !== null &&
    angle >= currentRound.flashBlindStartAngle

  // 号外リザルトデータ
  const finalResult = useMemo(() => {
    if (phase !== 'final_scoop' || records.length === 0) return null
    return evaluateFinalPressResult(records)
  }, [phase, records])

  // SVG内の目標角度ラジアン座標（ピボット (130, 142) から半径 82 のアーク）
  const targetRad = ((currentRound.targetAngle - 90) * Math.PI) / 180
  const targetLineX = 130 + Math.sin((currentRound.targetAngle * Math.PI) / 180) * 86
  const targetLineY = 142 - Math.cos((currentRound.targetAngle * Math.PI) / 180) * 86
  void targetRad

  const isFloorCracked = angle >= 145
  const isMantleReached = angle >= 185
  const isWindmill = angle >= 260

  return (
    <div className="flex h-full w-full flex-col justify-between overflow-hidden bg-slate-900 px-3 py-2 text-slate-800 select-none">
      {/* ① 上部ゾーン：ワイドショー緊急生中継テロップ ＆ 不祥事フリップ */}
      <div className="flex shrink-0 flex-col gap-1.5">
        {/* LIVE帯 ＆ ラウンド進捗 */}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 px-3 py-1 text-white shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-white" />
            <span className="text-[11px] font-black tracking-wider">
              LIVE 緊急謝罪会見
            </span>
          </div>

          <div className="flex items-center gap-1">
            {ROUNDS.map((r, idx) => {
              const rec = records[idx]
              return (
                <span
                  key={r.roundNumber}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                    idx === roundIdx && phase !== 'final_scoop'
                      ? 'bg-white text-rose-600 shadow-2xs'
                      : rec
                        ? rec.isAccident
                          ? 'bg-rose-900/80 text-rose-200'
                          : 'bg-emerald-500 text-white'
                        : 'bg-black/25 text-white/75'
                  }`}
                >
                  {r.roundNumber}問:{r.targetAngle}°
                </span>
              )
            })}
          </div>
        </div>

        {/* 不祥事フリップボード */}
        <div className="relative rounded-2xl border-2 border-amber-300 bg-white p-2.5 shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                  本日の不祥事
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {currentRound.title}
                </span>
              </div>
              <p className="mt-1 text-xs leading-snug font-black text-slate-800 sm:text-sm">
                「{scandal.incident}」
              </p>
            </div>

            {phase === 'ready' && roundIdx === 0 && (
              <button
                type="button"
                onClick={() => setScandal((prev) => pickRandomScandal(prev.id))}
                title="不祥事お題を変える"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 active:scale-90"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 目標角度 ＆ 現在角度メーター */}
          <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-900 px-3 py-1.5 text-white">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-amber-300">
                目標角度
              </span>
              <span className="text-base font-black text-amber-400">
                {currentRound.targetAngle.toFixed(1)}°
              </span>
            </div>

            <div className="text-[10px] font-bold text-slate-300">
              {currentRound.subtitle}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-sky-300">現在</span>
              <span
                className={`min-w-[54px] text-right font-mono text-base font-black ${
                  isFlashBlinded
                    ? 'animate-pulse text-amber-300'
                    : isFloorCracked
                      ? 'text-rose-400'
                      : 'text-white'
                }`}
              >
                {isFlashBlinded ? '??.?°' : `${angle.toFixed(1)}°`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ② 中央ゾーン：会見ステージ ＆ お辞儀角度SVGビューポート */}
      <div className="relative my-1.5 flex flex-1 flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-amber-200/80 bg-gradient-to-b from-amber-100 via-amber-50 to-stone-200 shadow-inner">
        {/* 金屏風風の背景ストライプ */}
        <div className="pointer-events-none absolute inset-x-4 top-3 bottom-14 grid grid-cols-6 gap-1 rounded-2xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-200/75 to-yellow-100/75 p-1 shadow-inner">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-full rounded-lg border border-amber-300/60 bg-amber-100/40"
            />
          ))}
        </div>

        {/* カメラフラッシュ目くらましオーバーレイ */}
        {isFlashBlinded && (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-start bg-white/65 pt-3 backdrop-blur-[1px]">
            <div className="inline-flex animate-bounce items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-black text-white shadow-md">
              <Camera className="h-3.5 w-3.5" />
              <span>📸 フラッシュ目くらまし発生中！体幹で止めろ！</span>
            </div>
          </div>
        )}

        {/* メインSVGステージ */}
        <svg
          viewBox="0 0 260 220"
          className="relative z-10 h-full max-h-[270px] w-full max-w-[360px]"
          aria-label="謝罪会見ステージ"
        >
          {/* ステージ床と地下マントル断面 */}
          <rect
            x="0"
            y="168"
            width="260"
            height="52"
            fill={isMantleReached ? '#7f1d1d' : '#57534e'}
          />
          <line
            x1="0"
            y1="168"
            x2="260"
            y2="168"
            stroke="#fbbf24"
            strokeWidth="3"
          />

          {/* 目標角度のガイド扇形＆黄金点線 */}
          <circle
            cx="130"
            cy="142"
            r="82"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.55"
          />
          <line
            x1="130"
            y1="142"
            x2={targetLineX}
            y2={targetLineY}
            stroke="#f59e0b"
            strokeWidth="3"
            strokeDasharray="5 3"
          />
          <circle cx={targetLineX} cy={targetLineY} r="5" fill="#f59e0b" />
          <text
            x={Math.min(235, Math.max(20, targetLineX + 8))}
            y={Math.max(22, targetLineY)}
            fill="#b45309"
            fontSize="11"
            fontWeight="900"
          >
            目標 {currentRound.targetAngle}°
          </text>

          {/* 会見テーブル＆マイク（角度145°以上で粉砕！） */}
          <g
            transform={
              isFloorCracked
                ? 'translate(35, 18) rotate(28 185 155)'
                : undefined
            }
          >
            <rect
              x="162"
              y="138"
              width="62"
              height="30"
              rx="4"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="2"
            />
            {/* マイク2本 */}
            <line
              x1="178"
              y1="138"
              x2="172"
              y2="122"
              stroke="#334155"
              strokeWidth="2.5"
            />
            <circle cx="170" cy="120" r="4" fill="#1e293b" />
            <line
              x1="194"
              y1="138"
              x2="188"
              y2="122"
              stroke="#334155"
              strokeWidth="2.5"
            />
            <circle cx="186" cy="120" r="4" fill="#1e293b" />
          </g>

          {/* キャラクターの下半身（固定の脚） */}
          <rect
            x="120"
            y="140"
            width="18"
            height="30"
            rx="6"
            fill="#1e293b"
          />
          {/* 靴 */}
          <ellipse cx="132" cy="170" rx="12" ry="5" fill="#0f172a" />

          {/* キャラクターの上半身（腰 (130, 142) を軸に angle 度回転！） */}
          <g transform={`rotate(${angle} 130 142)`}>
            {/* スーツ胴体 */}
            <rect
              x="117"
              y="88"
              width="26"
              height="56"
              rx="10"
              fill="#1e293b"
            />
            {/* 白シャツ＆赤ネクタイ */}
            <polygon points="130,92 138,92 134,124 130,120" fill="#ffffff" />
            <polygon
              points="132,96 137,96 140,122 134,127 131,122"
              fill="#e11d48"
            />
            {/* 腕（脇にピタッとつける謝罪フォーム） */}
            <rect
              x="123"
              y="96"
              width="10"
              height="44"
              rx="5"
              fill="#334155"
            />
            {/* 頭 */}
            <circle
              cx="130"
              cy="68"
              r="20"
              fill="#fde68a"
              stroke="#f59e0b"
              strokeWidth="2"
            />
            {/* 髪型（七三分け） */}
            <path
              d="M 110 66 Q 112 44 132 46 Q 148 48 150 64 Q 138 56 110 66 Z"
              fill="#0f172a"
            />
            {/* 表情（浅いときはニヤリ顔、真剣時は汗、激突時は目がバツ） */}
            {angle >= 140 ? (
              <g stroke="#0f172a" strokeWidth="2.2">
                <line x1="136" y1="62" x2="144" y2="70" />
                <line x1="144" y1="62" x2="136" y2="70" />
                <circle cx="142" cy="76" r="3" fill="#e11d48" />
              </g>
            ) : angle < 22 ? (
              <g>
                <circle cx="140" cy="65" r="2.5" fill="#0f172a" />
                <path
                  d="M 135 75 Q 142 79 147 73"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2"
                />
              </g>
            ) : (
              <g>
                <line
                  x1="136"
                  y1="65"
                  x2="145"
                  y2="67"
                  stroke="#0f172a"
                  strokeWidth="2.5"
                />
                <line
                  x1="137"
                  y1="75"
                  x2="145"
                  y2="75"
                  stroke="#0f172a"
                  strokeWidth="2"
                />
                {/* 飛び散る冷や汗 */}
                <circle cx="148" cy="56" r="3" fill="#38bdf8" />
              </g>
            )}
          </g>

          {/* 床めり込み・地球貫通・大回転時のド派手エフェクト */}
          {isFloorCracked && (
            <g>
              <polygon
                points="165,168 175,152 185,168 198,148 208,168 222,155 230,168"
                fill="#f59e0b"
                opacity="0.85"
              />
              <text
                x="130"
                y="192"
                textAnchor="middle"
                fill="#fef08a"
                fontSize="13"
                fontWeight="900"
              >
                {isWindmill
                  ? '🕺 高速ウィンドミル回転中！！'
                  : isMantleReached
                    ? '🌍 マントル貫通！ブラジル到達！！'
                    : '💥 ドゴォン！！床面めり込み激突！！'}
              </text>
            </g>
          )}
        </svg>

        {/* 記者団のヤジ＆ラウンド途中判定バナー */}
        <div className="z-10 mb-1.5 w-[92%] rounded-xl bg-slate-900/90 px-3 py-1.5 text-center text-xs font-extrabold text-white shadow-md">
          {phase === 'round_result' && lastRecord ? (
            <span className="text-amber-300">{lastRecord.roundComment}</span>
          ) : (
            <span className="text-slate-100">
              🎤 記者：{scandal.reporterHeckle}
            </span>
          )}
        </div>

        {/* 📰 終局時：週刊スクープ号外新聞リザルトオーバーレイ */}
        {phase === 'final_scoop' && finalResult && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-2.5 backdrop-blur-xs">
            <div className="flex h-full w-full max-w-[390px] flex-col justify-between overflow-hidden rounded-2xl border-4 border-slate-900 bg-[#fdfbf7] p-3 text-slate-900 shadow-2xl">
              {/* 新聞ヘッダー ＆ 斜め赤ハンコ */}
              <div>
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-red-600 px-2 py-0.5 text-xs font-black text-white">
                      号外
                    </span>
                    <span className="text-xs font-black tracking-tight">
                      AI Game Lab スクープ日報
                    </span>
                  </div>
                  <span
                    className={`-rotate-6 rounded-md border-2 px-2 py-0.5 text-xs font-black shadow-xs ${
                      finalResult.stampTone === 'gold'
                        ? 'border-amber-600 bg-amber-100 text-amber-800'
                        : finalResult.stampTone === 'emerald'
                          ? 'border-emerald-600 bg-emerald-100 text-emerald-800'
                          : finalResult.stampTone === 'violet'
                            ? 'border-purple-600 bg-purple-100 text-purple-800'
                            : 'border-red-600 bg-red-100 text-red-700'
                    }`}
                  >
                    {finalResult.stampLabel}
                  </span>
                </div>

                {/* 特大見出し */}
                <h2 className="mt-1.5 text-sm leading-snug font-black text-slate-900">
                  {finalResult.headline}
                </h2>
              </div>

              {/* スクープ記録 ＆ 称号カード */}
              <div className="my-1.5 flex flex-col gap-1.5 rounded-xl border border-slate-300 bg-white p-2.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-1.5">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400">
                      決定瞬間のお辞儀角度
                    </div>
                    <div className="text-xl font-black text-rose-600">
                      {finalResult.highlightAngle.toFixed(1)}°
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-slate-400">
                      SNS拡散規模
                    </div>
                    <div className="text-xs font-black text-amber-600">
                      {finalResult.viralRepostText}
                    </div>
                  </div>
                </div>

                {/* 各問の記録ピル */}
                <div className="flex flex-wrap gap-1">
                  {records.map((rec) => (
                    <span
                      key={rec.roundNumber}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                        rec.isAccident
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {rec.roundNumber}問: {rec.stoppedAngle.toFixed(1)}° (目標
                      {rec.targetAngle}°)
                    </span>
                  ))}
                </div>

                {/* パワーワード称号＆死因 */}
                <div className="rounded-lg bg-slate-900 px-2.5 py-2 text-white">
                  <div className="text-[10px] font-bold text-amber-300">
                    獲得称号
                  </div>
                  <div className="text-xs font-black text-white sm:text-sm">
                    {finalResult.titleBadge}
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-rose-300">
                    {finalResult.causeOfDeathOrFeat}
                  </div>
                </div>

                {/* 記者寸評 */}
                <p className="text-[11px] leading-snug font-bold text-slate-600">
                  🎤 記者寸評：{finalResult.reporterCommentary}
                </p>
              </div>

              {/* 𝕏 シェア ＆ 0秒リトライボタン */}
              <div className="flex flex-col gap-1.5">
                <a
                  href={buildShareTweetUrl(
                    scandal,
                    finalResult,
                    window.location.href
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-950 py-2.5 text-xs font-black text-white shadow-md transition hover:bg-slate-800 active:scale-95"
                >
                  <span>𝕏 で会見結果をシェアする</span>
                </a>

                <button
                  type="button"
                  onClick={handleRestartWithNewScandal}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 py-2.5 text-xs font-black text-white shadow-md transition hover:brightness-105 active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>別の不祥事で再会見！（もう1回）</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ③ 下部ゾーン：親指ホールド特大アクションボタン */}
      <div className="shrink-0">
        {phase === 'round_result' ? (
          <button
            type="button"
            onClick={handleNextRound}
            className="flex h-15 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-b-4 border-emerald-700 bg-emerald-500 text-base font-black text-white shadow-lg transition hover:bg-emerald-600 active:translate-y-0.5"
          >
            <Sparkles className="h-5 w-5" />
            <span>次の追及（第{roundIdx + 2}問）へ進む！</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={phase === 'braking' || phase === 'final_scoop'}
            onPointerDown={handleStartHold}
            onPointerUp={handleReleaseHold}
            onPointerLeave={
              phase === 'holding' ? handleReleaseHold : undefined
            }
            onPointerCancel={
              phase === 'holding' ? handleReleaseHold : undefined
            }
            className={`flex h-15 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-b-4 text-base font-black text-white shadow-lg transition active:translate-y-0.5 ${
              phase === 'holding'
                ? 'animate-pulse border-amber-700 bg-gradient-to-r from-amber-500 to-red-500'
                : phase === 'braking'
                  ? 'border-slate-700 bg-slate-600 opacity-80'
                  : 'border-rose-800 bg-gradient-to-r from-rose-600 to-orange-500 hover:brightness-105'
            }`}
          >
            <Flame className="h-5 w-5" />
            <span>
              {phase === 'ready'
                ? `長押しでお辞儀スタート！（目標 ${currentRound.targetAngle}°）`
                : phase === 'holding'
                  ? '🖐️ 今だ！指を離してブレーキ！！'
                  : '💦 慣性ブレーキ中...！！'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
