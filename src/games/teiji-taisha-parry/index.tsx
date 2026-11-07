import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  RotateCcw,
  Share2,
  Clock,
  Coffee,
  Sparkles,
  AlertTriangle,
  Briefcase,
} from 'lucide-react';
import {
  BossProjectile,
  PROJECTILE_POOL,
  JUST_PARRY_MIN,
  JUST_PARRY_MAX,
  GOOD_PARRY_MIN,
  GOOD_PARRY_MAX,
  advanceProjectileProgress,
  evaluatePlayerAction,
  evaluateTimeoutAtPlayer,
  getTeijiRankInfo,
} from './logic';

const TOTAL_WAVES = 8;
const INITIAL_HP = 3;

export default function TeijiTaishaParryGame() {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready');
  const [waveIndex, setWaveIndex] = useState(0);
  const [currentProjectile, setCurrentProjectile] = useState<BossProjectile>(PROJECTILE_POOL[0]);
  const [progress, setProgress] = useState(0);
  const [hp, setHp] = useState(INITIAL_HP);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [justParryCount, setJustParryCount] = useState(0);
  const [overtimeMinutes, setOvertimeMinutes] = useState(0);
  const [lastCauseOfDeath, setLastCauseOfDeath] = useState(
    '18:00:00ジャスト！風圧でオフィスの自動ドアを粉砕し完全定時退社達成！'
  );
  const [feedbackBanner, setFeedbackBanner] = useState<{
    headline: string;
    counterText?: string;
    tone: 'gold' | 'green' | 'red';
  } | null>(null);
  const [goldenFlash, setGoldenFlash] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const resolvedWaveRef = useRef(false);

  const pickNextProjectile = useCallback((nextWave: number): BossProjectile => {
    const idx = nextWave % PROJECTILE_POOL.length;
    return PROJECTILE_POOL[idx];
  }, []);

  const startNewGame = () => {
    const first = pickNextProjectile(0);
    setWaveIndex(0);
    setCurrentProjectile(first);
    setProgress(0);
    progressRef.current = 0;
    resolvedWaveRef.current = false;
    setHp(INITIAL_HP);
    setScore(0);
    setCombo(0);
    setJustParryCount(0);
    setOvertimeMinutes(0);
    setLastCauseOfDeath('18:00:00ジャスト！風圧でオフィスの自動ドアを粉砕し完全定時退社達成！');
    setFeedbackBanner(null);
    setGoldenFlash(false);
    lastTickRef.current = null;
    setPhase('playing');
  };

  const advanceToNextWaveOrFinish = useCallback(
    (nextHp: number, nextWaveIdx: number, deathReason?: string) => {
      if (nextHp <= 0) {
        if (deathReason) setLastCauseOfDeath(deathReason);
        setPhase('result');
        return;
      }
      if (nextWaveIdx >= TOTAL_WAVES) {
        setLastCauseOfDeath('18:00:00ジャスト！風圧でオフィスの自動ドアを粉砕し完全定時退社達成！');
        setPhase('result');
        return;
      }

      const nextProj = pickNextProjectile(nextWaveIdx);
      setWaveIndex(nextWaveIdx);
      setCurrentProjectile(nextProj);
      setProgress(0);
      progressRef.current = 0;
      resolvedWaveRef.current = false;
      lastTickRef.current = null;
    },
    [pickNextProjectile]
  );

  const handleAction = useCallback(
    (action: 'PARRY' | 'BOW') => {
      if (phase !== 'playing' || resolvedWaveRef.current) return;
      resolvedWaveRef.current = true;

      const evalResult = evaluatePlayerAction(
        action,
        currentProjectile,
        progressRef.current,
        combo
      );

      const nextHp = Math.max(0, hp + evalResult.hpDelta);
      const nextScore = score + evalResult.scoreDelta;
      setHp(nextHp);
      setScore(nextScore);

      if (evalResult.outcome === 'JUST_PARRY') {
        setCombo((c) => c + 1);
        setJustParryCount((j) => j + 1);
        setGoldenFlash(true);
        setTimeout(() => setGoldenFlash(false), 260);
        setFeedbackBanner({
          headline: evalResult.headline,
          counterText: evalResult.counterText,
          tone: 'gold',
        });
      } else if (evalResult.outcome === 'GOOD_PARRY' || evalResult.outcome === 'SAFE_RECEIVED') {
        setCombo((c) => c + 1);
        setFeedbackBanner({
          headline: evalResult.headline,
          counterText: evalResult.counterText,
          tone: 'green',
        });
      } else {
        setCombo(0);
        setOvertimeMinutes((m) => m + Math.max(120, currentProjectile.overtimePenaltyMinutes));
        setLastCauseOfDeath(evalResult.detail);
        setFeedbackBanner({
          headline: evalResult.headline,
          counterText: evalResult.detail,
          tone: 'red',
        });
      }

      setTimeout(() => {
        advanceToNextWaveOrFinish(nextHp, waveIndex + 1, evalResult.detail);
      }, 340);
    },
    [phase, currentProjectile, combo, hp, score, waveIndex, advanceToNextWaveOrFinish]
  );

  useEffect(() => {
    if (phase !== 'playing') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const step = (timestamp: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = timestamp;
      }
      const dt = Math.min(0.05, (timestamp - lastTickRef.current) / 1000);
      lastTickRef.current = timestamp;

      if (!resolvedWaveRef.current) {
        const speedScale = 1 + waveIndex * 0.06;
        const nextP = advanceProjectileProgress(
          progressRef.current,
          currentProjectile,
          dt,
          speedScale
        );
        progressRef.current = nextP;
        setProgress(nextP);

        if (nextP >= 100) {
          resolvedWaveRef.current = true;
          const timeoutEval = evaluateTimeoutAtPlayer(currentProjectile, combo);
          const nextHp = Math.max(0, hp + timeoutEval.hpDelta);
          setHp(nextHp);
          setScore((s) => s + timeoutEval.scoreDelta);

          if (timeoutEval.hpDelta < 0) {
            setCombo(0);
            setOvertimeMinutes((m) => m + currentProjectile.overtimePenaltyMinutes);
            setLastCauseOfDeath(timeoutEval.detail);
            setFeedbackBanner({
              headline: timeoutEval.headline,
              counterText: timeoutEval.detail,
              tone: 'red',
            });
          } else {
            setCombo((c) => c + 1);
            setFeedbackBanner({
              headline: timeoutEval.headline,
              tone: 'green',
            });
          }

          setTimeout(() => {
            advanceToNextWaveOrFinish(nextHp, waveIndex + 1, timeoutEval.detail);
          }, 340);
          return;
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, waveIndex, currentProjectile, combo, hp, advanceToNextWaveOrFinish]);

  const cleared = phase === 'result' && hp > 0 && waveIndex >= TOTAL_WAVES - 1;
  const rankInfo = getTeijiRankInfo(score, cleared, justParryCount, overtimeMinutes);

  const clockSeconds = Math.min(59, Math.floor((waveIndex / TOTAL_WAVES) * 60 + (progress / 100) * 7));
  const clockFormatted = cleared ? '18:00:00' : `17:59:${String(clockSeconds).padStart(2, '0')}`;

  const handleShareX = () => {
    const shareText = `【17:59 定時退社パリィ！】\n打刻時刻：${rankInfo.clockOutTime}\nスコア：${score.toLocaleString()}pt（ジャストパリィ ${justParryCount}回）\n死因/結末：「${lastCauseOfDeath}」\n称号：【${rankInfo.title}】\n#定時退社パリィ #AIGameLab`;
    const shareUrl = window.location.href;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const isBonus = currentProjectile.kind === 'safe_bonus';
  const inSweetSpot = progress >= JUST_PARRY_MIN && progress <= JUST_PARRY_MAX;
  const inGoodSpot = progress >= GOOD_PARRY_MIN && progress <= GOOD_PARRY_MAX;

  return (
    <div className="relative flex flex-col justify-between h-full w-full max-w-full overflow-hidden select-none touch-manipulation bg-gradient-to-b from-emerald-50 via-amber-50/60 to-orange-100 px-3 py-2.5">
      {/* Golden flash overlay on JUST PARRY */}
      {goldenFlash && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-amber-300/45 flex items-center justify-center animate-pulse">
          <div className="bg-slate-900 text-amber-300 font-black text-base px-4 py-2 rounded-full border-2 border-amber-400 shadow-xl -rotate-3">
            ⚡ 有給スタンプ論破！！ JUST PARRY!! ⚡
          </div>
        </div>
      )}

      {/* ZONE 1: Top Office Clock & Stamina HUD */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-2xl px-3.5 py-2 shadow-md border border-emerald-500/40 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/20 border border-emerald-400 rounded-lg px-2 py-0.5 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono font-black text-sm text-emerald-300 tracking-wider">
              {clockFormatted}
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-300">
            Wave {Math.min(TOTAL_WAVES, waveIndex + 1)}/{TOTAL_WAVES}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-0.5" aria-label="メンタルHP">
            {Array.from({ length: INITIAL_HP }).map((_, i) => (
              <Coffee
                key={i}
                className={`w-4 h-4 ${
                  i < hp ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                }`}
              />
            ))}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-emerald-300 font-bold leading-none">
              {combo > 0 ? `${combo} COMBO!` : 'SCORE'}
            </p>
            <p className="font-black text-sm leading-tight text-white">
              {score.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ZONE 2: Main Battle / Ready / Result Stage */}
      <div className="flex-1 my-2 flex flex-col justify-between bg-white/90 backdrop-blur rounded-2xl border-2 border-emerald-200 p-3 shadow-inner relative overflow-hidden min-h-0">
        {phase === 'ready' && (
          <div className="flex flex-col items-center justify-between h-full text-center py-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
              🏃‍♂️ 定時退社ジャストパリィ・アクション
            </div>

            <div className="space-y-1.5 my-auto">
              <div className="text-4xl">🏢⚡💼</div>
              <h1 className="text-xl font-black text-slate-900 leading-tight">
                17:59 定時退社パリィ！
              </h1>
              <p className="text-xs text-slate-600 font-medium max-w-[290px] mx-auto leading-relaxed">
                時計は17時59分！飛んでくる上司の無茶振り弾を黄金サークル（78〜93%）まで引きつけて
                <span className="font-extrabold text-emerald-700">「定時パリィ」</span>で倍返しせよ！
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-left max-w-[310px] mx-auto">
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                  <p className="text-[11px] font-black text-rose-700">🚨 赤・紫の無茶振り弾</p>
                  <p className="text-[10px] text-slate-600">
                    黄金枠に重なった瞬間に「⚡定時パリィ」で撃破！
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                  <p className="text-[11px] font-black text-emerald-700">✨ 緑のボーナス・挨拶弾</p>
                  <p className="text-[10px] text-slate-600">
                    弾くと人事部行き！「🙇お辞儀スルー」で受け取れ！
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={startNewGame}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-base shadow-lg shadow-emerald-200 active:scale-[0.98] transition cursor-pointer"
            >
              17:59 退勤バトル開始！
            </button>
          </div>
        )}

        {phase === 'playing' && (
          <div className="flex flex-col justify-between h-full">
            {/* Boss Sender Header */}
            <div className="flex items-center justify-between bg-slate-100 rounded-xl px-3 py-1.5 border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{currentProjectile.senderEmoji}</span>
                <div>
                  <p className="text-xs font-black text-slate-800">{currentProjectile.sender}</p>
                  <p className="text-[10px] font-bold text-slate-500">{currentProjectile.subText}</p>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isBonus
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : currentProjectile.kind === 'hazard_feint'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {isBonus
                  ? '🎁 緑弾：お辞儀で受取！'
                  : currentProjectile.kind === 'hazard_feint'
                  ? '⚠️ フェイント減速弾'
                  : '🔥 無茶振り攻撃弾'}
              </span>
            </div>

            {/* Incoming Projectile Track & Sweet Spot Ring */}
            <div className="my-auto space-y-2 py-1">
              <div
                className={`rounded-2xl p-3 border-2 shadow-md transition-transform ${
                  isBonus
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    : 'bg-rose-50 border-rose-400 text-rose-950'
                }`}
              >
                <p className="text-sm font-black leading-snug text-center">
                  {currentProjectile.text}
                </p>
              </div>

              {/* Timing Gauge Bar (0% Boss -> 85% Golden Sweet Spot -> 100% Player) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-extrabold text-slate-500 px-1">
                  <span>👔 上司から発射</span>
                  <span className="text-amber-600 font-black">
                    ⚡ 黄金パリィ枠 ({JUST_PARRY_MIN}〜{JUST_PARRY_MAX}%)
                  </span>
                  <span>🏃‍♂️ 自席</span>
                </div>

                <div className="relative h-7 w-full bg-slate-200 rounded-full overflow-hidden border-2 border-slate-300">
                  {/* Good zone */}
                  <div
                    className="absolute top-0 bottom-0 bg-emerald-300/60"
                    style={{
                      left: `${GOOD_PARRY_MIN}%`,
                      width: `${GOOD_PARRY_MAX - GOOD_PARRY_MIN}%`,
                    }}
                  />
                  {/* Just Parry Golden Sweet Spot */}
                  <div
                    className="absolute top-0 bottom-0 bg-amber-400 border-x-2 border-amber-600 animate-pulse"
                    style={{
                      left: `${JUST_PARRY_MIN}%`,
                      width: `${JUST_PARRY_MAX - JUST_PARRY_MIN}%`,
                    }}
                  />
                  {/* Projectile Marker */}
                  <div
                    className={`absolute top-0.5 bottom-0.5 w-5 -ml-2.5 rounded-full shadow-md flex items-center justify-center text-xs font-black transition-none ${
                      isBonus ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                    style={{ left: `${progress}%` }}
                  >
                    {isBonus ? '🎁' : '💥'}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-extrabold px-1">
                  <span className="text-slate-600">
                    接近率: <strong className="font-mono">{Math.round(progress)}%</strong>
                  </span>
                  <span
                    className={
                      inSweetSpot
                        ? 'text-amber-600 font-black animate-bounce'
                        : inGoodSpot
                        ? 'text-emerald-600 font-bold'
                        : 'text-slate-400'
                    }
                  >
                    {isBonus
                      ? '👉 [🙇 お辞儀スルー] をタップ！'
                      : inSweetSpot
                      ? '⚡ 今だ！JUST PARRY！！'
                      : inGoodSpot
                      ? '🛡️ ガード圏内！'
                      : '⏳ 引きつけろ…'}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Feedback Banner */}
            <div className="min-h-[42px] flex items-center justify-center">
              {feedbackBanner ? (
                <div
                  className={`w-full rounded-xl px-3 py-1.5 text-center border font-extrabold text-xs ${
                    feedbackBanner.tone === 'gold'
                      ? 'bg-amber-100 border-amber-400 text-amber-900'
                      : feedbackBanner.tone === 'green'
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                      : 'bg-rose-100 border-rose-400 text-rose-900'
                  }`}
                >
                  <p>{feedbackBanner.headline}</p>
                  {feedbackBanner.counterText && (
                    <p className="text-[10px] opacity-85 truncate">{feedbackBanner.counterText}</p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] font-bold text-slate-400">
                  無茶振りは引きつけてパリィ！緑のボーナスはお辞儀で受取！
                </p>
              )}
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className="flex flex-col justify-between h-full py-0.5">
            {/* Screenshot-Worthy Timecard & Corporate Assessment Card */}
            <div className="bg-amber-50/95 border-2 border-stone-300 rounded-2xl p-3 shadow-md relative overflow-hidden">
              {/* Red Stamp */}
              <div className="absolute right-2.5 top-2.5 rotate-[-12deg] border-2 border-rose-600 text-rose-600 bg-white/90 px-2 py-0.5 rounded-md font-black text-xs shadow-sm">
                {rankInfo.stampText}・Rank {rankInfo.rank}
              </div>

              <div className="flex items-center gap-1.5 text-[10px] font-black text-stone-500 uppercase tracking-wider border-b border-stone-300 pb-1">
                <Briefcase className="w-3.5 h-3.5 text-emerald-700" />
                <span>退勤タイムカード 兼 社畜査定通知書</span>
              </div>

              <div className="mt-2 space-y-1.5">
                <div>
                  <p className="text-[10px] font-bold text-stone-500">【授与称号】</p>
                  <h2 className="text-sm font-black text-slate-900 leading-snug">
                    {rankInfo.title}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-1.5 bg-white rounded-xl p-2 border border-stone-200 text-xs">
                  <div>
                    <p className="text-[10px] text-stone-500 font-bold">打刻時刻</p>
                    <p className="font-mono font-black text-emerald-700">{rankInfo.clockOutTime}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-stone-500 font-bold">査定スコア / JUST数</p>
                    <p className="font-mono font-black text-slate-900">
                      {score.toLocaleString()}pt ({justParryCount}回)
                    </p>
                  </div>
                </div>

                <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-2">
                  <p className="text-[10px] font-extrabold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {cleared ? '【退社達成ログ】' : '【残業確定の直接死因】'}
                  </p>
                  <p className="text-[11px] font-bold text-slate-800 leading-snug mt-0.5">
                    {lastCauseOfDeath}
                  </p>
                </div>

                <p className="text-[10px] text-stone-600 font-medium leading-relaxed">
                  💬 総務部寸評：{rankInfo.comment}
                </p>
              </div>
            </div>

            {/* Viral Share & Retry Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-2 shrink-0">
              <button
                type="button"
                onClick={handleShareX}
                className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-md active:scale-[0.98] transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>𝕏 で結果をシェア</span>
              </button>
              <button
                type="button"
                onClick={startNewGame}
                className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs shadow-md shadow-emerald-200 active:scale-[0.98] transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>もう1回定時に挑む</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ZONE 3: Bottom Thumb Controls */}
      <div className="grid grid-cols-2 gap-2.5 shrink-0">
        <button
          type="button"
          disabled={phase !== 'playing'}
          onClick={() => handleAction('BOW')}
          className="h-16 rounded-2xl bg-emerald-100 hover:bg-emerald-200 disabled:opacity-45 border-2 border-emerald-400 text-emerald-950 font-black flex flex-col items-center justify-center shadow-sm active:scale-95 transition cursor-pointer"
        >
          <span className="text-sm flex items-center gap-1">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            🙇 お辞儀スルー
          </span>
          <span className="text-[10px] font-bold text-emerald-700">
            緑のボーナス・挨拶を受取
          </span>
        </button>

        <button
          type="button"
          disabled={phase !== 'playing'}
          onClick={() => handleAction('PARRY')}
          className="h-16 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-45 border-2 border-amber-300 text-white font-black flex flex-col items-center justify-center shadow-md shadow-orange-200 active:scale-95 transition cursor-pointer"
        >
          <span className="text-base flex items-center gap-1">
            <Zap className="w-4 h-4 fill-white" />
            ⚡ 定時パリィ！
          </span>
          <span className="text-[10px] font-bold text-amber-100">
            無茶振り弾を有給届で反射
          </span>
        </button>
      </div>
    </div>
  );
}
