import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowDownCircle,
  BellRing,
  RotateCcw,
  Share2,
  Receipt,
  Flame,
  Ruler,
  AlertTriangle,
} from 'lucide-react';
import {
  BurgerIngredient,
  StackedLayer,
  INGREDIENT_CATALOG,
  PERFECT_CENTER_THRESHOLD,
  MAX_SAFE_TILT_DEG,
  evaluateIngredientDrop,
  getBurgerRankInfo,
} from './logic';

export default function IhouKenchikuBurgerGame() {
  const [phase, setPhase] = useState<'ready' | 'playing' | 'result'>('ready');
  const [stack, setStack] = useState<StackedLayer[]>([]);
  const [currentIngredient, setCurrentIngredient] = useState<BurgerIngredient>(
    INGREDIENT_CATALOG[0]
  );
  const [sliderX, setSliderX] = useState(0); // -100 to +100
  const [tiltDeg, setTiltDeg] = useState(0);
  const [score, setScore] = useState(0);
  const [perfectStreak, setPerfectStreak] = useState(0);
  const [deliveredSafely, setDeliveredSafely] = useState(false);
  const [endReason, setEndReason] = useState('');
  const [banner, setBanner] = useState<{ text: string; tone: 'gold' | 'blue' | 'red' } | null>(
    null
  );

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const sliderPosRef = useRef(0);
  const sliderDirRef = useRef<1 | -1>(1);

  const pickIngredient = useCallback((layerIdx: number): BurgerIngredient => {
    return INGREDIENT_CATALOG[layerIdx % INGREDIENT_CATALOG.length];
  }, []);

  const startNewGame = () => {
    setStack([]);
    setCurrentIngredient(pickIngredient(0));
    setSliderX(0);
    sliderPosRef.current = 0;
    sliderDirRef.current = 1;
    setTiltDeg(0);
    setScore(0);
    setPerfectStreak(0);
    setDeliveredSafely(false);
    setEndReason('');
    setBanner(null);
    lastTimeRef.current = null;
    setPhase('playing');
  };

  useEffect(() => {
    if (phase !== 'playing') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const dt = Math.min(0.05, (timestamp - lastTimeRef.current) / 1000);
      lastTimeRef.current = timestamp;

      // Speed increases with stack height
      const speed = 135 + stack.length * 16;
      let nextX = sliderPosRef.current + sliderDirRef.current * speed * dt;
      if (nextX >= 92) {
        nextX = 92;
        sliderDirRef.current = -1;
      } else if (nextX <= -92) {
        nextX = -92;
        sliderDirRef.current = 1;
      }
      sliderPosRef.current = nextX;
      setSliderX(nextX);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, stack.length]);

  const handleDropIngredient = () => {
    if (phase !== 'playing') return;

    const currentX = sliderPosRef.current;
    const outcome = evaluateIngredientDrop(
      currentX,
      currentIngredient,
      tiltDeg,
      stack.length,
      perfectStreak
    );

    if (outcome.collapsed) {
      setTiltDeg(outcome.nextTiltDeg);
      setDeliveredSafely(false);
      setEndReason(outcome.collapseReason || '違法建築タワーが重力に負けて大倒壊！');
      setBanner({ text: outcome.headline, tone: 'red' });
      setPhase('result');
      return;
    }

    const nextStack: StackedLayer[] = [
      ...stack,
      {
        ingredient: currentIngredient,
        offsetX: currentX,
        isPerfectCenter: outcome.isPerfectCenter,
      },
    ];
    setStack(nextStack);
    setTiltDeg(outcome.nextTiltDeg);
    setScore((s) => s + outcome.scoreDelta);
    setPerfectStreak(outcome.isPerfectCenter ? perfectStreak + 1 : 0);
    setBanner({
      text: `${outcome.headline} (+${outcome.scoreDelta}pt)`,
      tone: outcome.isPerfectCenter ? 'gold' : 'blue',
    });
    setCurrentIngredient(pickIngredient(nextStack.length));
  };

  const handleDeliverBurger = () => {
    if (phase !== 'playing' || stack.length === 0) return;

    const totalH = stack.reduce((acc, l) => acc + l.ingredient.heightCm, 8);
    const totalCal = stack.reduce((acc, l) => acc + l.ingredient.calories, 320);
    const deliveryBonus = stack.length * 450 + totalH * 35;

    setScore((s) => s + deliveryBonus);
    setDeliveredSafely(true);
    setEndReason(
      `全${stack.length}段・標高${totalH}cm（総計${totalCal.toLocaleString()}kcal）の違法建築バーガーを倒壊前に上バンズで蓋して無事納品！！`
    );
    setPhase('result');
  };

  const totalHeightCm = stack.reduce((acc, l) => acc + l.ingredient.heightCm, 8);
  const totalCalories = stack.reduce((acc, l) => acc + l.ingredient.calories, 320);
  const totalPriceYen = stack.reduce((acc, l) => acc + l.ingredient.priceYen, 500);
  const rankInfo = getBurgerRankInfo(score, stack.length, totalHeightCm, deliveredSafely);

  const handleShareX = () => {
    const shareText = `【注文の多すぎる違法建築ハンバーガー】\nお会計：${stack.length}段積み / 標高${totalHeightCm}cm（総計 ${totalCalories.toLocaleString()}kcal）\n判定：「${endReason}」\n称号：【${rankInfo.title}】\n#違法建築ハンバーガー #AIGameLab`;
    const shareUrl = window.location.href;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const dangerRatio = Math.min(100, Math.round((Math.abs(tiltDeg) / MAX_SAFE_TILT_DEG) * 100));
  const visibleLayers = stack.slice(-6); // Show top 6 layers inside compact viewport

  return (
    <div className="relative flex flex-col justify-between h-full w-full max-w-full overflow-hidden select-none touch-manipulation bg-gradient-to-b from-sky-100 via-sky-50 to-amber-50 px-3 py-2.5">
      {/* ZONE 1: Diner Signboard Status HUD */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-2xl px-3.5 py-2 shadow-md border-2 border-sky-400 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Ruler className="w-3.5 h-3.5 text-sky-400" />
            <div>
              <p className="text-[9px] font-bold text-sky-300 leading-none">標高 ({stack.length}段)</p>
              <p className="font-mono font-black text-xs text-white">{totalHeightCm} cm</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <p className="text-[9px] font-bold text-amber-300 leading-none">総カロリー</p>
              <p className="font-mono font-black text-xs text-amber-300">
                {totalCalories.toLocaleString()} kcal
              </p>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[9px] font-bold text-sky-300 leading-none">
            傾き {tiltDeg > 0 ? `+${tiltDeg}°` : `${tiltDeg}°`} (限界±{MAX_SAFE_TILT_DEG}°)
          </p>
          <p className="font-mono font-black text-sm text-white">{score.toLocaleString()} pt</p>
        </div>
      </div>

      {/* ZONE 2: Sky Diner Tower Stage */}
      <div className="flex-1 my-2 flex flex-col justify-between bg-white/90 backdrop-blur rounded-2xl border-2 border-sky-300 p-3 shadow-inner relative overflow-hidden min-h-0">
        {phase === 'ready' && (
          <div className="flex flex-col items-center justify-between h-full text-center py-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-900 border border-sky-300 text-xs font-extrabold">
              🍔 物理重心バランス × 利確チキンレース
            </div>

            <div className="space-y-2 my-auto">
              <div className="text-4xl">🍔🦞🍮</div>
              <h1 className="text-xl font-black text-slate-900 leading-tight">
                注文の多すぎる違法建築ハンバーガー
              </h1>
              <p className="text-xs text-slate-600 font-medium max-w-[300px] mx-auto leading-relaxed">
                左右にスイングするカオス具材（肉・伊勢エビ・巨大プリン）を落として高く積み上げろ！
                タワーが倒壊する前に
                <span className="text-amber-700 font-extrabold">「🔔上バンズで蓋して納品」</span>
                を押せばハイスコア利確！
              </p>

              <div className="grid grid-cols-2 gap-2 text-left max-w-[310px] mx-auto">
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-2">
                  <p className="text-[11px] font-black text-amber-800">🎯 ど真ん中マシマシ</p>
                  <p className="text-[10px] text-slate-600">
                    中央（±{PERFECT_CENTER_THRESHOLD}%）に着地させると竹串ロックで傾きが半減！
                  </p>
                </div>
                <div className="bg-sky-50 border border-sky-300 rounded-xl p-2">
                  <p className="text-[11px] font-black text-sky-800">⚖️ カウンターウェイト</p>
                  <p className="text-[10px] text-slate-600">
                    右に傾いたら左側に重い具材を落として重心を立て直せ！
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={startNewGame}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-black text-base shadow-lg shadow-sky-200 active:scale-[0.98] transition cursor-pointer"
            >
              違法建築クッキング開始！
            </button>
          </div>
        )}

        {phase === 'playing' && (
          <div className="flex flex-col justify-between h-full">
            {/* Next Ingredient & Swinging Tong Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between bg-slate-100 rounded-xl px-2.5 py-1.5 border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{currentIngredient.emoji}</span>
                  <div>
                    <p className="text-xs font-black text-slate-900">{currentIngredient.name}</p>
                    <p className="text-[10px] font-bold text-slate-500">{currentIngredient.note}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-black text-sky-700">
                    +{currentIngredient.heightCm}cm / {currentIngredient.calories}kcal
                  </p>
                  <p className="text-[10px] font-mono font-bold text-slate-500">
                    ¥{currentIngredient.priceYen.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Swinging Drop Track (-100 to +100) */}
              <div className="relative h-7 w-full bg-slate-200 rounded-full overflow-hidden border-2 border-slate-300">
                {/* Safe Plate Zone */}
                <div
                  className="absolute top-0 bottom-0 bg-sky-200/70"
                  style={{ left: '11%', width: '78%' }}
                />
                {/* Perfect Center Zone */}
                <div
                  className="absolute top-0 bottom-0 bg-amber-400 border-x-2 border-amber-600"
                  style={{ left: '45.5%', width: '9%' }}
                />
                {/* Moving Ingredient Cursor */}
                <div
                  className="absolute top-0.5 bottom-0.5 w-7 -ml-3.5 rounded-full bg-slate-900 text-white shadow-md flex items-center justify-center text-sm transition-none"
                  style={{ left: `${((sliderX + 100) / 200) * 100}%` }}
                >
                  {currentIngredient.emoji}
                </div>
              </div>
            </div>

            {/* Visual Burger Stack */}
            <div className="my-auto flex flex-col items-center justify-end py-1 overflow-hidden">
              <div
                className="flex flex-col-reverse items-center transition-transform duration-150"
                style={{ transform: `rotate(${tiltDeg}deg)` }}
              >
                {/* Bottom Bun */}
                <div className="w-40 h-5 rounded-b-2xl rounded-t-md bg-amber-500 border-2 border-amber-800 flex items-center justify-center text-[10px] font-black text-amber-950 shadow">
                  🍞 土台バンズ (耐荷重プレート)
                </div>

                {/* Stacked Ingredients (up to last 6 shown visually) */}
                {visibleLayers.map((layer, idx) => (
                  <div
                    key={idx}
                    className={`w-36 h-5 -mb-0.5 rounded-lg border-2 flex items-center justify-between px-2 text-[10px] font-black shadow-sm ${layer.ingredient.colorClass}`}
                    style={{
                      transform: `translateX(${layer.offsetX * 0.45}px)`,
                    }}
                  >
                    <span className="truncate">
                      {layer.ingredient.emoji} {layer.ingredient.name.slice(0, 8)}
                    </span>
                    {layer.isPerfectCenter && <span>🎯</span>}
                  </div>
                ))}
              </div>

              {/* Tilt Warning Meter */}
              <div className="w-full max-w-[260px] mt-2 flex items-center justify-between text-[10px] font-extrabold">
                <span className="text-slate-500">倒壊危険度: {dangerRatio}%</span>
                <span
                  className={
                    dangerRatio >= 65
                      ? 'text-rose-600 font-black animate-pulse'
                      : 'text-emerald-700 font-bold'
                  }
                >
                  {dangerRatio >= 65
                    ? '⚠️ 危険！逆側に置くか今すぐ納品せよ！'
                    : '👍 まだ積めるぞ！'}
                </span>
              </div>
            </div>

            {/* Feedback Banner */}
            <div className="min-h-[30px] flex items-center justify-center">
              {banner ? (
                <div
                  className={`px-3 py-1 rounded-full text-[11px] font-black border ${
                    banner.tone === 'gold'
                      ? 'bg-amber-100 border-amber-400 text-amber-900'
                      : banner.tone === 'red'
                      ? 'bg-rose-100 border-rose-400 text-rose-900'
                      : 'bg-sky-100 border-sky-400 text-sky-900'
                  }`}
                >
                  {banner.text}
                </div>
              ) : (
                <p className="text-[11px] font-bold text-slate-400">
                  真ん中（黄金ゾーン）を狙ってドロップ！危なくなったら右ボタンで納品利確！
                </p>
              )}
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className="flex flex-col justify-between h-full py-0.5">
            {/* Screenshot-Worthy Long Receipt & Health Inspection Notice Card */}
            <div className="bg-white border-y-4 border-dashed border-slate-400 rounded-xl p-3 shadow-md font-mono space-y-1.5 relative">
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-1">
                <div className="flex items-center gap-1 text-xs font-black text-slate-800">
                  <Receipt className="w-4 h-4 text-sky-600" />
                  <span>違法建築ダイナー お会計票</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-sans font-black text-[10px]">
                  Rank {rankInfo.rank}
                </span>
              </div>

              <div className="font-sans">
                <p className="text-[10px] font-bold text-slate-500">【建築称号】</p>
                <h2 className="text-sm font-black text-slate-900 leading-snug">
                  {rankInfo.title}
                </h2>
              </div>

              {/* Receipt Spec Table */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100 rounded-lg p-1.5 text-[11px] text-center font-sans">
                <div>
                  <p className="text-[9px] text-slate-500 font-bold">最終標高</p>
                  <p className="font-black text-sky-700">
                    {totalHeightCm}cm ({stack.length}段)
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 font-bold">総カロリー</p>
                  <p className="font-black text-amber-700">{totalCalories.toLocaleString()}kcal</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 font-bold">請求金額</p>
                  <p className="font-black text-slate-900">¥{totalPriceYen.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 font-sans">
                <p className="text-[10px] font-extrabold text-rose-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {deliveredSafely ? '【納品完了レポート】' : '【倒壊事故レポート】'}
                </p>
                <p className="text-[11px] font-bold text-slate-800 leading-snug mt-0.5">
                  {endReason}
                </p>
                <p className="text-[10px] font-extrabold text-amber-900 mt-1">
                  🚨 {rankInfo.healthNotice}
                </p>
              </div>

              <p className="text-[10px] text-slate-600 font-sans font-medium leading-relaxed">
                💬 保健所寸評：{rankInfo.inspectorComment}
              </p>
            </div>

            {/* Share & Retry Buttons */}
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
                className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs shadow-md shadow-sky-200 active:scale-[0.98] transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>もう1回建築する</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ZONE 3: Bottom 70% Drop / 30% Deliver Thumb Controls */}
      <div className="grid grid-cols-10 gap-2 shrink-0">
        <button
          type="button"
          disabled={phase !== 'playing'}
          onClick={handleDropIngredient}
          className="col-span-6 h-16 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 disabled:opacity-45 border-2 border-rose-300 text-white font-black flex flex-col items-center justify-center shadow-md shadow-rose-200 active:scale-95 transition cursor-pointer"
        >
          <span className="text-sm flex items-center gap-1">
            <ArrowDownCircle className="w-4 h-4" />
            👇 具材を落とす！
          </span>
          <span className="text-[10px] font-bold text-rose-100">
            真ん中狙いで標高＆カロリーUP
          </span>
        </button>

        <button
          type="button"
          disabled={phase !== 'playing' || stack.length === 0}
          onClick={handleDeliverBurger}
          className="col-span-4 h-16 rounded-2xl bg-amber-400 hover:bg-amber-500 disabled:opacity-40 border-2 border-amber-600 text-amber-950 font-black flex flex-col items-center justify-center shadow-md active:scale-95 transition cursor-pointer"
        >
          <span className="text-xs flex items-center gap-1">
            <BellRing className="w-3.5 h-3.5" />
            🔔 上バンズ納品
          </span>
          <span className="text-[10px] font-extrabold text-amber-900">
            倒壊前に利確！
          </span>
        </button>
      </div>
    </div>
  );
}
