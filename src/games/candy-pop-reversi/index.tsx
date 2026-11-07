import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Undo2, Lightbulb, Sparkles, Crown } from 'lucide-react'
import {
  createInitialGameState,
  getLegalMoves,
  applyMove,
  countPieces,
  selectCpuMove,
  isCornerCell,
  evaluatePlaystyleTitle,
  type GameMode,
  type OpponentType,
  type GameState,
  type MoveEvaluation,
} from './logic'

interface FloatingPopup {
  id: number
  text: string
  subText?: string
  tone: 'rose' | 'amber' | 'sky' | 'violet'
}

export default function CandyPopReversi() {
  const [mode, setMode] = useState<GameMode>('party')
  const [opponent, setOpponent] = useState<OpponentType>('normal')
  const [showGuide, setShowGuide] = useState<boolean>(true)

  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialGameState('party')
  )
  // 「待った（Undo）」用の履歴スタック（自分の手番直前の状態を保持）
  const [history, setHistory] = useState<GameState[]>([])
  const [isCpuThinking, setIsCpuThinking] = useState<boolean>(false)
  const [popup, setPopup] = useState<FloatingPopup | null>(null)
  const popupTimerRef = useRef<number | null>(null)

  const triggerPopup = (
    text: string,
    subText: string | undefined,
    tone: FloatingPopup['tone']
  ) => {
    if (popupTimerRef.current) {
      window.clearTimeout(popupTimerRef.current)
    }
    setPopup({
      id: Date.now(),
      text,
      subText,
      tone,
    })
    popupTimerRef.current = window.setTimeout(() => {
      setPopup(null)
    }, 1150)
  }

  // 新規対局開始
  const startNewGame = (
    nextMode: GameMode = mode,
    nextOpponent: OpponentType = opponent
  ) => {
    if (popupTimerRef.current) {
      window.clearTimeout(popupTimerRef.current)
    }
    setMode(nextMode)
    setOpponent(nextOpponent)
    setGameState(createInitialGameState(nextMode))
    setHistory([])
    setIsCpuThinking(false)
    setPopup(null)
  }

  // 現在の手番の合法手マップ（"r,c" -> MoveEvaluation）
  const legalMovesMap = useMemo(() => {
    const map = new Map<string, MoveEvaluation>()
    if (gameState.isGameOver) return map
    const list = getLegalMoves(gameState, gameState.currentTurn)
    for (const m of list) {
      map.set(`${m.r},${m.c}`, m)
    }
    return map
  }, [gameState])

  // 直前に裏返った石のアニメーション順番マップ（"r,c" -> index）
  const flippedIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    gameState.lastFlipped.forEach((coord, idx) => {
      map.set(`${coord.r},${coord.c}`, idx)
    })
    return map
  }, [gameState.lastFlipped])

  // 着手時の演出トリガー
  const showMoveFeedback = (ev: MoveEvaluation, nextState: GameState) => {
    if (nextState.passNotice) {
      const passedLabel =
        nextState.passNotice === 'coral' ? 'コーラル' : 'ソーダ'
      triggerPopup('PASS! ⏭️', `${passedLabel}は置ける場所がありません`, 'violet')
      return
    }
    if (ev.triggersBomb) {
      triggerPopup(
        `BOMB BLAST!! 💣 +${ev.totalFlips}`,
        '十字の石もまとめてドカン！',
        'amber'
      )
    } else if (ev.triggersShield) {
      triggerPopup(
        `SHIELD LOCK!! 🛡️ +${ev.totalFlips}`,
        '絶対裏返らない無敵キャンディ誕生！',
        'sky'
      )
    } else if (ev.isCorner) {
      triggerPopup(
        `CORNER CROWN!! 👑 +${ev.totalFlips}`,
        '四隅の王冠マスをゲット！',
        'amber'
      )
    } else if (ev.totalFlips >= 7) {
      triggerPopup(
        `MEGA POP!! ⚡ +${ev.totalFlips}`,
        '超大量まとめ返し！！',
        'rose'
      )
    } else if (ev.totalFlips >= 4) {
      triggerPopup(
        `GREAT FLIP!! 🔥 +${ev.totalFlips}`,
        'ナイスコンボ！',
        'amber'
      )
    }
  }

  // CPUの自動思考ターン処理（0.48秒の心地よい思考ウェイト）
  useEffect(() => {
    if (
      gameState.isGameOver ||
      opponent === '2p' ||
      gameState.currentTurn !== 'soda'
    ) {
      setIsCpuThinking(false)
      return
    }

    setIsCpuThinking(true)
    const timer = window.setTimeout(() => {
      const cpuMove = selectCpuMove(gameState, opponent)
      if (!cpuMove) {
        setIsCpuThinking(false)
        return
      }
      const next = applyMove(gameState, cpuMove.r, cpuMove.c)
      setIsCpuThinking(false)
      if (next) {
        setGameState(next)
        showMoveFeedback(cpuMove, next)
      }
    }, 480)

    return () => window.clearTimeout(timer)
  }, [gameState, opponent])

  // プレイヤーが盤面のセルをタップしたとき
  const handleCellClick = (r: number, c: number) => {
    if (gameState.isGameOver || isCpuThinking) return
    if (opponent !== '2p' && gameState.currentTurn !== 'coral') return

    const ev = legalMovesMap.get(`${r},${c}`)
    if (!ev) return

    const next = applyMove(gameState, r, c)
    if (!next) return

    setHistory((prev) => [...prev, gameState])
    setGameState(next)
    showMoveFeedback(ev, next)
  }

  // 「待った（Undo）」ボタン
  const handleUndo = () => {
    if (history.length === 0 || isCpuThinking) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setGameState(prev)
    setPopup(null)
  }

  const counts = countPieces(gameState.board)
  const totalPieces = Math.max(1, counts.coral + counts.soda)
  const coralPercent = Math.round((counts.coral / totalPieces) * 100)
  const playstyleTitle = useMemo(
    () => (gameState.isGameOver ? evaluatePlaystyleTitle(gameState) : null),
    [gameState]
  )

  return (
    <div className="flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-b from-amber-50/70 via-rose-50/40 to-sky-50/80 px-3 py-2 select-none">
      {/* ① 上部ゾーン：モード・難易度ピル ＆ スコアカード・綱引き勢力バー */}
      <div className="flex shrink-0 flex-col gap-1.5">
        {/* モード切替 ＆ 対戦相手切替バー */}
        <div className="flex items-center justify-between gap-1.5">
          {/* ルールモード切替 */}
          <div className="flex rounded-full bg-white p-0.5 shadow-xs ring-1 ring-slate-200">
            <button
              type="button"
              onClick={() => startNewGame('party', opponent)}
              className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-all ${
                mode === 'party'
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🎉 パーティー
            </button>
            <button
              type="button"
              onClick={() => startNewGame('classic', opponent)}
              className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-all ${
                mode === 'classic'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              👑 クラシック
            </button>
          </div>

          {/* CPU難易度 / 2P切替 */}
          <div className="flex rounded-full bg-white p-0.5 shadow-xs ring-1 ring-slate-200">
            {(
              [
                { id: 'easy', label: '🐣よわい' },
                { id: 'normal', label: '🐰ふつう' },
                { id: 'hard', label: '🦁つよい' },
                { id: '2p', label: '👥2人' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => startNewGame(mode, item.id)}
                className={`cursor-pointer rounded-full px-2 py-1 text-[10px] font-extrabold transition-all ${
                  opponent === item.id
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* スコアカード ＆ 綱引き勢力バー */}
        <div className="rounded-2xl border border-white bg-white/90 p-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            {/* 1P: ストロベリー・コーラル */}
            <div
              className={`flex flex-1 items-center justify-between rounded-xl px-2.5 py-1.5 transition-all ${
                !gameState.isGameOver && gameState.currentTurn === 'coral'
                  ? 'bg-rose-50 ring-2 ring-rose-400'
                  : 'bg-slate-50/80 opacity-80'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-rose-600 text-[11px] font-black text-white shadow-xs">
                  ★
                </span>
                <div className="leading-tight">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-extrabold text-slate-700">
                      {opponent === '2p' ? '1P コーラル' : 'あなた'}
                    </span>
                    {!gameState.isGameOver &&
                      gameState.currentTurn === 'coral' && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                          TURN
                        </span>
                      )}
                  </div>
                </div>
              </div>
              <span className="text-lg font-black text-rose-600">
                {counts.coral}
              </span>
            </div>

            {/* 2P / CPU: ソーダ・ブルー */}
            <div
              className={`flex flex-1 items-center justify-between rounded-xl px-2.5 py-1.5 transition-all ${
                !gameState.isGameOver && gameState.currentTurn === 'soda'
                  ? 'bg-sky-50 ring-2 ring-sky-400'
                  : 'bg-slate-50/80 opacity-80'
              }`}
            >
              <span className="text-lg font-black text-sky-600">
                {counts.soda}
              </span>
              <div className="flex items-center gap-1.5">
                <div className="text-right leading-tight">
                  <div className="flex items-center justify-end gap-1">
                    {!gameState.isGameOver &&
                      gameState.currentTurn === 'soda' && (
                        <span className="rounded-full bg-sky-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                          {isCpuThinking ? '思考中' : 'TURN'}
                        </span>
                      )}
                    <span className="text-[11px] font-extrabold text-slate-700">
                      {opponent === '2p' ? '2P ソーダ' : 'CPU'}
                    </span>
                  </div>
                </div>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-[10px] font-black text-white shadow-xs">
                  ●
                </span>
              </div>
            </div>
          </div>

          {/* リアルタイム綱引き勢力ゲージ */}
          <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-sky-400 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-400 transition-all duration-300"
              style={{ width: `${coralPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* ② 中央ゾーン：8×8 ミント市松模様キャンディボード */}
      <div className="relative my-auto flex w-full items-center justify-center">
        <div className="relative aspect-square w-full max-w-[384px] rounded-3xl border-b-4 border-teal-200 bg-white p-2 shadow-lg ring-2 ring-teal-100">
          <div
            className="grid h-full w-full grid-cols-8 grid-rows-8 gap-1 rounded-2xl bg-teal-200/60 p-1"
            role="grid"
            aria-label="リバーシ盤面"
          >
            {gameState.board.map((row, r) =>
              row.map((cell, c) => {
                const key = `${r},${c}`
                const isCheckerEven = (r + c) % 2 === 0
                const legalEv = legalMovesMap.get(key)
                const isLegal = Boolean(legalEv)
                const gimmick = gameState.gimmicks[r][c]
                const isShielded = gameState.shielded[r][c]
                const isCorner = isCornerCell(r, c)
                const isLastMove =
                  gameState.lastMove?.r === r && gameState.lastMove?.c === c
                const flipIdx = flippedIndexMap.get(key)

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!isLegal || isCpuThinking}
                    onClick={() => handleCellClick(r, c)}
                    aria-label={`行${r + 1}列${c + 1}`}
                    className={`relative flex items-center justify-center rounded-lg transition-transform ${
                      isCheckerEven ? 'bg-teal-50' : 'bg-emerald-100/80'
                    } ${
                      isLegal && !isCpuThinking
                        ? 'cursor-pointer hover:brightness-95 active:scale-90'
                        : 'cursor-default'
                    }`}
                  >
                    {/* 空きマスの四隅👑マーク */}
                    {!cell && isCorner && !isLegal && (
                      <Crown className="h-3.5 w-3.5 text-amber-400/70" />
                    )}

                    {/* 空きマスのギミック表示（1マス1情報レイヤー原則：合法手サークルと重ならないよう調整） */}
                    {!cell && gimmick && (
                      <span
                        className={
                          isLegal && showGuide
                            ? 'absolute -top-0.5 -right-0.5 z-10 text-[10px] leading-none drop-shadow-xs'
                            : 'text-base opacity-75'
                        }
                      >
                        {gimmick === 'bomb' ? '💣' : '🛡️'}
                      </span>
                    )}

                    {/* 合法手ガイド（+N獲得枚数サークル or ドット） */}
                    {!cell && isLegal && (
                      <div
                        className={`flex items-center justify-center rounded-full font-black transition-transform ${
                          showGuide
                            ? legalEv!.totalFlips >= 4
                              ? 'h-6 w-6 animate-pulse bg-amber-400/90 text-[11px] text-white shadow-xs ring-2 ring-white'
                              : gameState.currentTurn === 'coral'
                                ? 'h-5.5 w-5.5 bg-rose-400/85 text-[10px] text-white shadow-2xs'
                                : 'h-5.5 w-5.5 bg-sky-400/85 text-[10px] text-white shadow-2xs'
                            : gameState.currentTurn === 'coral'
                              ? 'h-2.5 w-2.5 bg-rose-400/75'
                              : 'h-2.5 w-2.5 bg-sky-400/75'
                        }`}
                      >
                        {showGuide ? `+${legalEv!.totalFlips}` : ''}
                      </div>
                    )}

                    {/* キャンディ石（コーラル★ vs ソーダ●） */}
                    {cell && (
                      <div
                        style={
                          flipIdx !== undefined
                            ? { transitionDelay: `${flipIdx * 50}ms` }
                            : undefined
                        }
                        className={`relative flex h-[84%] w-[84%] items-center justify-center rounded-full border-b-[3px] shadow-sm transition-all duration-300 ${
                          cell === 'coral'
                            ? 'border-rose-700 bg-gradient-to-br from-rose-400 via-rose-500 to-pink-600 text-white'
                            : 'border-sky-700 bg-gradient-to-br from-sky-300 via-sky-500 to-blue-600 text-white'
                        } ${
                          isShielded
                            ? 'ring-2 ring-amber-300 ring-offset-1'
                            : ''
                        } ${flipIdx !== undefined ? 'scale-105' : 'scale-100'}`}
                      >
                        {/* 左上のキャンディツヤハイライト */}
                        <span className="pointer-events-none absolute top-1 left-1.5 h-1.5 w-2.5 -rotate-12 rounded-full bg-white/55" />

                        {/* 石の中央アイコン（シールド石は🛡️、角は👑、通常は★/●） */}
                        <span className="text-[11px] font-black leading-none drop-shadow-2xs">
                          {isShielded
                            ? '🛡️'
                            : isCorner
                              ? '👑'
                              : cell === 'coral'
                                ? '★'
                                : '●'}
                        </span>

                        {/* 直前に置かれた石のマーカー */}
                        {isLastMove && (
                          <span className="pointer-events-none absolute -inset-0.5 rounded-full border-2 border-amber-300 animate-ping opacity-60" />
                        )}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* 盤面中央のコンボ・ギミック・PASSポップアップ演出（レイアウト揺れゼロ） */}
          {popup && !gameState.isGameOver && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
              <div
                className={`animate-bounce rounded-2xl border-2 border-white px-4 py-2 text-center shadow-xl ${
                  popup.tone === 'rose'
                    ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white'
                    : popup.tone === 'amber'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                      : popup.tone === 'sky'
                        ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white'
                        : 'bg-slate-800/95 text-white'
                }`}
              >
                <div className="text-base font-black tracking-wide drop-shadow-xs">
                  {popup.text}
                </div>
                {popup.subText && (
                  <div className="text-[11px] font-bold opacity-95">
                    {popup.subText}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 終局リザルト＆プレイスタイル称号オーバーレイ */}
          {gameState.isGameOver && playstyleTitle && (
            <div className="absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-slate-900/65 p-4 backdrop-blur-xs">
              <div className="w-full max-w-xs rounded-3xl border-4 border-white bg-gradient-to-b from-white to-amber-50 p-5 text-center shadow-2xl">
                <div className="mx-auto mb-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-extrabold text-amber-800">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>RESULT</span>
                </div>

                <h2 className="text-2xl font-black text-slate-800">
                  {gameState.winner === 'coral'
                    ? opponent === '2p'
                      ? '🎉 1P コーラルの勝利！'
                      : '🎉 YOU WIN!!'
                    : gameState.winner === 'soda'
                      ? opponent === '2p'
                        ? '🎉 2P ソーダの勝利！'
                        : '💦 CPU WIN...'
                      : '🤝 DRAW MATCH!'}
                </h2>

                {/* 最終スコア */}
                <div className="my-3 flex items-center justify-center gap-4 rounded-2xl bg-white px-4 py-2.5 shadow-inner ring-1 ring-slate-100">
                  <div className="text-center">
                    <div className="text-[10px] font-extrabold text-rose-500">
                      ★ コーラル
                    </div>
                    <div className="text-2xl font-black text-rose-600">
                      {counts.coral}
                    </div>
                  </div>
                  <div className="text-sm font-black text-slate-300">VS</div>
                  <div className="text-center">
                    <div className="text-[10px] font-extrabold text-sky-500">
                      ● ソーダ
                    </div>
                    <div className="text-2xl font-black text-sky-600">
                      {counts.soda}
                    </div>
                  </div>
                </div>

                {/* 称号バッジ */}
                <div className="rounded-2xl bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-sky-500/10 p-3 ring-1 ring-amber-200">
                  <div className="text-sm font-black text-slate-800">
                    {playstyleTitle.badge}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug font-medium text-slate-600">
                    {playstyleTitle.description}
                  </p>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      `🍬 キャンディ・ポップ・リバーシで【${playstyleTitle.badge}】を獲得！（★${counts.coral} vs ●${counts.soda}）\n#AIGameLab #キャンディポップリバーシ\n`
                    )}&url=${encodeURIComponent(window.location.href)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 py-2.5 text-xs font-black text-white shadow-md transition hover:bg-slate-800 active:scale-95"
                  >
                    <span>𝕏 で結果をシェアする</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => startNewGame(mode, opponent)}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 py-3 text-sm font-black text-white shadow-md transition hover:brightness-105 active:scale-95"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>もう1回遊ぶ！</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ③ 下部ゾーン：ギミック凡例 ＆ 親指コンフォート3ボタン */}
      <div className="flex shrink-0 flex-col gap-1.5">
        {/* パーティーモード時の1行ギミックガイド */}
        <div className="flex items-center justify-center gap-3 rounded-xl bg-white/80 py-1 px-2 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200/70">
          {mode === 'party' ? (
            <>
              <span>💣ボム：十字の相手石も誘爆</span>
              <span className="text-slate-300">|</span>
              <span>🛡️シールド：裏返らない無敵石</span>
            </>
          ) : (
            <span>👑クラシック：四隅（角）をめぐる純粋な8×8王道頭脳戦</span>
          )}
        </div>

        {/* 親指アクション3ボタン */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={history.length === 0 || isCpuThinking}
            onClick={handleUndo}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-b-4 border-slate-200 bg-white py-2.5 text-xs font-extrabold text-slate-700 shadow-xs transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4 text-rose-500" />
            <span>待った</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-b-4 py-2.5 text-xs font-extrabold shadow-xs transition active:translate-y-0.5 ${
              showGuide
                ? 'border-amber-600 bg-amber-400 text-white'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <Lightbulb className="h-4 w-4" />
            <span>ガイド {showGuide ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => startNewGame(mode, opponent)}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-b-4 border-sky-600 bg-sky-500 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-sky-600 active:translate-y-0.5"
          >
            <RotateCcw className="h-4 w-4" />
            <span>新規対局</span>
          </button>
        </div>
      </div>
    </div>
  )
}
