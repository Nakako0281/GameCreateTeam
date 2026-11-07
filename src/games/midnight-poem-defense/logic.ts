export type DraftCategory = 'poem' | 'trap_recipient' | 'normal';

export interface MidnightDraftCard {
  id: string;
  category: DraftCategory;
  recipient: string;
  recipientBadgeTone: 'normal' | 'danger';
  message: string;
  correctAction: 'SHRED' | 'SEND';
  leakedReaction: string; // What happens if mistakenly sent or shredded
  readCountText: string;
}

export interface SortEvaluation {
  isCorrect: boolean;
  scoreDelta: number;
  headline: string;
  failureReason: string;
  leakedReply: string;
  readCountText: string;
}

export interface PoemDefenseRankInfo {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  title: string;
  mentalDeviation: string;
  diagnosis: string;
}

export const MIDNIGHT_DRAFT_DECK: MidnightDraftCard[] = [
  {
    id: 'm1',
    category: 'poem',
    recipient: '📱 X（本垢・フォロワー420人）',
    recipientBadgeTone: 'normal',
    message: '「ふと鏡を見たら、俺の背中に漆黒の堕天使の翼が透けて見えた。この世界はまだ俺に追いついていないらしい…」',
    correctAction: 'SHRED',
    leakedReaction: '同僚A「スクショ撮ったwww明日朝礼で朗読しようぜwww」',
    readCountText: '2,840 インプレッション・保存48件',
  },
  {
    id: 'm2',
    category: 'normal',
    recipient: '💼 プロジェクト進行グループ',
    recipientBadgeTone: 'normal',
    message: '「お疲れ様です。明日の定例会議の資料を共有フォルダに格納しましたのでご確認よろしくお願いいたします。」',
    correctAction: 'SEND',
    leakedReaction: '課長「なぜ完成していた資料をシュレッダーにかけた！？朝イチで始末書だ！」',
    readCountText: '未提出ペナルティ発動',
  },
  {
    id: 'm3',
    category: 'trap_recipient',
    recipient: '🚨 全社連絡LINE（社長・役員含む148人）',
    recipientBadgeTone: 'danger',
    message: '「明日仮病使って有給とってサウナと焼肉行こ〜っとwwwうちの部長マジで話長すぎ！」',
    correctAction: 'SHRED',
    leakedReaction: '代表取締役「ほう、焼肉いいですね。明日9時に社長室へ来なさい。」',
    readCountText: '既読 147',
  },
  {
    id: 'm4',
    category: 'poem',
    recipient: '💔 3年前に別れた元恋人',
    recipientBadgeTone: 'danger',
    message: '「まだ君のくれたマグカップ捨てられてないよ。今どこで誰と笑ってるの？（追いLINE 14通目・長文スクロール4画面分）」',
    correctAction: 'SHRED',
    leakedReaction: '元恋人「怖すぎます。共通の友人全員にスクショ共有してブロックしました。」',
    readCountText: '既読スルー → 即ブロック',
  },
  {
    id: 'm5',
    category: 'normal',
    recipient: '🏠 実家の母（オカン）',
    recipientBadgeTone: 'normal',
    message: '「仕送りのみかん届いたよ！いつもありがとう、風邪ひかないように気をつけてね。」',
    correctAction: 'SEND',
    leakedReaction: '母「お礼LINEまで黒歴史扱いして破棄するなんて…あんた反抗期なの！？」',
    readCountText: '親不孝度 +200%',
  },
  {
    id: 'm6',
    category: 'trap_recipient',
    recipient: '🚨 厳格な取引先・鬼瓦常務',
    recipientBadgeTone: 'danger',
    message: '「ちゅきちゅきラブリーちゃんへ💕 今日もバブみ全開でちゅね〜！よしよししてほしいでちゅ👶🍼」',
    correctAction: 'SHRED',
    leakedReaction: '鬼瓦常務「貴社との来期契約および取引はすべて白紙とさせていただきます。」',
    readCountText: '既読 1（法務部転送済）',
  },
  {
    id: 'm7',
    category: 'poem',
    recipient: '📸 Instagram ストーリーズ（親しい友達設定ミス）',
    recipientBadgeTone: 'normal',
    message: '「もう全部壊しちゃいたい…私なんて誰も必要としてないんだよね（真っ暗な天井の写真＋意味深な英語歌詞）」',
    correctAction: 'SHRED',
    leakedReaction: '地元の同級生「あいつ深夜3時に病みポエム上げてて草」',
    readCountText: '足跡 96人（上司含む）',
  },
  {
    id: 'm8',
    category: 'normal',
    recipient: '⏰ 自分用リマインダーメモ',
    recipientBadgeTone: 'normal',
    message: '「明日朝7:30燃えるゴミ出し忘れないこと！牛乳と卵を買って帰る。」',
    correctAction: 'SEND',
    leakedReaction: '翌朝の自分「メモを消したせいでゴミ収集車を見送り、冷蔵庫も空っぽで絶望…」',
    readCountText: '生活力崩壊',
  },
  {
    id: 'm9',
    category: 'trap_recipient',
    recipient: '🚨 町内会・回覧板グループ（平均年齢68歳）',
    recipientBadgeTone: 'danger',
    message: '「来週のコミケ新刊『禁断のオフィスラブ総集編』入稿完了！スケベすぎて印刷所に怒られるかもw」',
    correctAction: 'SHRED',
    leakedReaction: '町内会長「明日のゴミ当番の際、公民館で詳しくお話を伺います。」',
    readCountText: '既読 42（近所中がザワつく）',
  },
  {
    id: 'm10',
    category: 'poem',
    recipient: '📱 X（本垢・実名顔出し）',
    recipientBadgeTone: 'normal',
    message: '「俺が本気を出せば国家予算くらい3日で動かせるけど、あえて凡人のフリして満員電車に乗ってやってるだけ。」',
    correctAction: 'SHRED',
    leakedReaction: 'まとめサイト「【悲報】深夜3時に覚醒した社会人の末路がこちらwww（10万いいね）」',
    readCountText: '12.4万 いいね・デジタルタトゥー確定',
  },
];

export function evaluateDraftSort(
  action: 'SHRED' | 'SEND',
  card: MidnightDraftCard,
  remainingRatio: number, // 0.0 to 1.0
  currentCombo: number
): SortEvaluation {
  const isCorrect = action === card.correctAction;
  const clampedRatio = Math.max(0, Math.min(1, remainingRatio));
  const speedBonus = Math.round(clampedRatio * 500);
  const trapBonus = card.category === 'trap_recipient' ? 350 : 0;
  const comboMultiplier = Math.min(3.0, 1 + currentCombo * 0.15);

  if (isCorrect) {
    const scoreDelta = Math.round((500 + speedBonus + trapBonus) * comboMultiplier);
    const headline =
      action === 'SHRED'
        ? card.category === 'trap_recipient'
          ? '🚨 宛先トラップ神回避！！'
          : '🗑️ 黒歴史ポエム完全抹殺！！'
        : '📤 正常な連絡を冷静に送信！';

    return {
      isCorrect: true,
      scoreDelta,
      headline,
      failureReason: '',
      leakedReply: '',
      readCountText: '',
    };
  }

  // Mistake!
  const failureReason =
    action === 'SEND'
      ? `【${card.recipient}】へ『${card.message}』を誤送信して社会的死亡！`
      : `まともな連絡『${card.message}』まで深夜の狂気でシュレッダー粉砕！`;

  return {
    isCorrect: false,
    scoreDelta: 0,
    headline: action === 'SEND' ? '💀 致命的な全社/深夜誤爆！！' : '😱 必要な連絡まで抹殺！！',
    failureReason,
    leakedReply: card.leakedReaction,
    readCountText: card.readCountText,
  };
}

export function getPoemDefenseRankInfo(
  score: number,
  shreddedCount: number,
  cleared: boolean
): PoemDefenseRankInfo {
  if (cleared && score >= 9500) {
    return {
      rank: 'S',
      title: '人類の黒歴史守護神・誤爆ゼロの聖人',
      mentalDeviation: '黒歴史耐性偏差値 84（神域）',
      diagnosis:
        '深夜3時の魔物と宛先トラップをすべて0.5秒で見切った鉄壁の理性！あなたのSNSアカウントは世界一安全です。',
    };
  }
  if (cleared || score >= 6000) {
    return {
      rank: 'A',
      title: '鉄壁のネットリテラシー（深夜でも正気を保つ賢者）',
      mentalDeviation: '黒歴史耐性偏差値 68（優秀）',
      diagnosis: `${shreddedCount}件の危険ポエムを未然に葬り去りました。翌朝ベッドで枕に顔を埋めて絶叫せずに済みます。`,
    };
  }
  if (score >= 3200) {
    return {
      rank: 'B',
      title: '誤爆ギリギリ曲芸師（送信取消の鬼）',
      mentalDeviation: '黒歴史耐性偏差値 52（要注意）',
      diagnosis:
        '途中までは冷静でしたが、宛先トラップの罠に指が滑りました。「乗っ取られてました」の言い訳は通用しません。',
    };
  }
  if (score >= 1200) {
    return {
      rank: 'C',
      title: '深夜3時のポエマー予備軍（ツイ消し速度だけプロ級）',
      mentalDeviation: '黒歴史耐性偏差値 38（重症）',
      diagnosis:
        '深夜2時を過ぎたらスマホを金庫に入れて鍵をかけることを強く推奨します。すでに複数人にスクショされています。',
    };
  }
  return {
    rank: 'D',
    title: 'デジタルタトゥー彫り師（翌朝スマホを海に捨てる人）',
    mentalDeviation: '黒歴史耐性偏差値 14（社会的死亡）',
    diagnosis:
      '全社LINEと本垢に魂のポエムをフルオープン送信しました。来週から無人島での新生活をお楽しみください。',
  };
}
