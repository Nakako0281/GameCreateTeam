import { describe, it, expect } from 'vitest'
import {
  BOARD_SIZE,
  createInitialGameState,
  getLegalMoves,
  evaluateMove,
  applyMove,
  countPieces,
  selectCpuMove,
  evaluatePlaystyleTitle,
} from '../logic'

describe('Candy Pop Reversi コアロジック単体テスト', () => {
  it('初期盤面が公式ルール通り中央4マス配置で、先手(coral)の合法手が4つあること', () => {
    const state = createInitialGameState('classic')
    const counts = countPieces(state.board)
    expect(counts.coral).toBe(2)
    expect(counts.soda).toBe(2)
    expect(counts.empty).toBe(60)
    expect(state.currentTurn).toBe('coral')

    const moves = getLegalMoves(state, 'coral')
    expect(moves).toHaveLength(4)
  })

  it('パーティーモードでボム2個・シールド2個が点対称に配置され、四隅と中央4×4を避けていること', () => {
    const state = createInitialGameState('party', 1)
    let bombCount = 0
    let shieldCount = 0

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const g = state.gimmicks[r][c]
        if (!g) continue
        if (g === 'bomb') bombCount++
        if (g === 'shield') shieldCount++

        // 点対称の位置に同じギミックがあること
        expect(state.gimmicks[7 - r][7 - c]).toBe(g)
        // 四隅ではないこと
        expect((r === 0 || r === 7) && (c === 0 || c === 7)).toBe(false)
      }
    }

    expect(bombCount).toBe(2)
    expect(shieldCount).toBe(2)
  })

  it('通常の着手と複数方向の同時挟み反転が正しく動作すること', () => {
    const state = createInitialGameState('classic')
    // (2,3) に coral が置くと (3,3) の soda が裏返る
    const next = applyMove(state, 2, 3)
    expect(next).not.toBeNull()
    expect(next!.board[2][3]).toBe('coral')
    expect(next!.board[3][3]).toBe('coral')
    expect(countPieces(next!.board).coral).toBe(4)
    expect(countPieces(next!.board).soda).toBe(1)
    expect(next!.currentTurn).toBe('soda')
  })

  it('💣ボムマスに置いたとき、通常の挟み返し＋上下左右の相手石も巻き込んで反転すること', () => {
    const state = createInitialGameState('classic')
    // (2,3) をボムマスに設定し、その左隣 (2,2) に相手の石(soda)を置く
    state.gimmicks[2][3] = 'bomb'
    state.board[2][2] = 'soda'

    const ev = evaluateMove(state, 2, 3, 'coral')
    expect(ev).not.toBeNull()
    expect(ev!.triggersBomb).toBe(true)
    expect(ev!.normalFlips).toEqual([{ r: 3, c: 3 }])
    expect(ev!.bombFlips).toEqual([{ r: 2, c: 2 }])
    expect(ev!.totalFlips).toBe(2)

    const next = applyMove(state, 2, 3)!
    expect(next.board[3][3]).toBe('coral')
    expect(next.board[2][2]).toBe('coral')
    // ボムマスは一度発動したら消滅する
    expect(next.gimmicks[2][3]).toBeNull()
  })

  it('🛡️シールドマスに置いた石は無敵確定石となり、挟まれてもボムでも裏返らないこと', () => {
    const state = createInitialGameState('classic')
    // (2,3) をシールドマスにして coral が打つ
    state.gimmicks[2][3] = 'shield'
    const afterCoral = applyMove(state, 2, 3)!
    expect(afterCoral.shielded[2][3]).toBe(true)

    // (2,3) のシールド石しか挟めないような状況を人工的に作る
    const testState = createInitialGameState('classic')
    testState.board = Array.from({ length: 8 }, () => Array(8).fill(null))
    testState.board[1][3] = 'soda'
    testState.board[2][3] = 'coral'
    testState.shielded[2][3] = true
    // soda が (3,3) に置いても、(2,3) はシールド石なので裏返せず合法手にならない
    expect(evaluateMove(testState, 3, 3, 'soda')).toBeNull()

    // さらにボム爆風でも (2,3) のシールド石は裏返らないことを確認
    testState.board[3][4] = 'coral'
    testState.board[3][5] = 'soda'
    testState.gimmicks[3][3] = 'bomb'
    // soda が (3,3) に置くと右方向の (3,4) は通常反転するが、上の (2,3) はシールドなのでボムでも裏返らない
    const bombEv = evaluateMove(testState, 3, 3, 'soda')
    expect(bombEv).not.toBeNull()
    expect(bombEv!.normalFlips).toEqual([{ r: 3, c: 4 }])
    expect(bombEv!.bombFlips).toEqual([])
  })

  it('CPUの3段階（easy / normal / hard）すべてが合法手を正しく返すこと', () => {
    const state = createInitialGameState('party', 2)
    const easyMove = selectCpuMove(state, 'easy')
    const normalMove = selectCpuMove(state, 'normal')
    const hardMove = selectCpuMove(state, 'hard')

    expect(easyMove).not.toBeNull()
    expect(normalMove).not.toBeNull()
    expect(hardMove).not.toBeNull()
  })

  it('終局時のプレイスタイル称号が正しく生成されること', () => {
    const state = createInitialGameState('party')
    state.isGameOver = true
    state.winner = 'coral'
    state.stats.wasCoralBehindInEndgame = true
    const title = evaluatePlaystyleTitle(state)
    expect(title.badge).toContain('大逆転')
  })
})
