export type Player = 'coral' | 'soda'
export type CellState = Player | null
export type GameMode = 'classic' | 'party'
export type OpponentType = 'easy' | 'normal' | 'hard' | '2p'
export type GimmickType = 'bomb' | 'shield' | null

export interface Coord {
  r: number
  c: number
}

export interface MoveEvaluation {
  r: number
  c: number
  normalFlips: Coord[]
  bombFlips: Coord[]
  totalFlips: number
  triggersBomb: boolean
  triggersShield: boolean
  isCorner: boolean
}

export interface GameState {
  board: CellState[][]
  shielded: boolean[][]
  gimmicks: GimmickType[][]
  currentTurn: Player
  mode: GameMode
  isGameOver: boolean
  winner: Player | 'draw' | null
  lastMove: Coord | null
  lastFlipped: Coord[]
  passNotice: Player | null
  stats: {
    coralMaxFlipsInOneMove: number
    coralBombsUsed: number
    coralShieldsUsed: number
    wasCoralBehindInEndgame: boolean
  }
}

export const BOARD_SIZE = 8

const DIRECTIONS: readonly [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

const ORTHOGONAL_DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

// 盤面位置の重み付けテーブル（角が最高評価、角の隣・斜め内側がマイナス評価）
const POSITION_WEIGHTS: readonly (readonly number[])[] = [
  [100, -25, 18, 8, 8, 18, -25, 100],
  [-25, -45, -4, -2, -2, -4, -45, -25],
  [18, -4, 12, 4, 4, 12, -4, 18],
  [8, -2, 4, 2, 2, 4, -2, 8],
  [8, -2, 4, 2, 2, 4, -2, 8],
  [18, -4, 12, 4, 4, 12, -4, 18],
  [-25, -45, -4, -2, -2, -4, -45, -25],
  [100, -25, 18, 8, 8, 18, -25, 100],
]

export function getOpponent(player: Player): Player {
  return player === 'coral' ? 'soda' : 'coral'
}

export function isCornerCell(r: number, c: number): boolean {
  return (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1)
}

/**
 * パーティーモード用：点対称（回転対称）でボム2マス＋シールド2マスを配置する
 * 初期4マスとその周囲（rows 2..5, cols 2..5）および四隅は除外して中盤の戦略エリアに配置する
 */
export function createSymmetricGimmicks(seed?: number): GimmickType[][] {
  const gimmicks: GimmickType[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<GimmickType>(BOARD_SIZE).fill(null)
  )

  // 点対称ペアの候補（上半分 r=0..3 のうち、四隅・角隣・中央4x4を除いた戦略的に面白いマス）
  const candidatePairs: [Coord, Coord][] = [
    [
      { r: 1, c: 2 },
      { r: 6, c: 5 },
    ],
    [
      { r: 1, c: 5 },
      { r: 6, c: 2 },
    ],
    [
      { r: 2, c: 1 },
      { r: 5, c: 6 },
    ],
    [
      { r: 5, c: 1 },
      { r: 2, c: 6 },
    ],
    [
      { r: 0, c: 2 },
      { r: 7, c: 5 },
    ],
    [
      { r: 0, c: 5 },
      { r: 7, c: 2 },
    ],
    [
      { r: 2, c: 0 },
      { r: 5, c: 7 },
    ],
    [
      { r: 5, c: 0 },
      { r: 2, c: 7 },
    ],
  ]

  const idx1 =
    seed !== undefined
      ? Math.abs(seed) % candidatePairs.length
      : Math.floor(Math.random() * candidatePairs.length)
  let idx2 =
    seed !== undefined
      ? (Math.abs(seed) + 3) % candidatePairs.length
      : Math.floor(Math.random() * candidatePairs.length)
  if (idx2 === idx1) {
    idx2 = (idx1 + 1) % candidatePairs.length
  }

  const [bombA, bombB] = candidatePairs[idx1]
  const [shieldA, shieldB] = candidatePairs[idx2]

  gimmicks[bombA.r][bombA.c] = 'bomb'
  gimmicks[bombB.r][bombB.c] = 'bomb'
  gimmicks[shieldA.r][shieldA.c] = 'shield'
  gimmicks[shieldB.r][shieldB.c] = 'shield'

  return gimmicks
}

export function createInitialGameState(
  mode: GameMode = 'party',
  seed?: number
): GameState {
  const board: CellState[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<CellState>(BOARD_SIZE).fill(null)
  )
  const shielded: boolean[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<boolean>(BOARD_SIZE).fill(false)
  )

  // 公式初期配置（中央4マス）
  board[3][3] = 'soda'
  board[3][4] = 'coral'
  board[4][3] = 'coral'
  board[4][4] = 'soda'

  const gimmicks =
    mode === 'party'
      ? createSymmetricGimmicks(seed)
      : Array.from({ length: BOARD_SIZE }, () =>
          Array<GimmickType>(BOARD_SIZE).fill(null)
        )

  return {
    board,
    shielded,
    gimmicks,
    currentTurn: 'coral',
    mode,
    isGameOver: false,
    winner: null,
    lastMove: null,
    lastFlipped: [],
    passNotice: null,
    stats: {
      coralMaxFlipsInOneMove: 0,
      coralBombsUsed: 0,
      coralShieldsUsed: 0,
      wasCoralBehindInEndgame: false,
    },
  }
}

/**
 * 指定マス (r, c) に player が打った場合の評価（合法手でない場合は null）
 */
export function evaluateMove(
  state: Pick<GameState, 'board' | 'shielded' | 'gimmicks'>,
  r: number,
  c: number,
  player: Player
): MoveEvaluation | null {
  if (
    r < 0 ||
    r >= BOARD_SIZE ||
    c < 0 ||
    c >= BOARD_SIZE ||
    state.board[r][c] !== null
  ) {
    return null
  }

  const opponent = getOpponent(player)
  const normalFlips: Coord[] = []

  for (const [dr, dc] of DIRECTIONS) {
    let nr = r + dr
    let nc = c + dc
    const lineCandidates: Coord[] = []
    let sawOpponent = false

    while (
      nr >= 0 &&
      nr < BOARD_SIZE &&
      nc >= 0 &&
      nc < BOARD_SIZE &&
      state.board[nr][nc] === opponent
    ) {
      sawOpponent = true
      // シールド石は裏返らないが、自分の石で挟むラインの途中としては通過可能
      if (!state.shielded[nr][nc]) {
        lineCandidates.push({ r: nr, c: nc })
      }
      nr += dr
      nc += dc
    }

    if (
      sawOpponent &&
      nr >= 0 &&
      nr < BOARD_SIZE &&
      nc >= 0 &&
      nc < BOARD_SIZE &&
      state.board[nr][nc] === player &&
      lineCandidates.length > 0
    ) {
      normalFlips.push(...lineCandidates)
    }
  }

  // 通常の挟みで1枚以上裏返せない場合は合法手ではない
  if (normalFlips.length === 0) {
    return null
  }

  const gimmick = state.gimmicks[r][c]
  const triggersBomb = gimmick === 'bomb'
  const triggersShield = gimmick === 'shield'
  const bombFlips: Coord[] = []

  if (triggersBomb) {
    const flippedSet = new Set(normalFlips.map((p) => `${p.r},${p.c}`))
    for (const [dr, dc] of ORTHOGONAL_DIRS) {
      const nr = r + dr
      const nc = c + dc
      if (
        nr >= 0 &&
        nr < BOARD_SIZE &&
        nc >= 0 &&
        nc < BOARD_SIZE &&
        state.board[nr][nc] === opponent &&
        !state.shielded[nr][nc] &&
        !flippedSet.has(`${nr},${nc}`)
      ) {
        bombFlips.push({ r: nr, c: nc })
      }
    }
  }

  return {
    r,
    c,
    normalFlips,
    bombFlips,
    totalFlips: normalFlips.length + bombFlips.length,
    triggersBomb,
    triggersShield,
    isCorner: isCornerCell(r, c),
  }
}

export function getLegalMoves(
  state: Pick<GameState, 'board' | 'shielded' | 'gimmicks'>,
  player: Player
): MoveEvaluation[] {
  const moves: MoveEvaluation[] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const ev = evaluateMove(state, r, c, player)
      if (ev) {
        moves.push(ev)
      }
    }
  }
  return moves
}

export function countPieces(board: CellState[][]): {
  coral: number
  soda: number
  empty: number
} {
  let coral = 0
  let soda = 0
  let empty = 0
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 'coral') coral++
      else if (board[r][c] === 'soda') soda++
      else empty++
    }
  }
  return { coral, soda, empty }
}

/**
 * 着手を適用して次のGameStateを返す（純粋関数）
 */
export function applyMove(
  state: GameState,
  r: number,
  c: number
): GameState | null {
  if (state.isGameOver) return null
  const ev = evaluateMove(state, r, c, state.currentTurn)
  if (!ev) return null

  const nextBoard = state.board.map((row) => [...row])
  const nextShielded = state.shielded.map((row) => [...row])
  const nextGimmicks = state.gimmicks.map((row) => [...row])

  const player = state.currentTurn
  nextBoard[r][c] = player

  const allFlipped = [...ev.normalFlips, ...ev.bombFlips]
  for (const pos of allFlipped) {
    nextBoard[pos.r][pos.c] = player
  }

  // ギミック消費＆シールド付与
  if (ev.triggersShield) {
    nextShielded[r][c] = true
  }
  nextGimmicks[r][c] = null

  // 置いた場所からの距離順にソート（ウェーブアニメーション用）
  allFlipped.sort((a, b) => {
    const distA = Math.max(Math.abs(a.r - r), Math.abs(a.c - c))
    const distB = Math.max(Math.abs(b.r - r), Math.abs(b.c - c))
    return distA - distB
  })

  const counts = countPieces(nextBoard)
  const nextStats = { ...state.stats }
  if (player === 'coral') {
    nextStats.coralMaxFlipsInOneMove = Math.max(
      nextStats.coralMaxFlipsInOneMove,
      ev.totalFlips
    )
    if (ev.triggersBomb) nextStats.coralBombsUsed++
    if (ev.triggersShield) nextStats.coralShieldsUsed++
  }
  if (counts.empty <= 14 && counts.coral < counts.soda) {
    nextStats.wasCoralBehindInEndgame = true
  }

  const opponent = getOpponent(player)
  const nextTempState = {
    board: nextBoard,
    shielded: nextShielded,
    gimmicks: nextGimmicks,
  }

  const opponentMoves = getLegalMoves(nextTempState, opponent)
  if (opponentMoves.length > 0) {
    return {
      ...state,
      board: nextBoard,
      shielded: nextShielded,
      gimmicks: nextGimmicks,
      currentTurn: opponent,
      lastMove: { r, c },
      lastFlipped: allFlipped,
      passNotice: null,
      stats: nextStats,
    }
  }

  // 相手に合法手がない場合、自分の連続手番が可能か確認
  const myMoves = getLegalMoves(nextTempState, player)
  if (myMoves.length > 0) {
    return {
      ...state,
      board: nextBoard,
      shielded: nextShielded,
      gimmicks: nextGimmicks,
      currentTurn: player,
      lastMove: { r, c },
      lastFlipped: allFlipped,
      passNotice: opponent,
      stats: nextStats,
    }
  }

  // 両者とも置ける場所がない（または全マス埋まり/全滅）➔ 終局
  const winner: Player | 'draw' =
    counts.coral > counts.soda
      ? 'coral'
      : counts.soda > counts.coral
        ? 'soda'
        : 'draw'

  return {
    ...state,
    board: nextBoard,
    shielded: nextShielded,
    gimmicks: nextGimmicks,
    isGameOver: true,
    winner,
    lastMove: { r, c },
    lastFlipped: allFlipped,
    passNotice: null,
    stats: nextStats,
  }
}

/**
 * 盤面評価関数（CPUのNormal/Hard用）
 */
function evaluateBoardForPlayer(
  state: Pick<GameState, 'board' | 'shielded' | 'gimmicks'>,
  player: Player
): number {
  const opponent = getOpponent(player)
  const counts = countPieces(state.board)

  if (counts.empty === 0) {
    const diff =
      player === 'coral'
        ? counts.coral - counts.soda
        : counts.soda - counts.coral
    return diff * 500
  }

  let score = 0
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = state.board[r][c]
      if (!cell) continue
      const weight = POSITION_WEIGHTS[r][c]
      const shieldBonus = state.shielded[r][c] ? 45 : 0
      if (cell === player) {
        score += weight + shieldBonus
      } else {
        score -= weight + shieldBonus
      }
    }
  }

  // 着手可能数（Mobility）の評価
  const myMobility = getLegalMoves(state, player).length
  const oppMobility = getLegalMoves(state, opponent).length
  score += (myMobility - oppMobility) * 10

  // 終盤は石数差も重視
  if (counts.empty <= 12) {
    const diff =
      player === 'coral'
        ? counts.coral - counts.soda
        : counts.soda - counts.coral
    score += diff * 12
  }

  return score
}

/**
 * CPUの着手選択（よわい / ふつう / つよい）
 */
export function selectCpuMove(
  state: GameState,
  difficulty: Exclude<OpponentType, '2p'>
): MoveEvaluation | null {
  const legalMoves = getLegalMoves(state, state.currentTurn)
  if (legalMoves.length === 0) return null
  if (legalMoves.length === 1) return legalMoves[0]

  // 🐣 よわい：角の重要性を無視し、単純に今たくさん裏返せる手（またはランダム）を選ぶ
  if (difficulty === 'easy') {
    const sorted = [...legalMoves].sort((a, b) => b.totalFlips - a.totalFlips)
    // 上位2手から選ぶことで初心者でも逆転しやすい動きにする
    const pickIdx =
      sorted.length > 1 && Math.random() < 0.35 ? 1 : 0
    return sorted[pickIdx]
  }

  // 🐰 ふつう：位置重み付け＋ギミックボーナス＋獲得枚数のバランス評価
  if (difficulty === 'normal') {
    let bestMove = legalMoves[0]
    let bestScore = -Infinity
    for (const move of legalMoves) {
      const posWeight = POSITION_WEIGHTS[move.r][move.c]
      const gimmickBonus =
        (move.triggersShield ? 50 : 0) + (move.triggersBomb ? 40 : 0)
      const score = posWeight + gimmickBonus + move.totalFlips * 3
      if (score > bestScore) {
        bestScore = score
        bestMove = move
      }
    }
    return bestMove
  }

  // 🦁 つよい：深さ3のMinimax法（Alpha-Beta枝刈り）
  const aiPlayer = state.currentTurn

  function minimax(
    curState: GameState,
    depth: number,
    alpha: number,
    beta: number
  ): number {
    if (depth === 0 || curState.isGameOver) {
      return evaluateBoardForPlayer(curState, aiPlayer)
    }

    const moves = getLegalMoves(curState, curState.currentTurn)
    if (moves.length === 0) {
      return evaluateBoardForPlayer(curState, aiPlayer)
    }

    const isMaximizing = curState.currentTurn === aiPlayer
    if (isMaximizing) {
      let maxEval = -Infinity
      for (const m of moves) {
        const next = applyMove(curState, m.r, m.c)
        if (!next) continue
        const ev = minimax(next, depth - 1, alpha, beta)
        maxEval = Math.max(maxEval, ev)
        alpha = Math.max(alpha, ev)
        if (beta <= alpha) break
      }
      return maxEval
    } else {
      let minEval = Infinity
      for (const m of moves) {
        const next = applyMove(curState, m.r, m.c)
        if (!next) continue
        const ev = minimax(next, depth - 1, alpha, beta)
        minEval = Math.min(minEval, ev)
        beta = Math.min(beta, ev)
        if (beta <= alpha) break
      }
      return minEval
    }
  }

  let bestMove = legalMoves[0]
  let bestVal = -Infinity
  for (const move of legalMoves) {
    const next = applyMove(state, move.r, move.c)
    if (!next) continue
    const gimmickImmediateBonus =
      (move.triggersShield ? 35 : 0) + (move.triggersBomb ? 25 : 0)
    const val =
      minimax(next, 2, -Infinity, Infinity) + gimmickImmediateBonus
    if (val > bestVal) {
      bestVal = val
      bestMove = move
    }
  }

  return bestMove
}

/**
 * 終局時のプレイスタイル称号バッジ判定
 */
export function evaluatePlaystyleTitle(state: GameState): {
  badge: string
  description: string
} {
  const counts = countPieces(state.board)
  const corners: Coord[] = [
    { r: 0, c: 0 },
    { r: 0, c: 7 },
    { r: 7, c: 0 },
    { r: 7, c: 7 },
  ]
  const coralCorners = corners.filter(
    (p) => state.board[p.r][p.c] === 'coral'
  ).length

  if (state.winner === 'coral') {
    if (counts.soda === 0 || counts.coral >= 54) {
      return {
        badge: '🌟 パーフェクト制覇！',
        description: '盤面をコーラルキャンディ一色に染め上げる圧倒的勝利！',
      }
    }
    if (state.stats.wasCoralBehindInEndgame) {
      return {
        badge: '👑 ミラクル大逆転キング！',
        description: '終盤の劣勢から鮮やかな一手で試合をひっくり返しました！',
      }
    }
    if (coralCorners >= 3) {
      return {
        badge: '📐 コーナーコレクター！',
        description: '四隅の王冠マスを3つ以上制圧する完璧な陣取り！',
      }
    }
    if (state.stats.coralBombsUsed > 0 && state.stats.coralShieldsUsed > 0) {
      return {
        badge: '🎪 パーティーマスター！',
        description: 'ボムとシールドの両方を使いこなして盤面を支配しました！',
      }
    }
    if (state.stats.coralMaxFlipsInOneMove >= 6) {
      return {
        badge: '⚡ メガフリップ職人！',
        description: `1手で最大 ${state.stats.coralMaxFlipsInOneMove} 枚まとめ返しを達成！`,
      }
    }
    return {
      badge: '🍬 スイートヴィクトリー！',
      description: '安定した読み合いで見事勝利をつかみ取りました！',
    }
  }

  if (state.winner === 'draw') {
    return {
      badge: '🤝 奇跡のイーブンマッチ！',
      description: '最後の一手まで互角の熱い名勝負でした！',
    }
  }

  return {
    badge: '🔥 ナイスファイト！もう1回！',
    description: '角やギミックマスを先に抑えると一気に逆転できます！',
  }
}
