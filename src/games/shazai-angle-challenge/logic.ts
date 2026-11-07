export interface ScandalPrompt {
  id: string
  incident: string
  reporterHeckle: string
}

export interface RoundConfig {
  roundNumber: 1 | 2 | 3
  title: string
  subtitle: string
  targetAngle: number
  /** 長押し中の角加速度 (deg / sec^2) */
  accelPerSec2: number
  /** 初速 (deg / sec) */
  initialVelocityPerSec: number
  /** 指を離した後のブレーキ減速度 (deg / sec^2) */
  brakeDecelPerSec2: number
  /** フラッシュ目くらましが始まる角度（nullなら目くらましなし） */
  flashBlindStartAngle: number | null
  /** 90度超えで重力加速するか */
  hasGravityBoostAfter90: boolean
}

export type RoundGrade =
  | 'miracle' // 誤差 0.5° 以内
  | 'perfect' // 誤差 2.0° 以内
  | 'great' // 誤差 5.0° 以内
  | 'safe' // 誤差 12.0° 以内
  | 'escape_accident' // 3° 未満の即逃亡
  | 'defiant_accident' // 20° 未満の仁王立ち逆ギレ
  | 'shallow_accident' // 目標より大幅に浅い煽り会釈
  | 'mic_crash_accident' // 目標を12°〜25°オーバーしてマイク強打
  | 'floor_drill_accident' // 145°〜185° 床めり込み
  | 'mantle_accident' // 185°〜260° マントル・ブラジル貫通
  | 'windmill_accident' // 260° 以上 大回転ブレイクダンス

export interface RoundRecord {
  roundNumber: 1 | 2 | 3
  targetAngle: number
  stoppedAngle: number
  diff: number
  absDiff: number
  grade: RoundGrade
  isAccident: boolean
  roundComment: string
}

export interface FinalPressResult {
  isClearedAllRounds: boolean
  stampLabel: string
  stampTone: 'gold' | 'emerald' | 'rose' | 'violet'
  headline: string
  titleBadge: string
  causeOfDeathOrFeat: string
  reporterCommentary: string
  viralRepostText: string
  sincerityScore: number
  highlightAngle: number
}

export const SCANDAL_PROMPTS: readonly ScandalPrompt[] = [
  {
    id: 'pudding',
    incident: '会社の冷蔵庫の「名前入りプリン」を無断で完食した件',
    reporterHeckle: '「名前が書いてあったのに食べたんですか！？」',
  },
  {
    id: 'anison',
    incident: '全体オンライン会議中、ミュート忘れでアニソンを熱唱した件',
    reporterHeckle: '「サビの高音、全社員350人に届いてましたよ！！」',
  },
  {
    id: 'nyan',
    incident: '上司へのメール末尾に「よろしくにゃん♡」と誤送信した件',
    reporterHeckle: '「どのテンションで『にゃん♡』と打ったんですか！？」',
  },
  {
    id: 'futon',
    incident: '「あと5分で着く」とLINEした瞬間、まだ布団の中だった件',
    reporterHeckle: '「物理的にワープでもするつもりだったんですか！？」',
  },
  {
    id: 'elevator',
    incident: 'エレベーターで「開」を押すフリをして「閉」を連打した件',
    reporterHeckle: '「走ってきた部長と目が合ってましたよね！？」',
  },
  {
    id: 'yakiniku',
    incident: '焼肉の網の上で「他人が育てていたカルビ」を横取りした件',
    reporterHeckle: '「一番美味しい瞬間を狙って奪いましたよね！？」',
  },
  {
    id: 'diet',
    incident: '「ダイエットは明日から」と宣言し3年連続で大盛りを頼んだ件',
    reporterHeckle: '「あなたの『明日』はいつ到来するんですか！？」',
  },
  {
    id: 'mama',
    incident: '取引先の部長に「ママ、今日のご飯なに？」と誤爆した件',
    reporterHeckle: '「部長から『唐揚げだよ』と返信が来たそうですが！？」',
  },
  {
    id: 'oshi',
    incident: '有給休暇の申請理由に「推しの尊さが限界突破したため」と書いた件',
    reporterHeckle: '「総務部がざわついていますが反省していますか！？」',
  },
  {
    id: 'cupmen',
    incident: '会社のウォーターサーバーでカップ麺に給湯し続けた件',
    reporterHeckle: '「お湯が空っぽになった責任をどう取るんですか！？」',
  },
]

export const ROUNDS: readonly RoundConfig[] = [
  {
    roundNumber: 1,
    title: '第1問：釈明の礼',
    subtitle: 'まずは基本の45°で誠意を見せろ！',
    targetAngle: 45.0,
    accelPerSec2: 115,
    initialVelocityPerSec: 38,
    brakeDecelPerSec2: 260,
    flashBlindStartAngle: null,
    hasGravityBoostAfter90: false,
  },
  {
    roundNumber: 2,
    title: '第2問：核心の深謝',
    subtitle: '📸フラッシュ目くらまし＆冷や汗スリップに注意！',
    targetAngle: 90.0,
    accelPerSec2: 145,
    initialVelocityPerSec: 46,
    brakeDecelPerSec2: 195, // 冷や汗で制動距離が伸びる
    flashBlindStartAngle: 45.0,
    hasGravityBoostAfter90: false,
  },
  {
    roundNumber: 3,
    title: '最終問：限界寸止め土下座',
    subtitle: '⚡重力加速！135°で床スレスレ寸止めせよ！（145°で床激突）',
    targetAngle: 135.0,
    accelPerSec2: 185,
    initialVelocityPerSec: 55,
    brakeDecelPerSec2: 230,
    flashBlindStartAngle: 75.0,
    hasGravityBoostAfter90: true,
  },
]

export function pickRandomScandal(excludeId?: string): ScandalPrompt {
  const candidates = excludeId
    ? SCANDAL_PROMPTS.filter((s) => s.id !== excludeId)
    : SCANDAL_PROMPTS
  const idx = Math.floor(Math.random() * candidates.length)
  return candidates[idx] ?? SCANDAL_PROMPTS[0]
}

/**
 * 現在の角度・角速度から、今すぐ指を離した場合に慣性ブレーキで何度の位置で止まるかを計算する
 */
export function computeBrakingStopAngle(
  currentAngle: number,
  currentVelocity: number,
  brakeDecelPerSec2: number
): number {
  if (currentVelocity <= 0 || brakeDecelPerSec2 <= 0) {
    return Number(currentAngle.toFixed(1))
  }
  const stopDist =
    (currentVelocity * currentVelocity) / (2 * brakeDecelPerSec2)
  return Number(Math.min(360, currentAngle + stopDist).toFixed(1))
}

/**
 * 物理フレーム更新（dt秒経過時の次の角度と角速度）
 */
export function stepBowPhysics(
  angle: number,
  velocity: number,
  phase: 'holding' | 'braking',
  roundConfig: RoundConfig,
  dtSec: number
): { angle: number; velocity: number; stopped: boolean } {
  const safeDt = Math.min(dtSec, 0.05)

  if (phase === 'holding') {
    const gravityMultiplier =
      roundConfig.hasGravityBoostAfter90 && angle >= 90 ? 1.55 : 1.0
    const nextVel =
      velocity + roundConfig.accelPerSec2 * gravityMultiplier * safeDt
    const nextAngle = angle + nextVel * safeDt

    if (nextAngle >= 360) {
      return { angle: 360.0, velocity: 0, stopped: true }
    }
    return {
      angle: Number(nextAngle.toFixed(1)),
      velocity: nextVel,
      stopped: false,
    }
  }

  // brakingフェーズ：慣性で進みながら減速
  const nextVel = Math.max(0, velocity - roundConfig.brakeDecelPerSec2 * safeDt)
  const avgVel = (velocity + nextVel) * 0.5
  const nextAngle = Math.min(360, angle + avgVel * safeDt)

  if (nextVel <= 0.01 || nextAngle >= 360) {
    return {
      angle: Number(nextAngle.toFixed(1)),
      velocity: 0,
      stopped: true,
    }
  }

  return {
    angle: Number(nextAngle.toFixed(1)),
    velocity: nextVel,
    stopped: false,
  }
}

/**
 * 1ラウンド停止時の評価（許容範囲内なら次ラウンドへ、大惨事なら即号外リザルトへ）
 */
export function evaluateRoundStop(
  roundConfig: RoundConfig,
  stoppedAngle: number
): RoundRecord {
  const angle = Number(stoppedAngle.toFixed(1))
  const diff = Number((angle - roundConfig.targetAngle).toFixed(1))
  const absDiff = Number(Math.abs(diff).toFixed(1))

  // 1. 暴走回転・地球貫通・床激突の重大事故判定
  if (angle >= 260) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'windmill_accident',
      isAccident: true,
      roundComment: '回転しすぎてブレイクダンス世界大会に突入！！🕺',
    }
  }
  if (angle >= 185) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'mantle_accident',
      isAccident: true,
      roundComment: '床を突き破りマントルを貫通してブラジルへ到達！！🌍',
    }
  }
  if (angle >= 145) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'floor_drill_accident',
      isAccident: true,
      roundComment: '会見テーブルを頭突きで粉砕し、頭が床にめり込んだ！！💥',
    }
  }

  // 2. 浅すぎ・逃亡事故判定
  if (angle < 3.0) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'escape_accident',
      isAccident: true,
      roundComment: '一礼すら拒否して会見場から0.1秒で光速逃亡！！💨',
    }
  }
  if (angle < 20.0) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'defiant_accident',
      isAccident: true,
      roundComment: 'ほぼ仁王立ちのドヤ顔でカメラを睨みつけ大炎上！！🔥',
    }
  }

  // 3. 目標角度に対する成功判定
  if (absDiff <= 0.5) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'miracle',
      isAccident: false,
      roundComment: '✨奇跡の神角度（誤差0.5°以内）！！記者団が号泣！！',
    }
  }
  if (absDiff <= 2.5) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'perfect',
      isAccident: false,
      roundComment: '🌟完璧な黄金謝罪角度！！フラッシュが鳴り止まない！',
    }
  }
  if (absDiff <= 6.0) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'great',
      isAccident: false,
      roundComment: '👏誠意が伝わるナイスお辞儀！次の追及へ！',
    }
  }
  if (absDiff <= 13.0) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'safe',
      isAccident: false,
      roundComment: '💦ギリギリ許容範囲！記者がまだ睨んでいるぞ！',
    }
  }

  // 4. 許容誤差（±13°）を超えた失敗
  if (diff < 0) {
    return {
      roundNumber: roundConfig.roundNumber,
      targetAngle: roundConfig.targetAngle,
      stoppedAngle: angle,
      diff,
      absDiff,
      grade: 'shallow_accident',
      isAccident: true,
      roundComment: '「あ、すんませ〜んw」レベルの軽い会釈で火に油！！🔥',
    }
  }

  return {
    roundNumber: roundConfig.roundNumber,
    targetAngle: roundConfig.targetAngle,
    stoppedAngle: angle,
    diff,
    absDiff,
    grade: 'mic_crash_accident',
    isAccident: true,
    roundComment: '勢い余ってマイクに顔面強打（ゴンッ！！）🎙️💥',
  }
}

/**
 * 終局時（放送事故発生時 または 3問完走時）の号外新聞リザルト＆パワーワード称号判定
 */
export function evaluateFinalPressResult(
  records: RoundRecord[]
): FinalPressResult {
  const lastRecord = records[records.length - 1]

  // A. 途中で放送事故（isAccident）を起こした場合
  if (lastRecord && lastRecord.isAccident) {
    const angle = lastRecord.stoppedAngle
    switch (lastRecord.grade) {
      case 'escape_accident':
        return {
          isClearedAllRounds: false,
          stampLabel: '【逃亡犯】',
          stampTone: 'rose',
          headline: `マイクの前に立ち「帰ります」と角度${angle}°で光速帰宅！`,
          titleBadge: '【会見時間0.1秒の光速逃亡犯】',
          causeOfDeathOrFeat:
            '死因：一礼すら拒否して非常口から消え去り全国指名手配へ',
          reporterCommentary:
            '「カメラのピントが合う前に帰宅していました。ある意味で人類最速の危機管理です。」',
          viralRepostText: '🔥 炎上拡散：320.4万 リポスト',
          sincerityScore: 10,
          highlightAngle: angle,
        }

      case 'defiant_accident':
        return {
          isClearedAllRounds: false,
          stampLabel: '【大炎上】',
          stampTone: 'rose',
          headline: `お辞儀角度わずか${angle}°！仁王立ちで記者を逆ギレ威嚇！`,
          titleBadge: '【反省ゼロの仁王立ちモンスター】',
          causeOfDeathOrFeat:
            '死因：微動だにせずカメラを睨みつけ「逆ギレ会見」として全国中継',
          reporterCommentary:
            '「首の関節がチタン合金でできているのでしょうか。SNSの炎上火力は太陽表面を超えました。」',
          viralRepostText: '🔥 炎上拡散：548.0万 リポスト',
          sincerityScore: 80,
          highlightAngle: angle,
        }

      case 'shallow_accident':
        return {
          isClearedAllRounds: false,
          stampLabel: '【火に油】',
          stampTone: 'rose',
          headline: `目標${lastRecord.targetAngle}°に対し${angle}°の雑な会釈で世論が大爆発！`,
          titleBadge: '【煽りスキルMAXの火薬庫】',
          causeOfDeathOrFeat:
            '死因：「あ、すんませ〜んw」レベルの軽い会釈で火に油を注ぐ',
          reporterCommentary:
            '「コンビニの店員さんのお辞儀の方がまだ100倍心がこもっています。」',
          viralRepostText: '🔥 炎上拡散：194.2万 リポスト',
          sincerityScore: 420,
          highlightAngle: angle,
        }

      case 'mic_crash_accident':
        return {
          isClearedAllRounds: false,
          stampLabel: '【放送事故】',
          stampTone: 'violet',
          headline: `角度${angle}°でブレーキ間に合わず！高級マイクに顔面フルスイング！`,
          titleBadge: '【音声さん泣かせの顔面マイククラッシャー】',
          causeOfDeathOrFeat:
            '死因：いい感じだったのに最後の1ミリでマイクに顔面強打（ボフッ！！）',
          reporterCommentary:
            '「全国のお茶の間に『ゴンッ！！』という鈍い重低音が4K画質で響き渡りました。」',
          viralRepostText: '🤣 爆笑拡散：128.5万 リポスト',
          sincerityScore: 1850,
          highlightAngle: angle,
        }

      case 'floor_drill_accident':
        return {
          isClearedAllRounds: false,
          stampLabel: '【床面粉砕】',
          stampTone: 'violet',
          headline: `前代未聞の${angle}°謝罪！会見テーブルを粉砕し頭部が床にめり込む！`,
          titleBadge: '【物理的に頭がめり込む人間削岩機】',
          causeOfDeathOrFeat:
            '死因：勢い余って会見テーブルを頭突きで粉砕し、フローリングに直刺さり',
          reporterCommentary:
            '「誠意は痛いほど伝わりましたが、会場の床の修理代（80万円）が追加請求されます。」',
          viralRepostText: '🤣 爆笑拡散：412.9万 リポスト',
          sincerityScore: 3900,
          highlightAngle: angle,
        }

      case 'mantle_accident':
        return {
          isClearedAllRounds: false,
          stampLabel: '【地底到達】',
          stampTone: 'violet',
          headline: `お辞儀角度${angle}°突破！会場の床からマントルを抜けてブラジルへ貫通！`,
          titleBadge: '【重力を置き去りにした地底謝罪師】',
          causeOfDeathOrFeat:
            '死因：お辞儀の遠心力が限界突破し、地球の裏側へこんにちは',
          reporterCommentary:
            '「地球の裏側の人たちも、突然地面からスーツ姿の頭が生えてきて驚いています。」',
          viralRepostText: '🌍 世界的バズ：890.0万 リポスト',
          sincerityScore: 5500,
          highlightAngle: angle,
        }

      case 'windmill_accident':
      default:
        return {
          isClearedAllRounds: false,
          stampLabel: '【超人回転】',
          stampTone: 'gold',
          headline: `お辞儀角度${angle}°！高速縦回転ウィンドミルで会見場がダンスフロア化！`,
          titleBadge: '【反省の向こう側へ到達した回転人間風車】',
          causeOfDeathOrFeat:
            '死因：高速縦回転から華麗なブレイクダンスを決め、記者団が総立ちで歓声',
          reporterCommentary:
            '「あまりの回転速度に記者団も不祥事を忘れて『フゥーッ！！』と盛り上がりました。」',
          viralRepostText: '🕺 伝説的バズ：1,200万 リポスト',
          sincerityScore: 7777,
          highlightAngle: angle,
        }
    }
  }

  // B. 全3問を生還クリアした場合
  const avgDiff =
    records.reduce((sum, r) => sum + r.absDiff, 0) /
    Math.max(1, records.length)
  const hasMiracle = records.some((r) => r.grade === 'miracle')
  const finalAngle = lastRecord ? lastRecord.stoppedAngle : 135.0
  const baseScore = Math.max(
    5000,
    Math.round(10000 - avgDiff * 420 + (hasMiracle ? 1500 : 0))
  )

  if (avgDiff <= 1.2) {
    return {
      isClearedAllRounds: true,
      stampLabel: '【人間国宝】',
      stampTone: 'gold',
      headline: `3問平均誤差わずか${avgDiff.toFixed(1)}°！美しすぎる謝罪角度に記者団が号泣！`,
      titleBadge: '【人類の限界を超越せし絶対角度神】',
      causeOfDeathOrFeat:
        '偉業：分度器を魂に宿す神業ブレーキで不祥事を完全に聖火へ昇華',
      reporterCommentary:
        '「角度・制動・静止のキレ、すべてが芸術。逆にプリンを食べられた被害者が謝り始めました。」',
      viralRepostText: '✨ 称賛バズ：999.9万 いいね',
      sincerityScore: baseScore,
      highlightAngle: finalAngle,
    }
  }

  if (avgDiff <= 3.0) {
    return {
      isClearedAllRounds: true,
      stampLabel: '【完全鎮火】',
      stampTone: 'gold',
      headline: `平均誤差${avgDiff.toFixed(1)}°の黄金角！ネットの大炎上が3秒で鎮火し株価ストップ高！`,
      titleBadge: '【分度器を魂に宿す国家資格レベルの謝罪王】',
      causeOfDeathOrFeat:
        '偉業：45°・90°・135°の3連コンボをミリ単位の精度で完遂',
      reporterCommentary:
        '「見事な腰の入り方です。これなら来週も同じ不祥事を起こしても許されるでしょう。」',
      viralRepostText: '✨ 称賛バズ：480.0万 いいね',
      sincerityScore: baseScore,
      highlightAngle: finalAngle,
    }
  }

  if (avgDiff <= 6.0) {
    return {
      isClearedAllRounds: true,
      stampLabel: '【社会復帰】',
      stampTone: 'emerald',
      headline: `平均誤差${avgDiff.toFixed(1)}°で全3問を突破！炎上はボヤ程度で無事鎮火へ！`,
      titleBadge: '【0.1秒で世論を掌返しさせる誠意の魔術師】',
      causeOfDeathOrFeat:
        '結果：記者のフラッシュ攻勢と重力3倍土下座を見事に耐え抜く',
      reporterCommentary:
        '「若干冷や汗が見えた瞬間もありましたが誠意は伝わりました。帰りにプリンを3個買って帰りましょう。」',
      viralRepostText: '👏 納得バズ：84.5万 いいね',
      sincerityScore: baseScore,
      highlightAngle: finalAngle,
    }
  }

  return {
    isClearedAllRounds: true,
    stampLabel: '【ギリ許容】',
    stampTone: 'emerald',
    headline: `平均誤差${avgDiff.toFixed(1)}°でなんとか会見終了！反省してるか絶妙に怪しいライン！`,
    titleBadge: '【なんか絶妙に胡散臭いギリギリセーフ社員】',
    causeOfDeathOrFeat:
      '結果：床激突は免れたものの、終始カンペをチラ見しながら会見を乗り切る',
    reporterCommentary:
      '「カメラマンから『お辞儀しながら時計を気にしていた』とのタレコミが入っています。」',
    viralRepostText: '😅 ザワつき拡散：32.1万 リポスト',
    sincerityScore: baseScore,
    highlightAngle: finalAngle,
  }
}

/**
 * X（旧Twitter）シェア用URLの生成
 */
export function buildShareTweetUrl(
  scandal: ScandalPrompt,
  result: FinalPressResult,
  pageUrl: string
): string {
  const text = [
    `【緊急謝罪会見】`,
    `事案：「${scandal.incident}」`,
    `記録角度：${result.highlightAngle.toFixed(1)}°`,
    `称号：${result.titleBadge}`,
    `${result.causeOfDeathOrFeat}`,
    `（${result.viralRepostText}）`,
    `#緊急謝罪会見 #AIGameLab`,
  ].join('\n')

  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`
}
