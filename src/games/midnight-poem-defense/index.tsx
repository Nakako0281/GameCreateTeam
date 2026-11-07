import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trash2,
  Send,
  RotateCcw,
  Share2,
  Moon,
  AlertOctagon,
  MessageSquareWarning,
  ShieldCheck,
} from 'lucide-react';
import {
  MidnightDraftCard,
  MIDNIGHT_DRAFT_DECK,
  evaluateDraftSort,
  getPoemDefenseRankInfo,
} from './logic';

const CARD_TIME_LIMIT_MS = 3800;

export default function MidnightPoemDefenseGame() {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready');
  const [cardIndex, setCardIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(CARD_TIME_LIMIT_MS);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [shreddedCount, setShreddedCount] = useState(0);
  const [fatalCard, setFatalCard] = useState<MidnightDraftCard>(MIDNIGHT_DRAFT_DECK[0]);
  const [fatalReason, setFatalReason] = useState(
    '朝4時到来！スマホの電源を物理的にへし折り社会的尊厳を完全防衛！'
  );
  const [fatalReply, setFatalReply] = useState(
    '翌朝の自分「危なかった…全社LINEにポエムを送らずに朝を迎えられたぞ！！」'
  );
  const [fatalReadText, setFatalReadText] = useState('誤爆 0件・完全防衛達成');
  const [toast, setToast] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const remainingRef = useRef(CARD_TIME_LIMIT_MS);
  const lockedRef = useRef(false);

  const currentCard = MIDNIGHT_DRAFT_DECK[cardIndex % MIDNIGHT_DRAFT_DECK.length];

  const startNewGame = () => {
    setCardIndex(0);
    setRemainingMs(CARD_TIME_LIMIT_MS);
    remainingRef.current = CARD_TIME_LIMIT_MS;
    setScore(0);
    setCombo(0);
    setShreddedCount(0);
    setFatalCard(MIDNIGHT_DRAFT_DECK[0]);
    setFatalReason('朝4時到来！スマホの電源を物理的にへし折り社会的尊厳を完全防衛！');
    setFatalReply('翌朝の自分「危なかった…全社LINEにポエムを送らずに朝を迎えられたぞ！！」');
    setFatalReadText('誤爆 0件・完全防衛達成');
    setToast(null);
    lockedRef.current = false;
    lastTickRef.current = null;
    setPhase('playing');
  };

  const handleSort = useCallback(
    (action: 'SHRED' | 'SEND') => {
      if (phase !== 'playing' || lockedRef.current) return;
      lockedRef.current = true;

      const ratio = remainingRef.current / CARD_TIME_LIMIT_MS;
      const result = evaluateDraftSort(action, currentCard, ratio, combo);

      if (!result.isCorrect) {
        setFatalCard(currentCard);
        setFatalReason(result.failureReason);
        setFatalReply(result.leakedReply);
        setFatalReadText(result.readCountText);
        setCombo(0);
        setPhase('result');
        return;
      }

      setScore((s) => s + result.scoreDelta);
      setCombo((c) => c + 1);
      if (action === 'SHRED') {
        setShreddedCount((c) => c + 1);
      }
      setToast(`${result.headline} (+${result.scoreDelta}pt)`);

      const nextIdx = cardIndex + 1;
      if (nextIdx >= MIDNIGHT_DRAFT_DECK.length) {
        setFatalCard(currentCard);
        setFatalReason('朝4時到来！全10通の深夜暴走ドラフトをノーミスで仕分け切り完全生還！');
        setFatalReply('翌朝の自分「無傷で朝を迎えた…！今日の私はネットリテラシーの神だ！」');
        setFatalReadText('誤爆 0件・完全防衛');
        setPhase('result');
        return;
      }

      setTimeout(() => {
        const nextLimit = Math.max(2200, CARD_TIME_LIMIT_MS - nextIdx * 140);
        setCardIndex(nextIdx);
        setRemainingMs(nextLimit);
        remainingRef.current = nextLimit;
        lastTickRef.current = null;
        lockedRef.current = false;
      }, 220);
    },
    [phase, currentCard, combo, cardIndex]
  );

  useEffect(() => {
    if (phase !== 'playing') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = (timestamp: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = timestamp;
      }
      const dt = timestamp - lastTickRef.current;
      lastTickRef.current = timestamp;

      if (!lockedRef.current) {
        const nextRem = Math.max(0, remainingRef.current - dt);
        remainingRef.current = nextRem;
        setRemainingMs(nextRem);

        if (nextRem <= 0) {
          lockedRef.current = true;
          setFatalCard(currentCard);
          setFatalReason(
            `判断時間切れ！暴走した親指が勝手に【${currentCard.recipient}】へ『${currentCard.message}』を自動送信！！`
          );
          setFatalReply(currentCard.leakedReaction);
          setFatalReadText(currentCard.readCountText);
          setPhase('result');
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, currentCard]);

  const cleared =
    phase === 'result' &&
    cardIndex >= MIDNIGHT_DRAFT_DECK.length - 1 &&
    fatalReadText.includes('誤爆 0件');
  const rankInfo = getPoemDefenseRankInfo(score, shreddedCount, cleared);

  const handleShareX = () => {
    const shareText = `【深夜3時の黒歴史ポエム防衛】\n防衛スコア：${score.toLocaleString()}pt（抹殺した黒歴史 ${shreddedCount}件）\n結末：「${fatalReason}」\n称号：【${rankInfo.title}】\n#黒歴史ポエム防衛 #AIGameLab`;
    const shareUrl = window.location.href;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const timerPercent = Math.max(0, Math.min(100, (remainingMs / CARD_TIME_LIMIT_MS) * 100));

  return (
    <div className="relative flex flex-col justify-between h-full w-full max-w-full overflow-hidden select-none touch-manipulation bg-gradient-to-b from-violet-950 via-purple-950 to-slate-950 text-white px-3 py-2.5">
      {/* ZONE 1: Midnight Phone Status Bar */}
      <div className="flex items-center justify-between bg-slate-900/90 border border-violet-500/40 rounded-2xl px-3.5 py-2 shadow-md shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-violet-500/20 border border-violet-400/50 rounded-lg px-2 py-0.5 flex items-center gap-1">
            <Moon className="w-3.5 h-3.5 text-fuchsia-300" />
            <span className="font-mono font-black text-xs text-fuchsia-200">AM 03:14</span>
          </div>
          <span className="text-[11px] font-bold text-violet-200">
            下書き {Math.min(MIDNIGHT_DRAFT_DECK.length, cardIndex + 1)}/{MIDNIGHT_DRAFT_DECK.length}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold text-fuchsia-300 leading-none">
              {combo > 0 ? `${combo} COMBO!` : '抹殺済'}
            </p>
            <p className="text-xs font-black text-white">{shreddedCount} 件</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-violet-300 leading-none">SCORE</p>
            <p className="text-sm font-black text-amber-300">{score.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ZONE 2: Main Messenger Inspection Stage */}
      <div className="flex-1 my-2 flex flex-col justify-between bg-slate-900/90 rounded-2xl border-2 border-violet-500/40 p-3 shadow-inner relative overflow-hidden min-h-0">
        {phase === 'ready' && (
          <div className="flex flex-col items-center justify-between h-full text-center py-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 text-xs font-extrabold">
              📱 深夜の誤爆阻止・超高速2択仕分け
            </div>

            <div className="space-y-2 my-auto">
              <div className="text-4xl">🌙📱💥</div>
              <h1 className="text-xl font-black text-white leading-tight">
                深夜3時の黒歴史ポエム防衛
              </h1>
              <p className="text-xs text-violet-200 font-medium max-w-[300px] mx-auto leading-relaxed">
                時刻は深夜3時！暴走した親指が自動送信してしまう前に、下書きの
                <span className="text-rose-300 font-extrabold">「文面」と「宛先」</span>
                を0.8秒で見極めて仕分けろ！
              </p>

              <div className="grid grid-cols-2 gap-2 text-left max-w-[310px] mx-auto">
                <div className="bg-violet-950/90 border border-cyan-400/50 rounded-xl p-2">
                  <p className="text-[11px] font-black text-cyan-300">🗑️ シュレッダー破棄</p>
                  <p className="text-[10px] text-violet-200">
                    痛すぎる黒歴史ポエム、または宛先が「全社LINE・元恋人」の罠！
                  </p>
                </div>
                <div className="bg-violet-950/90 border border-fuchsia-400/50 rounded-xl p-2">
                  <p className="text-[11px] font-black text-fuchsia-300">📤 そのまま送信</p>
                  <p className="text-[10px] text-violet-200">
                    宛先も内容もまともな「業務連絡・親への感謝・自分用メモ」！
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={startNewGame}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white font-black text-base shadow-lg shadow-fuchsia-900/50 active:scale-[0.98] transition cursor-pointer"
            >
              深夜3時のスマホ防衛開始！
            </button>
          </div>
        )}

        {phase === 'playing' && (
          <div className="flex flex-col justify-between h-full">
            {/* Auto-Send Countdown Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-extrabold">
                <span className="text-rose-300 flex items-center gap-1">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  暴走親指の自動送信まで
                </span>
                <span className="font-mono text-amber-300">
                  {(remainingMs / 1000).toFixed(1)}s
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden border border-violet-500/30">
                <div
                  className={`h-full transition-none ${
                    timerPercent < 35 ? 'bg-rose-500' : 'bg-gradient-to-r from-cyan-400 to-fuchsia-400'
                  }`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>
            </div>

            {/* Draft Message Card with Prominent Recipient Header */}
            <div className="my-auto space-y-2">
              <div
                className={`rounded-xl px-3 py-2 border-2 flex items-center justify-between ${
                  currentCard.recipientBadgeTone === 'danger'
                    ? 'bg-rose-950/90 border-rose-400 text-rose-100 animate-pulse'
                    : 'bg-violet-950/80 border-violet-400/50 text-violet-100'
                }`}
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                    送信先（宛先チェック必須！）
                  </p>
                  <p className="text-xs font-black leading-snug">{currentCard.recipient}</p>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-black/40 border border-white/20 shrink-0">
                  確認中
                </span>
              </div>

              <div className="bg-white text-slate-900 rounded-2xl p-3.5 border-2 border-fuchsia-300 shadow-lg relative">
                <p className="text-[10px] font-extrabold text-slate-400 mb-1">
                  📝 送信寸前のメッセージ本文：
                </p>
                <p className="text-sm font-black leading-relaxed text-slate-900">
                  {currentCard.message}
                </p>
              </div>
            </div>

            {/* Toast / Guidance */}
            <div className="min-h-[32px] flex items-center justify-center text-center">
              {toast ? (
                <p className="text-xs font-black text-cyan-300 bg-cyan-950/70 border border-cyan-400/40 px-3 py-1 rounded-full">
                  {toast}
                </p>
              ) : (
                <p className="text-[11px] font-bold text-violet-300">
                  ⚠️ ヤバいポエム＆誤爆宛先は「破棄」、まともな連絡は「送信」！
                </p>
              )}
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className="flex flex-col justify-between h-full py-0.5">
            {/* Screenshot-Worthy Leaked Chat & Clinical Chart Card */}
            <div className="bg-slate-950 border-2 border-fuchsia-400/60 rounded-2xl p-3 shadow-lg space-y-2">
              <div className="flex items-center justify-between border-b border-violet-800 pb-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-fuchsia-300">
                  {cleared ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <MessageSquareWarning className="w-4 h-4 text-rose-400" />
                  )}
                  <span>{cleared ? '深夜3時・完全防衛カルテ' : '🚨 流出トーク画面 兼 黒歴史カルテ'}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-400 text-[10px] font-black text-fuchsia-200">
                  Rank {rankInfo.rank}
                </span>
              </div>

              <div>
                <p className="text-[10px] font-bold text-violet-300">{rankInfo.mentalDeviation}</p>
                <h2 className="text-sm font-black text-amber-300 leading-snug">
                  【{rankInfo.title}】
                </h2>
              </div>

              {/* Simulated Chat Leak Bubble */}
              <div className="bg-slate-900 rounded-xl p-2.5 border border-violet-700/60 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-rose-300">
                  <span className="truncate">{fatalCard.recipient}</span>
                  <span className="font-mono text-amber-300 shrink-0">{fatalReadText}</span>
                </div>
                <p className="text-[11px] font-bold text-white bg-violet-950/90 border border-violet-600/50 rounded-lg p-2 leading-snug">
                  {fatalReason}
                </p>
                <p className="text-[10px] font-bold text-cyan-200 bg-slate-800 rounded-lg px-2 py-1 leading-snug">
                  💬 {fatalReply}
                </p>
              </div>

              <p className="text-[10px] text-violet-200 font-medium leading-relaxed">
                🩺 診断結果：{rankInfo.diagnosis}
              </p>
            </div>

            {/* Viral Share & Retry Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-2 shrink-0">
              <button
                type="button"
                onClick={handleShareX}
                className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs shadow-md active:scale-[0.98] transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>𝕏 で結果をシェア</span>
              </button>
              <button
                type="button"
                onClick={startNewGame}
                className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white font-black text-xs shadow-md active:scale-[0.98] transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>もう1回深夜に挑む</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ZONE 3: Dual Thumb Sort Buttons */}
      <div className="grid grid-cols-2 gap-2.5 shrink-0">
        <button
          type="button"
          disabled={phase !== 'playing'}
          onClick={() => handleSort('SHRED')}
          className="h-16 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-40 border-2 border-cyan-300 text-white font-black flex flex-col items-center justify-center shadow-md active:scale-95 transition cursor-pointer"
        >
          <span className="text-sm flex items-center gap-1">
            <Trash2 className="w-4 h-4" />
            🗑️ シュレッダー破棄
          </span>
          <span className="text-[10px] font-bold text-cyan-100">
            黒歴史・宛先トラップを抹殺
          </span>
        </button>

        <button
          type="button"
          disabled={phase !== 'playing'}
          onClick={() => handleSort('SEND')}
          className="h-16 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-600 hover:to-pink-700 disabled:opacity-40 border-2 border-pink-300 text-white font-black flex flex-col items-center justify-center shadow-md active:scale-95 transition cursor-pointer"
        >
          <span className="text-sm flex items-center gap-1">
            <Send className="w-4 h-4" />
            📤 そのまま送信！
          </span>
          <span className="text-[10px] font-bold text-pink-100">
            正常な業務連絡・メモのみ
          </span>
        </button>
      </div>
    </div>
  );
}
