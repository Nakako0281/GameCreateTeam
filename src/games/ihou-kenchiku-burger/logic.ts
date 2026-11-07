export interface BurgerIngredient {
  id: string;
  name: string;
  emoji: string;
  heightCm: number;
  calories: number;
  priceYen: number;
  weight: number; // 1.0 = normal, 2.0 = heavy
  slipperiness: number; // 1.0 = normal, 1.5 = slippery
  colorClass: string;
  note: string;
}

export interface StackedLayer {
  ingredient: BurgerIngredient;
  offsetX: number; // -100 to +100
  isPerfectCenter: boolean;
}

export interface DropOutcome {
  collapsed: boolean;
  isPerfectCenter: boolean;
  isCounterweightSave: boolean;
  nextTiltDeg: number;
  scoreDelta: number;
  headline: string;
  collapseReason?: string;
}

export interface BurgerRankInfo {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  title: string;
  healthNotice: string;
  inspectorComment: string;
}

export const INGREDIENT_CATALOG: BurgerIngredient[] = [
  {
    id: 'patty',
    name: '極厚トリプル粗挽きパティ',
    emoji: '🥩',
    heightCm: 6,
    calories: 1450,
    priceYen: 980,
    weight: 1.2,
    slipperiness: 0.9,
    colorClass: 'bg-amber-800 text-amber-100 border-amber-950',
    note: '肉汁過多・安定感◎',
  },
  {
    id: 'cheese',
    name: '雪崩チェダーチーズ4枚重ね',
    emoji: '🧀',
    heightCm: 4,
    calories: 920,
    priceYen: 640,
    weight: 0.9,
    slipperiness: 0.85,
    colorClass: 'bg-amber-400 text-amber-950 border-amber-600',
    note: '粘着力で傾きを抑える',
  },
  {
    id: 'tomato',
    name: 'ツルツル輪切り巨大トマト',
    emoji: '🍅',
    heightCm: 5,
    calories: 180,
    priceYen: 420,
    weight: 1.0,
    slipperiness: 1.45,
    colorClass: 'bg-rose-500 text-white border-rose-700',
    note: '⚠️ 断面が滑りやすい罠食材！',
  },
  {
    id: 'yasai',
    name: '二郎系チョモランマ背脂ヤサイ',
    emoji: '🥬',
    heightCm: 14,
    calories: 2400,
    priceYen: 1200,
    weight: 1.35,
    slipperiness: 1.15,
    colorClass: 'bg-emerald-500 text-emerald-950 border-emerald-700',
    note: '一気に標高が伸びる違法増築パーツ',
  },
  {
    id: 'lobster',
    name: '殻付き丸ごと伊勢エビ',
    emoji: '🦞',
    heightCm: 18,
    calories: 1850,
    priceYen: 6800,
    weight: 1.75,
    slipperiness: 1.25,
    colorClass: 'bg-red-600 text-white border-red-800',
    note: '⚠️ なぜ挟んだ？超高額・重心注意！',
  },
  {
    id: 'pudding',
    name: '純喫茶の特大固めプリン',
    emoji: '🍮',
    heightCm: 12,
    calories: 1600,
    priceYen: 1500,
    weight: 1.3,
    slipperiness: 1.5,
    colorClass: 'bg-yellow-300 text-amber-950 border-amber-700',
    note: '⚠️ プルプル揺れる甘味トラップ！',
  },
  {
    id: 'wagyu',
    name: '国産A5シャトーブリアン塊',
    emoji: '🍖',
    heightCm: 16,
    calories: 3800,
    priceYen: 8900,
    weight: 1.85,
    slipperiness: 1.0,
    colorClass: 'bg-rose-700 text-rose-100 border-rose-950',
    note: '逆側に置けば傾きを引き戻す重量塊！',
  },
];

export const PERFECT_CENTER_THRESHOLD = 9; // |sliderX| <= 9
export const MAX_SAFE_TILT_DEG = 28; // Collapses at >= 28 deg

/**
 * Evaluates dropping an ingredient at sliderX (-100 to +100) onto the current burger tower.
 */
export function evaluateIngredientDrop(
  sliderX: number,
  ingredient: BurgerIngredient,
  currentTiltDeg: number,
  currentLayersCount: number,
  perfectStreak: number
): DropOutcome {
  // Missing the plate entirely
  if (Math.abs(sliderX) > 78) {
    return {
      collapsed: true,
      isPerfectCenter: false,
      isCounterweightSave: false,
      nextTiltDeg: sliderX > 0 ? 45 : -45,
      scoreDelta: 0,
      headline: '😱 皿の外へ豪快にエア投下！！',
      collapseReason: `${currentLayersCount + 1}段目の『${ingredient.name}』がバンズをかすりもせず床へダイブ！`,
    };
  }

  const isPerfectCenter = Math.abs(sliderX) <= PERFECT_CENTER_THRESHOLD;

  // Check if player intentionally placed counterweight on opposite side of serious tilt
  const isCounterweightSave =
    !isPerfectCenter &&
    Math.abs(currentTiltDeg) >= 12 &&
    Math.sign(sliderX) !== Math.sign(currentTiltDeg) &&
    Math.abs(sliderX) <= 45;

  let nextTiltDeg: number;
  if (isPerfectCenter) {
    // Skewers & stabilizes tower by 55%
    nextTiltDeg = Math.round(currentTiltDeg * 0.45 * 10) / 10;
  } else {
    const torque = (sliderX / 3.2) * ingredient.weight * ingredient.slipperiness;
    nextTiltDeg = Math.round((currentTiltDeg + torque) * 10) / 10;
  }

  if (Math.abs(nextTiltDeg) >= MAX_SAFE_TILT_DEG) {
    return {
      collapsed: true,
      isPerfectCenter: false,
      isCounterweightSave: false,
      nextTiltDeg,
      scoreDelta: 0,
      headline: '💥 建築基準法違反で大倒壊！！',
      collapseReason: `欲張った${currentLayersCount + 1}段目の『${ingredient.name}』で傾き${Math.abs(
        Math.round(nextTiltDeg)
      )}度に達し店内雪崩！`,
    };
  }

  const baseScore = ingredient.heightCm * 50 + Math.round(ingredient.calories / 5);
  const perfectBonus = isPerfectCenter ? 800 * (perfectStreak + 1) : 0;
  const saveBonus = isCounterweightSave ? 950 : 0;
  const scoreDelta = baseScore + perfectBonus + saveBonus;

  const headline = isPerfectCenter
    ? '🎯 ど真ん中マシマシ！！（竹串ロックで傾き半減！）'
    : isCounterweightSave
    ? '⚖️ 匠のカウンターウェイト！（逆置きで傾き立て直し！）'
    : `🍔 ${ingredient.name} を増築！`;

  return {
    collapsed: false,
    isPerfectCenter,
    isCounterweightSave,
    nextTiltDeg,
    scoreDelta,
    headline,
  };
}

export function getBurgerRankInfo(
  score: number,
  layersCount: number,
  totalHeightCm: number,
  deliveredSafely: boolean
): BurgerRankInfo {
  if (deliveredSafely && totalHeightCm >= 85 && score >= 8500) {
    return {
      rank: 'S',
      title: 'バベルの肉塊タワー建設者・概念としてのカロリー',
      healthNotice: '保健所＆国土交通省：永久指定重要文化財（喫食不可能）',
      inspectorComment:
        '重力の法則をねじ伏せて成層圏バーガーを無事納品しました！客の顎は外れましたが店主は号泣して喜んでいます。',
    };
  }
  if (deliveredSafely && totalHeightCm >= 45) {
    return {
      rank: 'A',
      title: '建築基準法違反のギルティ・バーガー大魔王',
      healthNotice: '保健所指導：即時営業停止レベルの過積載（最高）',
      inspectorComment:
        '倒壊寸前のスリルを見極めて上バンズで完璧に利確！この背徳感こそ深夜ダイナーの醍醐味です。',
    };
  }
  if (deliveredSafely && layersCount <= 3) {
    return {
      rank: 'C',
      title: '実質マカロン（ビビって即納品した小市民）',
      healthNotice: '保健所判定：健全すぎてSNS映えゼロ',
      inspectorComment:
        '安全第一で3段以内に蓋をしましたね？美味しいですがXのタイムラインでは誰にもツッコまれません！',
    };
  }
  if (score >= 4000 || totalHeightCm >= 35) {
    return {
      rank: 'B',
      title: '顎関節症クラッシャー（どうやって食べるのこれ）',
      healthNotice: '保健所指導：耐震補強用の竹串を30本追加しなさい',
      inspectorComment:
        'いい高さまで積めましたが、最後の欲張り具材がピサの斜塔を超えました。「上バンズ納品」の引き際が勝負です！',
    };
  }
  return {
    rank: 'D',
    title: 'お子様ランチ建築士（店内床のモップ清掃係）',
    healthNotice: '損害賠償請求：食材ロスによりバイト代から天引き',
    inspectorComment:
      '欲張りすぎて高級食材がすべて床へ雪崩れ落ちました。まずは真ん中に落とすイメトレから始めましょう！',
  };
}
