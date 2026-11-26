import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from 'pdf-lib'

export const MAX_PDF_FILE_BYTES = 50 * 1024 * 1024
export const WARN_PDF_FILE_BYTES = 20 * 1024 * 1024
export const MAX_PDF_PAGES = 50
export const MAX_PAGE_CANVAS_AREA_PX = 12_000_000
export const MAX_PAGE_CANVAS_EDGE_PX = 3_500
export const MAX_PDFJS_IMAGE_SIZE = 16_777_216

export type RedactionColor = 'black' | 'white'
export type RedactionPresetId = 'compact' | 'standard' | 'high' | 'lossless'

export interface RedactionPreset {
  id: RedactionPresetId
  label: string
  description: string
  dpi: number
  format: 'jpeg' | 'png'
  jpegQuality: number
}

export const REDACTION_PRESETS: Record<RedactionPresetId, RedactionPreset> = {
  compact: {
    id: 'compact',
    label: '軽量 (100 DPI / JPEG)',
    description: 'ファイル容量を抑えたいメール添付・社内共有向け',
    dpi: 100,
    format: 'jpeg',
    jpegQuality: 0.8,
  },
  standard: {
    id: 'standard',
    label: '標準 (150 DPI / JPEG)',
    description: '文字の読みやすさと容量のバランスに優れた推奨設定',
    dpi: 150,
    format: 'jpeg',
    jpegQuality: 0.88,
  },
  high: {
    id: 'high',
    label: '高精細 (200 DPI / JPEG)',
    description: '小さい文字・印影をくっきり残したい契約書・申請書類向け',
    dpi: 200,
    format: 'jpeg',
    jpegQuality: 0.92,
  },
  lossless: {
    id: 'lossless',
    label: '可逆高画質 (150 DPI / PNG)',
    description: 'JPEG圧縮ノイズを出さない図表・スクリーンショット中心向け',
    dpi: 150,
    format: 'png',
    jpegQuality: 1,
  },
}

export interface RedactionRect {
  id: string
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
  color: RedactionColor
  label?: string
  source?: 'manual' | 'auto-pii' | 'full-page'
}

export interface PdfMetadataEntry {
  key: string
  label: string
  valuePreview: string
}

export interface PdfPageSummary {
  pageNumber: number
  widthPt: number
  heightPt: number
  rotation: number
  annotationCount: number
}

export interface PdfStructureReport {
  pageCount: number
  byteSize: number
  pages: PdfPageSummary[]
  metadataEntries: PdfMetadataEntry[]
  hasXmpMetadata: boolean
  hasAcroForm: boolean
  hasEmbeddedFiles: boolean
  hasOutlines: boolean
  hasOptionalContent: boolean
  hasJavaScript: boolean
  totalAnnotations: number
  totalRiskItems: number
}

export interface PdfTextItemBox {
  str: string
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
}

export interface PiiTextCandidate {
  id: string
  category: 'email' | 'secret' | 'phone' | 'creditCard' | 'myNumber' | 'postalCode' | 'ipv4'
  categoryLabel: string
  matchedPreview: string
  rect: RedactionRect
}

export interface RasterizedPageAsset {
  pageNumber: number
  widthPt: number
  heightPt: number
  format: 'jpeg' | 'png'
  imageBytes: Uint8Array
}

export interface PdfVerificationReport {
  byteSize: number
  pageCount: number
  extractedTextCharCount: number
  metadataCount: number
  totalAnnotations: number
  hasXmpMetadata: boolean
  hasAcroForm: boolean
  hasEmbeddedFiles: boolean
  hasJavaScript: boolean
  totalRiskItems: number
  isSafe: boolean
}

const STANDARD_INFO_LABELS: Record<string, string> = {
  Title: 'タイトル (Title)',
  Author: '作成者 (Author)',
  Subject: 'サブタイトル (Subject)',
  Keywords: 'キーワード (Keywords)',
  Creator: '作成アプリケーション (Creator)',
  Producer: 'PDF変換ソフト (Producer)',
  CreationDate: '作成日時 (CreationDate)',
  ModDate: '更新日時 (ModDate)',
}

const PII_TEXT_PATTERNS: {
  category: PiiTextCandidate['category']
  categoryLabel: string
  regex: RegExp
}[] = [
  {
    category: 'secret',
    categoryLabel: 'APIキー・トークン',
    regex:
      /(?:sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{12,}|AIza[0-9A-Za-z_-]{20,})/g,
  },
  {
    category: 'email',
    categoryLabel: 'メールアドレス',
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    category: 'creditCard',
    categoryLabel: 'カード番号候補',
    regex: /(?<![0-9-])(?:\d{4}[-\s]?){3}\d{4}(?![0-9-])/g,
  },
  {
    category: 'phone',
    categoryLabel: '電話番号',
    regex: /(?<![0-9-])(?:0\d{1,4}-\d{1,4}-\d{3,4}|(?:\+81|0)[789]0-?\d{4}-?\d{4})(?![0-9-])/g,
  },
  {
    category: 'myNumber',
    categoryLabel: 'マイナンバー候補 (12桁)',
    regex: /(?<![0-9-])\d{4}[-\s]?\d{4}[-\s]?\d{4}(?![0-9-])/g,
  },
  {
    category: 'postalCode',
    categoryLabel: '郵便番号',
    regex: /〒?\s?\d{3}-\d{4}(?![0-9-])/g,
  },
  {
    category: 'ipv4',
    categoryLabel: 'IPv4アドレス',
    regex:
      /(?<![0-9.])(?:(?:25[0-5]|2[0-4]\d|1?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|1?\d\d?)(?![0-9.])/g,
  },
]

export function validatePdfUploadSize(
  bytes: number
): { ok: true; warning?: string } | { ok: false; error: string } {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, error: '空のファイルは読み込めません。' }
  }
  if (bytes > MAX_PDF_FILE_BYTES) {
    return {
      ok: false,
      error: `ファイルサイズが上限（${formatPdfBytes(MAX_PDF_FILE_BYTES)}）を超えています。分割してから再度お試しください。`,
    }
  }
  if (bytes > WARN_PDF_FILE_BYTES) {
    return {
      ok: true,
      warning: `大容量PDF（${formatPdfBytes(bytes)}）のため、書き出しに時間がかかる場合があります。`,
    }
  }
  return { ok: true }
}

export function formatPdfBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function normalizeRectCoords(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; width: number; height: number } {
  const left = clampUnit(Math.min(x1, x2))
  const right = clampUnit(Math.max(x1, x2))
  const top = clampUnit(Math.min(y1, y2))
  const bottom = clampUnit(Math.max(y1, y2))
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

/**
 * アンチエイリアスや端数丸めによる文字滲み・隙間漏れを防ぐため、
 * 正規化座標を外側へ marginPx ピクセル拡張して整数ピクセル境界へ丸める。
 */
export function expandRectToSafePixelBounds(
  rect: Pick<RedactionRect, 'x' | 'y' | 'width' | 'height'>,
  canvasWidth: number,
  canvasHeight: number,
  marginPx = 2
): { x: number; y: number; width: number; height: number } {
  const safeMargin = Math.max(0, Math.round(marginPx))
  const left = Math.max(0, Math.floor(clampUnit(rect.x) * canvasWidth) - safeMargin)
  const top = Math.max(0, Math.floor(clampUnit(rect.y) * canvasHeight) - safeMargin)
  const right = Math.min(
    canvasWidth,
    Math.ceil((clampUnit(rect.x) + clampUnit(rect.width)) * canvasWidth) + safeMargin
  )
  const bottom = Math.min(
    canvasHeight,
    Math.ceil((clampUnit(rect.y) + clampUnit(rect.height)) * canvasHeight) + safeMargin
  )
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

/**
 * 1ページあたりの総ピクセル面積と長辺上限を守って安全な描画スケールを算出する。
 */
export function computeSafeRenderViewport(
  widthPt: number,
  heightPt: number,
  targetDpi: number
): { scale: number; pixelWidth: number; pixelHeight: number; clamped: boolean } {
  const safeW = Math.max(1, widthPt)
  const safeH = Math.max(1, heightPt)
  const requestedScale = Math.max(0.5, targetDpi / 72)

  let scale = requestedScale
  let clamped = false

  const maxDimScale = MAX_PAGE_CANVAS_EDGE_PX / Math.max(safeW, safeH)
  if (scale > maxDimScale) {
    scale = maxDimScale
    clamped = true
  }

  const areaAtScale = safeW * scale * (safeH * scale)
  if (areaAtScale > MAX_PAGE_CANVAS_AREA_PX) {
    const areaScale = Math.sqrt(MAX_PAGE_CANVAS_AREA_PX / (safeW * safeH))
    if (areaScale < scale) {
      scale = areaScale
      clamped = true
    }
  }

  const pixelWidth = Math.max(1, Math.round(safeW * scale))
  const pixelHeight = Math.max(1, Math.round(safeH * scale))

  return {
    scale,
    pixelWidth,
    pixelHeight,
    clamped,
  }
}

export function buildRedactedFilename(
  originalName: string,
  anonymize: boolean
): string {
  if (anonymize) {
    return 'redacted-document.pdf'
  }
  const baseOnly = (originalName || 'document')
    .split(/[/\\]/)
    .pop()!
    .replace(/\.pdf$/i, '')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim()
  const safeBase = baseOnly || 'document'
  return `${safeBase.slice(0, 80)}-redacted.pdf`
}

function previewMetadataValue(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact
}

function decodePdfTextValue(val: unknown): string {
  if (val instanceof PDFString || val instanceof PDFHexString) {
    return val.decodeText()
  }
  if (typeof val === 'string') return val
  return String(val ?? '')
}

export async function inspectPdfStructure(
  bytes: Uint8Array
): Promise<PdfStructureReport> {
  if (bytes.byteLength < 5) {
    throw new Error('有効なPDFファイルではありません（ファイルサイズが小さすぎます）。')
  }

  let pdfDoc: PDFDocument
  let pages: ReturnType<PDFDocument['getPages']>
  try {
    pdfDoc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    })
    pages = pdfDoc.getPages()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/encrypt/i.test(msg)) {
      throw new Error(
        'パスワードで保護（暗号化）されたPDFはそのまま処理できません。事前に保護を解除したPDFをご使用ください。'
      )
    }
    throw new Error(
      `PDFの解析に失敗しました。ファイルが破損しているか非対応形式の可能性があります（${msg}）。`
    )
  }

  if (pages.length > MAX_PDF_PAGES) {
    throw new Error(
      `ページ数が上限（${MAX_PDF_PAGES}ページ）を超えています（現在 ${pages.length}ページ）。分割してからお試しください。`
    )
  }

  const pageSummaries: PdfPageSummary[] = pages.map((page, index) => {
    const size = page.getSize()
    const rotation = page.getRotation().angle
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    return {
      pageNumber: index + 1,
      widthPt: size.width,
      heightPt: size.height,
      rotation,
      annotationCount: annots ? annots.size() : 0,
    }
  })

  const metadataEntries: PdfMetadataEntry[] = []
  const seenKeys = new Set<string>()

  const pushMeta = (key: string, value: string | undefined) => {
    const trimmed = (value || '').trim()
    if (!trimmed || seenKeys.has(key)) return
    seenKeys.add(key)
    metadataEntries.push({
      key,
      label: STANDARD_INFO_LABELS[key] || `カスタム項目 (${key})`,
      valuePreview: previewMetadataValue(trimmed),
    })
  }

  pushMeta('Title', pdfDoc.getTitle())
  pushMeta('Author', pdfDoc.getAuthor())
  pushMeta('Subject', pdfDoc.getSubject())
  pushMeta('Keywords', pdfDoc.getKeywords())
  pushMeta('Creator', pdfDoc.getCreator())
  pushMeta('Producer', pdfDoc.getProducer())
  const cDate = pdfDoc.getCreationDate()
  if (cDate && !Number.isNaN(cDate.getTime())) {
    pushMeta('CreationDate', cDate.toISOString())
  }
  const mDate = pdfDoc.getModificationDate()
  if (mDate && !Number.isNaN(mDate.getTime())) {
    pushMeta('ModDate', mDate.toISOString())
  }

  // trailerInfo.Info 上のカスタムメタデータや独自キーも漏れなく捕捉
  const infoRef = pdfDoc.context.trailerInfo.Info
  if (infoRef) {
    const infoDict = pdfDoc.context.lookupMaybe(infoRef, PDFDict)
    if (infoDict) {
      for (const [nameKey, val] of infoDict.entries()) {
        const keyStr = nameKey.decodeText()
        if (seenKeys.has(keyStr)) continue
        const decoded = decodePdfTextValue(pdfDoc.context.lookup(val))
        if (decoded.trim()) {
          pushMeta(keyStr, decoded)
        }
      }
    }
  }

  const hasXmpMetadata = pdfDoc.catalog.has(PDFName.of('Metadata'))
  const hasAcroForm = pdfDoc.catalog.has(PDFName.of('AcroForm'))
  const hasOutlines = pdfDoc.catalog.has(PDFName.of('Outlines'))
  const hasOptionalContent = pdfDoc.catalog.has(PDFName.of('OCProperties'))

  const namesDict = pdfDoc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)
  const hasEmbeddedFiles = Boolean(
    namesDict && namesDict.has(PDFName.of('EmbeddedFiles'))
  )
  const hasJavaScript = Boolean(
    (namesDict && namesDict.has(PDFName.of('JavaScript'))) ||
      pdfDoc.catalog.has(PDFName.of('OpenAction')) ||
      pdfDoc.catalog.has(PDFName.of('AA'))
  )

  const totalAnnotations = pageSummaries.reduce(
    (sum, p) => sum + p.annotationCount,
    0
  )

  const totalRiskItems =
    metadataEntries.length +
    totalAnnotations +
    (hasXmpMetadata ? 1 : 0) +
    (hasAcroForm ? 1 : 0) +
    (hasEmbeddedFiles ? 1 : 0) +
    (hasOptionalContent ? 1 : 0) +
    (hasJavaScript ? 1 : 0)

  return {
    pageCount: pages.length,
    byteSize: bytes.byteLength,
    pages: pageSummaries,
    metadataEntries,
    hasXmpMetadata,
    hasAcroForm,
    hasEmbeddedFiles,
    hasOutlines,
    hasOptionalContent,
    hasJavaScript,
    totalAnnotations,
    totalRiskItems,
  }
}

function maskCandidatePreview(raw: string): string {
  const compact = raw.trim()
  if (compact.length <= 6) return '••••••'
  return `${compact.slice(0, 3)}•••${compact.slice(-2)}`
}

export function detectPiiCandidatesFromTextItems(
  items: PdfTextItemBox[],
  pageNumber: number,
  pageWidthPt: number,
  pageHeightPt: number,
  color: RedactionColor = 'black'
): PiiTextCandidate[] {
  if (pageWidthPt <= 0 || pageHeightPt <= 0) return []
  const candidates: PiiTextCandidate[] = []
  let seq = 1

  for (const item of items) {
    const text = item.str
    if (!text || text.trim().length < 4 || item.widthPt <= 0 || item.heightPt <= 0) {
      continue
    }

    const occupiedRanges: [number, number][] = []

    for (const pattern of PII_TEXT_PATTERNS) {
      pattern.regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.regex.exec(text)) !== null) {
        const start = match.index
        const end = start + match[0].length
        const overlaps = occupiedRanges.some(
          ([s, e]) => start < e && end > s
        )
        if (overlaps) continue
        occupiedRanges.push([start, end])

        const totalChars = Math.max(1, text.length)
        const startRatio = start / totalChars
        const spanRatio = (end - start) / totalChars

        const boxXPt = item.xPt + item.widthPt * startRatio
        const boxWidthPt = Math.max(6, item.widthPt * spanRatio)

        const padX = 0.004
        const padY = 0.003
        const norm = normalizeRectCoords(
          boxXPt / pageWidthPt - padX,
          item.yPt / pageHeightPt - padY,
          (boxXPt + boxWidthPt) / pageWidthPt + padX,
          (item.yPt + item.heightPt) / pageHeightPt + padY
        )

        if (norm.width <= 0 || norm.height <= 0) continue

        candidates.push({
          id: `pii-p${pageNumber}-${seq++}`,
          category: pattern.category,
          categoryLabel: pattern.categoryLabel,
          matchedPreview: maskCandidatePreview(match[0]),
          rect: {
            id: `rect-auto-p${pageNumber}-${seq}`,
            pageNumber,
            x: norm.x,
            y: norm.y,
            width: norm.width,
            height: norm.height,
            color,
            label: pattern.categoryLabel,
            source: 'auto-pii',
          },
        })
      }
    }
  }

  return candidates
}

/**
 * ラスタライズ済みページ画像配列から、メタデータ・テキスト・注釈・JSを一切含まない
 * 新規PDFドキュメントを構築して出力する。
 */
export async function buildRedactedPdfFromImages(
  pages: RasterizedPageAsset[]
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error('出力対象のページが1ページも選択されていません。')
  }

  const outDoc = await PDFDocument.create({ updateMetadata: false })

  // pdf-lib が内部生成する可能性のある /Info 辞書・XMP参照を確実に除去
  if (outDoc.context.trailerInfo.Info) {
    delete outDoc.context.trailerInfo.Info
  }
  if (outDoc.catalog.has(PDFName.of('Metadata'))) {
    outDoc.catalog.delete(PDFName.of('Metadata'))
  }

  for (const pageAsset of pages) {
    const embedded =
      pageAsset.format === 'png'
        ? await outDoc.embedPng(pageAsset.imageBytes)
        : await outDoc.embedJpg(pageAsset.imageBytes)

    const page = outDoc.addPage([
      Math.max(1, pageAsset.widthPt),
      Math.max(1, pageAsset.heightPt),
    ])
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: Math.max(1, pageAsset.widthPt),
      height: Math.max(1, pageAsset.heightPt),
    })
  }

  // save前にもInfo辞書が生成されていないことを二重確認
  if (outDoc.context.trailerInfo.Info) {
    delete outDoc.context.trailerInfo.Info
  }

  return outDoc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  })
}

export async function verifyRedactedPdfOutput(
  outputBytes: Uint8Array,
  extractedTextCharCount: number
): Promise<PdfVerificationReport> {
  const structure = await inspectPdfStructure(outputBytes)
  const metadataCount = structure.metadataEntries.length
  const isSafe =
    extractedTextCharCount === 0 &&
    metadataCount === 0 &&
    structure.totalRiskItems === 0

  return {
    byteSize: structure.byteSize,
    pageCount: structure.pageCount,
    extractedTextCharCount,
    metadataCount,
    totalAnnotations: structure.totalAnnotations,
    hasXmpMetadata: structure.hasXmpMetadata,
    hasAcroForm: structure.hasAcroForm,
    hasEmbeddedFiles: structure.hasEmbeddedFiles,
    hasJavaScript: structure.hasJavaScript,
    totalRiskItems: structure.totalRiskItems,
    isSafe,
  }
}
