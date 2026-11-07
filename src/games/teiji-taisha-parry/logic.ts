export type ProjectileKind = 'hazard_normal' | 'hazard_feint' | 'hazard_fast' | 'safe_bonus';

export interface BossProjectile {
  id: string;
  kind: ProjectileKind;
  sender: string;
  senderEmoji: string;
  text: string;
  subText: string;
  baseSpeed: number; // progress per second (0 to 100)
  overtimePenaltyMinutes: number; // 0 for bonus
}

export type ParryOutcomeType =
  | 'JUST_PARRY'
  | 'GOOD_PARRY'
  | 'SAFE_RECEIVED'
  | 'WRONG_PARRY_BONUS'
  | 'MISSED_HAZARD';

export interface ParryEvaluation {
  outcome: ParryOutcomeType;
  scoreDelta: number;
  hpDelta: number;
  headline: string;
  detail: string;
  counterText?: string;
}

export interface TeijiRankInfo {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  title: string;
  stampText: string;
  clockOutTime: string;
  comment: string;
}

export const PROJECTILE_POOL: BossProjectile[] = [
  {
    id: 'p1',
    kind: 'hazard_normal',
    sender: '残業大好き課長',
    senderEmoji: '👔',
    text: '「あ、帰る前に1個だけいい？」',
    subText: '推定拘束：2時間30分',
    baseSpeed: 62,
    overtimePenaltyMinutes: 150,
  },
  {
    id: 'p2',
    kind: 'hazard_feint',
    sender: '優柔不断ディレクター',
    senderEmoji: '🤓',
    text: '「急ぎじゃないんだけど…やっぱり今日中で！」',
    subText: '手前で減速→急加速フェイント弾',
    baseSpeed: 68,
    overtimePenaltyMinutes: 210,
  },
  {
    id: 'p3',
    kind: 'safe_bonus',
    sender: '仏の経理部長',
    senderEmoji: '👼',
    text: '「お疲れ！大入り寸志ボーナス支給！」',
    subText: '【緑弾】パリィ厳禁！お辞儀で受け取れ！',
    baseSpeed: 60,
    overtimePenaltyMinutes: 0,
  },
  {
    id: 'p4',
    kind: 'hazard_fast',
    sender: '鬼の専務',
    senderEmoji: '👹',
    text: '「仕様書は今から作る！朝までに実装しろ！」',
    subText: '超高速レーザー案件',
    baseSpeed: 88,
    overtimePenaltyMinutes: 480,
  },
  {
    id: 'p5',
    kind: 'hazard_normal',
    sender: '飲みニケーション部長',
    senderEmoji: '🍺',
    text: '「今日無礼講だから朝まで語ろうぜ！」',
    subText: '実質サービス残業＋説教コース',
    baseSpeed: 66,
    overtimePenaltyMinutes: 300,
  },
  {
    id: 'p6',
    kind: 'safe_bonus',
    sender: '神の総務さん',
    senderEmoji: '✨',
    text: '「有給消化100%承認スタンプ進呈！」',
    subText: '【緑弾】弾くな危険！お辞儀でスルーせよ！',
    baseSpeed: 64,
    overtimePenaltyMinutes: 0,
  },
  {
    id: 'p7',
    kind: 'hazard_feint',
    sender: 'ちゃぶ台返しクライアント',
    senderEmoji: '📱',
    text: '「デザイン最高！でも1案目の前に戻して！」',
    subText: 'フェイント変化球・全ボツ案件',
    baseSpeed: 74,
    overtimePenaltyMinutes: 360,
  },
  {
    id: 'p8',
    kind: 'hazard_fast',
    sender: '最終防衛ライン社長',
    senderEmoji: '👑',
    text: '「日曜の早朝ゴルフ接待、君が幹事ね！」',
    subText: '休日消滅の必殺弾',
    baseSpeed: 94,
    overtimePenaltyMinutes: 600,
  },
];

// Sweet spot constants (progress goes 0 -> 100)
export const JUST_PARRY_MIN = 78;
export const JUST_PARRY_MAX = 93;
export const GOOD_PARRY_MIN = 64;
export const GOOD_PARRY_MAX = 97;

/**
 * Calculates projectile progress delta for a given dt (seconds),
 * applying a dramatic slowdown-then-surge curve for `hazard_feint`.
 */
export function advanceProjectileProgress(
  currentProgress: number,
  projectile: BossProjectile,
  dtSeconds: number,
  speedScale = 1
): number {
  let multiplier = 1;
  if (projectile.kind === 'hazard_feint') {
    if (currentProgress >= 42 && currentProgress < 64) {
      multiplier = 0.35; // dramatic pause before strike
    } else if (currentProgress >= 64) {
      multiplier = 1.65; // sudden lunge
    }
  } else if (projectile.kind === 'hazard_fast') {
    multiplier = 1.18;
  }

  const next = currentProgress + projectile.baseSpeed * multiplier * speedScale * dtSeconds;
  return Math.min(100, Math.max(0, next));
}

/**
 * Evaluates player action ('PARRY' | 'BOW') at a given projectile progress.
 */
export function evaluatePlayerAction(
  action: 'PARRY' | 'BOW',
  projectile: BossProjectile,
  progress: number,
  currentCombo: number
): ParryEvaluation {
  const comboBonus = Math.min(3.0, 1 + currentCombo * 0.15);

  if (projectile.kind === 'safe_bonus') {
    if (action === 'BOW') {
      return {
        outcome: 'SAFE_RECEIVED',
        scoreDelta: Math.round(700 * comboBonus),
        hpDelta: 0,
        headline: '🙇 華麗にお辞儀受取！！',
        detail: `${projectile.text} を笑顔で懐に収めた！`,
        counterText: '定時退社ボーナス確定！',
      };
    }
    return {
      outcome: 'WRONG_PARRY_BONUS',
      scoreDelta: 0,
      hpDelta: -1,
      headline: '💥 狂気のボーナス粉砕！！',
      detail: `${projectile.sender}の善意『${projectile.text}』をアタッシュケースで物理粉砕してしまい人事部呼び出し！`,
    };
  }

  // Hazard projectile
  if (action === 'BOW') {
    return {
      outcome: 'MISSED_HAZARD',
      scoreDelta: 0,
      hpDelta: -1,
      headline: '😱 笑顔で残業を拝命！！',
      detail: `${projectile.text} に元気よく「喜んで！！」とお辞儀してしまい無事拘束！`,
    };
  }

  // Action === 'PARRY' on hazard
  if (progress >= JUST_PARRY_MIN && progress <= JUST_PARRY_MAX) {
    return {
      outcome: 'JUST_PARRY',
      scoreDelta: Math.round(1200 * comboBonus),
      hpDelta: 0,
      headline: '⚡ 定時ジャストパリィ！！',
      detail: '有給申請スタンプで無茶振りを上司の顔面へ倍返し！！',
      counterText: '「労働基準法第32条により却下ァ！！」',
    };
  }

  if (progress >= GOOD_PARRY_MIN && progress <= GOOD_PARRY_MAX) {
    return {
      outcome: 'GOOD_PARRY',
      scoreDelta: Math.round(500 * comboBonus),
      hpDelta: 0,
      headline: '🛡️ ギリギリ退勤ガード！',
      detail: 'カバンで弾いたが衝撃で少し体勢が崩れた！',
      counterText: '「あ、今エレベーター閉まるんで！」',
    };
  }

  return {
    outcome: 'MISSED_HAZARD',
    scoreDelta: 0,
    hpDelta: -1,
    headline: '💀 早漏空振りからの直撃！！',
    detail: `パリィが早すぎて空振りした隙に『${projectile.text}』をモロに被弾！`,
  };
}

/**
 * Evaluates when a projectile reaches progress === 100 without player input.
 */
export function evaluateTimeoutAtPlayer(
  projectile: BossProjectile,
  currentCombo: number
): ParryEvaluation {
  const comboBonus = Math.min(3.0, 1 + currentCombo * 0.15);
  if (projectile.kind === 'safe_bonus') {
    return {
      outcome: 'SAFE_RECEIVED',
      scoreDelta: Math.round(550 * comboBonus),
      hpDelta: 0,
      headline: '✨ ボーナス無事受取！',
      detail: `${projectile.text} をしっかり受け取った！`,
    };
  }

  return {
    outcome: 'MISSED_HAZARD',
    scoreDelta: 0,
    hpDelta: -1,
    headline: '😭 17:59 無茶振り直撃！！',
    detail: `${projectile.sender}の『${projectile.text}』をガードし損ねてデスクへ強制連行！`,
  };
}

export function getTeijiRankInfo(
  score: number,
  cleared: boolean,
  justParryCount: number,
  totalOvertimeMinutes: number
): TeijiRankInfo {
  if (cleared && justParryCount >= 5 && score >= 7500) {
    return {
      rank: 'S',
      title: '労働基準法の化身・伝説の定時退社神',
      stampText: '定時神承認',
      clockOutTime: '18:00.00 (残業 0分)',
      comment: '風圧でオフィスの自動ドアを粉砕し、18時00分00秒に改札を突破しました。上司は気絶しています。',
    };
  }
  if (cleared && score >= 4500) {
    return {
      rank: 'A',
      title: '残業ゼロの閃光（風を切って帰る者）',
      stampText: '定時退社済',
      clockOutTime: '18:00.04 (残業 0分)',
      comment: '飛んでくる仕様変更をすべて有給届で弾き返し、無傷でエレベーターへ滑り込みました！',
    };
  }
  if (cleared || score >= 2800) {
    const hours = Math.floor(totalOvertimeMinutes / 60);
    const mins = totalOvertimeMinutes % 60;
    return {
      rank: 'B',
      title: '18時15分の男（エレベーター待ちで微敗北）',
      stampText: '微残業承認',
      clockOutTime: cleared ? '18:01.12' : `20:${String(mins).padStart(2, '0')} (残業 ${hours}時間)`,
      comment: 'あと一歩で完全定時でしたが、帰りがけの雑談トラップに5分捕まりました。惜しい！',
    };
  }
  if (score >= 1000) {
    return {
      rank: 'C',
      title: '定時退社見習い（まだ愛想笑いが残っている）',
      stampText: '終電コース',
      clockOutTime: '23:45 (最終電車ギリギリ)',
      comment: '「あ、やっときます…」と小声で頷いてしまった瞬間、あなたの華金は消滅しました。',
    };
  }
  return {
    rank: 'D',
    title: '社畜界のサンドバッグ（今夜もオフィス泊）',
    stampText: '徹夜確定印',
    clockOutTime: '翌 04:30 (始発待ち)',
    comment: '17時59分58秒の「ちょっと1個だけ」を顔面で受け止め、蛍光灯の下で朝を迎えました。',
  };
}
