export interface Point {
  x: number
  y: number
}

export interface CoreItem {
  id: string
  x: number
  y: number
  radius: number
  type: 'gold' | 'iron'
}

export type StageTheme =
  | 'watermelon'
  | 'baumkuchen'
  | 'wagyu'
  | 'geode'
  | 'monster'

export interface StageMotion {
  swayAmpX: number
  swayAmpY: number
  swayFreq: number
  rotSpeed: number
  baseAngle: number
}

export interface StageSpec {
  id: number
  theme: StageTheme
  /** ローカル座標系（中心(0,0)付近、半径約100px）の閉ポリゴン頂点列 */
  vertices: Point[]
  cores: CoreItem[]
  motion: StageMotion
}

export type SliceOutcome = 'PERFECT' | 'GOOD' | 'CATAPULT_CRASH' | 'IRON_CRASH'

export interface SlicePreview {
  isValidDrag: boolean
  lineStart: Point
  lineEnd: Point
  intersectsPolygon: boolean
  hitIron: boolean
  hitGoldIds: string[]
  intersectionPoints: Point[]
}

export interface SliceResult {
  stageId: number
  theme: StageTheme
  outcome: SliceOutcome
  leftRatio: number
  rightRatio: number
  diffFrom50: number
  leftPolygon: Point[]
  rightPolygon: Point[]
  hitGoldCount: number
  hitIron: boolean
  cutAngleRad: number
  cutStart: Point
  cutEnd: Point
  scoreDelta: number
}

/**
 * Mulberry32 シード付き疑似乱数生成器 (0.0 <= r < 1.0)
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * YYYY-MM-DD 文字列から整数シードを生成
 */
export function dateStringToSeed(dateStr: string): number {
  let hash = 2166136261
  for (let i = 0; i < dateStr.length; i++) {
    hash ^= dateStr.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * ポリゴンの符号付き面積の2倍（Shoelace formula）
 */
function signedDoubleArea(poly: Point[]): number {
  if (poly.length < 3) return 0
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i]
    const next = poly[(i + 1) % poly.length]
    sum += curr.x * next.y - next.x * curr.y
  }
  return sum
}

/**
 * ポリゴンの面積を計算
 */
export function calculatePolygonArea(poly: Point[]): number {
  return Math.abs(signedDoubleArea(poly)) * 0.5
}

/**
 * ポリゴンの重心（Centroid）を計算
 */
export function calculatePolygonCentroid(poly: Point[]): Point {
  if (poly.length === 0) return { x: 0, y: 0 }
  const area2 = signedDoubleArea(poly)
  if (Math.abs(area2) < 1e-5) {
    const sum = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), {
      x: 0,
      y: 0,
    })
    return { x: sum.x / poly.length, y: sum.y / poly.length }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i]
    const next = poly[(i + 1) % poly.length]
    const cross = curr.x * next.y - next.x * curr.y
    cx += (curr.x + next.x) * cross
    cy += (curr.y + next.y) * cross
  }
  const factor = 1 / (3 * area2)
  return { x: cx * factor, y: cy * factor }
}

/**
 * 点群を重心中心に正規化する
 */
export function recenterPolygon(poly: Point[]): Point[] {
  const c = calculatePolygonCentroid(poly)
  return poly.map((p) => ({
    x: Math.round((p.x - c.x) * 100) / 100,
    y: Math.round((p.y - c.y) * 100) / 100,
  }))
}

/**
 * ローカル頂点をワールド座標へ変換（回転＋平行移動）
 */
export function transformPoints(
  points: Point[],
  center: Point,
  angleRad: number
): Point[] {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return points.map((p) => ({
    x: center.x + p.x * cos - p.y * sin,
    y: center.y + p.x * sin + p.y * cos,
  }))
}

/**
 * ステージの時刻 t (秒) における中心座標と回転角を取得
 */
export function getStageTransform(
  stage: StageSpec,
  elapsedSec: number,
  baseCenter: Point
): { center: Point; angleRad: number } {
  const { swayAmpX, swayAmpY, swayFreq, rotSpeed, baseAngle } = stage.motion
  const x =
    baseCenter.x + Math.sin(elapsedSec * swayFreq * Math.PI * 2) * swayAmpX
  const y =
    baseCenter.y + Math.cos(elapsedSec * swayFreq * Math.PI * 2) * swayAmpY
  const angleRad = baseAngle + elapsedSec * rotSpeed
  return { center: { x, y }, angleRad }
}

/**
 * 直線 AB に対する点 P の外積 (AB x AP)
 */
function crossLine(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

/**
 * 直線 AB と線分 CD の交点を求める
 */
function intersectLineWithSegment(
  a: Point,
  b: Point,
  c: Point,
  d: Point
): Point {
  const dc1 = crossLine(a, b, c)
  const dc2 = crossLine(a, b, d)
  const denom = dc1 - dc2
  if (Math.abs(denom) < 1e-9) {
    return { x: (c.x + d.x) * 0.5, y: (c.y + d.y) * 0.5 }
  }
  const t = dc1 / denom
  return {
    x: c.x + t * (d.x - c.x),
    y: c.y + t * (d.y - c.y),
  }
}

/**
 * Sutherland-Hodgman アルゴリズムによる半平面クリップ
 * keepSide >= 0 なら左半平面、keepSide < 0 なら右半平面を残す
 */
function clipPolygonHalfPlane(
  poly: Point[],
  lineA: Point,
  lineB: Point,
  keepSign: 1 | -1
): Point[] {
  if (poly.length < 3) return []
  const output: Point[] = []
  const eps = 1e-6

  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i]
    const prev = poly[(i + poly.length - 1) % poly.length]
    const currSide = crossLine(lineA, lineB, curr) * keepSign
    const prevSide = crossLine(lineA, lineB, prev) * keepSign

    const currInside = currSide >= -eps
    const prevInside = prevSide >= -eps

    if (currInside) {
      if (!prevInside) {
        output.push(intersectLineWithSegment(lineA, lineB, prev, curr))
      }
      output.push(curr)
    } else if (prevInside) {
      output.push(intersectLineWithSegment(lineA, lineB, prev, curr))
    }
  }
  return output
}

/**
 * ポリゴンを直線 (lineA -> lineB) で2分割する
 * 画面上の左右（重心X座標が小さい方を leftPolygon、大きい方を rightPolygon）として返す
 */
export function splitPolygonByLine(
  poly: Point[],
  lineA: Point,
  lineB: Point
): { leftPolygon: Point[]; rightPolygon: Point[]; intersections: Point[] } {
  const dx = lineB.x - lineA.x
  const dy = lineB.y - lineA.y
  if (Math.hypot(dx, dy) < 1e-3) {
    return { leftPolygon: [], rightPolygon: [], intersections: [] }
  }

  const sidePos = clipPolygonHalfPlane(poly, lineA, lineB, 1)
  const sideNeg = clipPolygonHalfPlane(poly, lineA, lineB, -1)

  const areaPos = calculatePolygonArea(sidePos)
  const areaNeg = calculatePolygonArea(sideNeg)

  // 交点リストの抽出（切断面のエッジハイライト描画用）
  const intersections: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i]
    const d = poly[(i + 1) % poly.length]
    const s1 = crossLine(lineA, lineB, c)
    const s2 = crossLine(lineA, lineB, d)
    if ((s1 <= 0 && s2 > 0) || (s1 >= 0 && s2 < 0)) {
      intersections.push(intersectLineWithSegment(lineA, lineB, c, d))
    }
  }

  if (areaPos < 10 || areaNeg < 10) {
    return { leftPolygon: [], rightPolygon: [], intersections }
  }

  const cPos = calculatePolygonCentroid(sidePos)
  const cNeg = calculatePolygonCentroid(sideNeg)

  // 重心のX座標（同値ならY座標）で左右を決定
  if (
    cPos.x < cNeg.x ||
    (Math.abs(cPos.x - cNeg.x) < 1e-2 && cPos.y <= cNeg.y)
  ) {
    return {
      leftPolygon: sidePos,
      rightPolygon: sideNeg,
      intersections,
    }
  }
  return {
    leftPolygon: sideNeg,
    rightPolygon: sidePos,
    intersections,
  }
}

/**
 * 線分 AB と円 (center, radius) の交差判定
 */
export function doesSegmentHitCircle(
  a: Point,
  b: Point,
  center: Point,
  radius: number
): boolean {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const lenSq = vx * vx + vy * vy
  if (lenSq < 1e-6) {
    return Math.hypot(center.x - a.x, center.y - a.y) <= radius
  }
  let t = ((center.x - a.x) * vx + (center.y - a.y) * vy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * vx
  const projY = a.y + t * vy
  return Math.hypot(center.x - projX, center.y - projY) <= radius
}

/**
 * ドラッグ始点・終点からキャンバスを貫くレーザー線分へ延長する
 */
export function extendSliceLine(
  dragStart: Point,
  dragEnd: Point,
  span = 420
): { start: Point; end: Point; isValid: boolean; angleRad: number } {
  const dx = dragEnd.x - dragStart.x
  const dy = dragEnd.y - dragStart.y
  const dist = Math.hypot(dx, dy)
  if (dist < 16) {
    return { start: dragStart, end: dragEnd, isValid: false, angleRad: 0 }
  }
  const midX = (dragStart.x + dragEnd.x) * 0.5
  const midY = (dragStart.y + dragEnd.y) * 0.5
  const ux = dx / dist
  const uy = dy / dist
  return {
    start: { x: midX - ux * span, y: midY - uy * span },
    end: { x: midX + ux * span, y: midY + uy * span },
    isValid: true,
    angleRad: Math.atan2(dy, dx),
  }
}

/**
 * ドラッグ中のリアルタイム切断プレビュー計算
 */
export function previewSlice(
  worldVertices: Point[],
  worldCores: CoreItem[],
  dragStart: Point,
  dragEnd: Point
): SlicePreview {
  const extended = extendSliceLine(dragStart, dragEnd)
  if (!extended.isValid) {
    return {
      isValidDrag: false,
      lineStart: dragStart,
      lineEnd: dragEnd,
      intersectsPolygon: false,
      hitIron: false,
      hitGoldIds: [],
      intersectionPoints: [],
    }
  }

  const { leftPolygon, rightPolygon, intersections } = splitPolygonByLine(
    worldVertices,
    extended.start,
    extended.end
  )
  const intersectsPolygon = leftPolygon.length >= 3 && rightPolygon.length >= 3

  let hitIron = false
  const hitGoldIds: string[] = []

  for (const core of worldCores) {
    if (
      doesSegmentHitCircle(extended.start, extended.end, core, core.radius)
    ) {
      if (core.type === 'iron') {
        hitIron = true
      } else {
        hitGoldIds.push(core.id)
      }
    }
  }

  return {
    isValidDrag: true,
    lineStart: extended.start,
    lineEnd: extended.end,
    intersectsPolygon,
    hitIron,
    hitGoldIds,
    intersectionPoints: intersections,
  }
}

/**
 * 一閃リリース時の切断実行＆天秤比率・勝敗判定
 */
export function executeSlice(
  stage: StageSpec,
  worldVertices: Point[],
  worldCores: CoreItem[],
  dragStart: Point,
  dragEnd: Point
): SliceResult {
  const extended = extendSliceLine(dragStart, dragEnd)
  const preview = previewSlice(worldVertices, worldCores, dragStart, dragEnd)

  // 1. 鉄芯（💀）に激突した場合 -> 刀身粉砕＆まな板・床真っ二つ事故
  if (preview.hitIron) {
    return {
      stageId: stage.id,
      theme: stage.theme,
      outcome: 'IRON_CRASH',
      leftRatio: 100,
      rightRatio: 0,
      diffFrom50: 50,
      leftPolygon: worldVertices,
      rightPolygon: [],
      hitGoldCount: 0,
      hitIron: true,
      cutAngleRad: extended.angleRad,
      cutStart: extended.start,
      cutEnd: extended.end,
      scoreDelta: 0,
    }
  }

  const { leftPolygon, rightPolygon } = splitPolygonByLine(
    worldVertices,
    extended.start,
    extended.end
  )

  const areaL = calculatePolygonArea(leftPolygon)
  const areaR = calculatePolygonArea(rightPolygon)
  const totalArea = areaL + areaR

  // 2. 空振り、または端っこを1%未満かすめただけの場合 -> 天秤カタパルト大崩壊
  if (leftPolygon.length < 3 || rightPolygon.length < 3 || totalArea < 50) {
    return {
      stageId: stage.id,
      theme: stage.theme,
      outcome: 'CATAPULT_CRASH',
      leftRatio: 100,
      rightRatio: 0,
      diffFrom50: 50,
      leftPolygon: worldVertices,
      rightPolygon: [],
      hitGoldCount: 0,
      hitIron: false,
      cutAngleRad: extended.angleRad,
      cutStart: extended.start,
      cutEnd: extended.end,
      scoreDelta: 0,
    }
  }

  const rawLeft = (areaL / totalArea) * 100
  const leftRatio = Math.round(rawLeft * 10) / 10
  const rightRatio = Math.round((100 - leftRatio) * 10) / 10
  const diffFrom50 = Math.round(Math.abs(50 - leftRatio) * 10) / 10

  const hitGoldCount = preview.hitGoldIds.length

  let outcome: SliceOutcome
  if (diffFrom50 <= 2.5) {
    outcome = 'PERFECT'
  } else if (diffFrom50 <= 12.0) {
    outcome = 'GOOD'
  } else {
    outcome = 'CATAPULT_CRASH'
  }

  const accuracyScore = Math.max(0, Math.round((12.5 - diffFrom50) * 80))
  const goldBonus = hitGoldCount * 400
  const perfectBonus = outcome === 'PERFECT' ? 500 : 0
  const scoreDelta =
    outcome === 'CATAPULT_CRASH'
      ? 0
      : accuracyScore + goldBonus + perfectBonus

  return {
    stageId: stage.id,
    theme: stage.theme,
    outcome,
    leftRatio,
    rightRatio,
    diffFrom50,
    leftPolygon,
    rightPolygon,
    hitGoldCount,
    hitIron: false,
    cutAngleRad: extended.angleRad,
    cutStart: extended.start,
    cutEnd: extended.end,
    scoreDelta,
  }
}

/**
 * 全5ステージの生成（シード対応・中央縦切りボット対策済み）
 */
export function createStages(seed = 20261108): StageSpec[] {
  const rand = createSeededRandom(seed)
  const jitter = (amp: number) => (rand() - 0.5) * amp

  // Stage 1: 洋梨・非対称スイカ塊（下半分が重く、右側に膨らみがある）
  // 中心(0,0)をそのままにして右側にコブを持たせることで、x=0の縦切りでは比率が大きくズレる
  const stage1Verts: Point[] = [
    { x: -15, y: -96 },
    { x: 35, y: -90 },
    { x: 92, y: -40 },
    { x: 118, y: 25 },
    { x: 95, y: 88 },
    { x: 25, y: 102 },
    { x: -55, y: 92 },
    { x: -92, y: 40 },
    { x: -78, y: -35 },
  ]

  // Stage 2: 非対称L字バウムクーヘン塊＋黄金コア
  // 右側に大きく重心が偏っており、x=0の縦切りだと約 28% : 72% で CATAPULT_CRASH になる
  const stage2Verts: Point[] = [
    { x: -48, y: -96 },
    { x: 46, y: -95 },
    { x: 52, y: -12 },
    { x: 132, y: -6 },
    { x: 136, y: 88 },
    { x: 18, y: 98 },
    { x: -46, y: 88 },
    { x: -52, y: -10 },
  ]

  // Stage 3: 中央に超硬鉄芯（💀）が鎮座する霜降り塊
  // x=0 の中央縦切りをすると 100% 鉄芯(0,0)に激突して刀が粉々に折れる（IRON_CRASH）！
  // 斜め対角線（左上〜右下、または右上〜左下）で鉄芯を避けつつ黄金コアを抜くステージ
  const stage3Verts: Point[] = recenterPolygon([
    { x: -85, y: -75 },
    { x: 15, y: -102 },
    { x: 98, y: -62 },
    { x: 112, y: 20 },
    { x: 75, y: 96 },
    { x: -20, y: 104 },
    { x: -96, y: 58 },
    { x: -108, y: -15 },
  ])

  // Stage 4: 左右に振り子スイングする結晶ジオード塊＋鉄芯＆黄金コア2個
  const stage4Verts: Point[] = recenterPolygon([
    { x: 0 + jitter(10), y: -105 },
    { x: 82 + jitter(10), y: -68 },
    { x: 114 + jitter(10), y: 12 },
    { x: 68 + jitter(10), y: 94 },
    { x: -18 + jitter(10), y: 102 },
    { x: -94 + jitter(10), y: 62 },
    { x: -106 + jitter(10), y: -25 },
  ])

  // Stage 5: 回転＆揺動するカオス複合塊＋ツイン鉄芯スリット＆黄金コア
  const stage5Verts: Point[] = recenterPolygon([
    { x: -45 + jitter(12), y: -104 },
    { x: 52 + jitter(12), y: -98 },
    { x: 112 + jitter(12), y: -32 },
    { x: 96 + jitter(12), y: 64 },
    { x: 18 + jitter(12), y: 108 },
    { x: -72 + jitter(12), y: 84 },
    { x: -114 + jitter(12), y: 8 },
    { x: -92 + jitter(12), y: -68 },
  ])

  return [
    {
      id: 1,
      theme: 'watermelon',
      vertices: stage1Verts,
      cores: [{ id: 'g1', x: 16, y: 8, radius: 18, type: 'gold' }],
      motion: {
        swayAmpX: 0,
        swayAmpY: 4,
        swayFreq: 0.6,
        rotSpeed: 0,
        baseAngle: 0,
      },
    },
    {
      id: 2,
      theme: 'baumkuchen',
      vertices: stage2Verts,
      cores: [{ id: 'g2', x: 14, y: 18, radius: 18, type: 'gold' }],
      motion: {
        swayAmpX: 12,
        swayAmpY: 4,
        swayFreq: 0.5,
        rotSpeed: 0,
        baseAngle: 0,
      },
    },
    {
      id: 3,
      theme: 'wagyu',
      vertices: stage3Verts,
      cores: [
        { id: 'i3', x: 0, y: 0, radius: 24, type: 'iron' },
        { id: 'g3', x: -36, y: 24, radius: 16, type: 'gold' },
      ],
      motion: {
        swayAmpX: 18,
        swayAmpY: 6,
        swayFreq: 0.55,
        rotSpeed: 0,
        baseAngle: 0.1,
      },
    },
    {
      id: 4,
      theme: 'geode',
      vertices: stage4Verts,
      cores: [
        { id: 'i4', x: 34, y: -22, radius: 22, type: 'iron' },
        { id: 'g4a', x: -24, y: -20, radius: 15, type: 'gold' },
        { id: 'g4b', x: 18, y: 26, radius: 15, type: 'gold' },
      ],
      motion: {
        swayAmpX: 44,
        swayAmpY: 6,
        swayFreq: 0.65,
        rotSpeed: 0.25,
        baseAngle: 0,
      },
    },
    {
      id: 5,
      theme: 'monster',
      vertices: stage5Verts,
      cores: [
        { id: 'i5a', x: -38, y: -26, radius: 21, type: 'iron' },
        { id: 'i5b', x: 38, y: 26, radius: 21, type: 'iron' },
        { id: 'g5', x: 0, y: 0, radius: 17, type: 'gold' },
      ],
      motion: {
        swayAmpX: 36,
        swayAmpY: 10,
        swayFreq: 0.7,
        rotSpeed: 0.42,
        baseAngle: 0.2,
      },
    },
  ]
}
