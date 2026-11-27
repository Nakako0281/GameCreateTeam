import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFPage,
  PDFStream,
  degrees,
} from 'pdf-lib'
import {
  formatPdfBytes,
  inspectPdfStructure,
  type PdfStructureReport,
} from './pdf-redactor'

export const MAX_ORGANIZER_FILE_BYTES = 50 * 1024 * 1024
export const MAX_ORGANIZER_TOTAL_BYTES = 80 * 1024 * 1024
export const MAX_ORGANIZER_FILES = 20
export const MAX_ORGANIZER_TOTAL_PAGES = 100

export const A4_PORTRAIT_WIDTH_PT = 595.28
export const A4_PORTRAIT_HEIGHT_PT = 841.89

export type OrganizerOutputMode = 'merge' | 'split-ranges' | 'split-each'

export interface OrganizerSourceFile {
  id: string
  fileName: string
  byteSize: number
  pageCount: number
  structure: PdfStructureReport
  bytes: Uint8Array
}

export interface OrganizerPageItem {
  id: string
  kind: 'source' | 'blank'
  sourceFileId: string
  sourceFileName: string
  sourcePageIndex: number
  originalPageNumber: number
  widthPt: number
  heightPt: number
  baseRotation: number
  rotationDelta: number
  included: boolean
  selected: boolean
}

export interface PaperSizeDescriptor {
  label: string
  dimensionsMm: string
  orientation: 'portrait' | 'landscape' | 'square'
}

export interface SplitGroupSpec {
  label: string
  fileSuffix: string
  oneBasedIndices: number[]
}

export interface OrganizedPdfArtifact {
  fileName: string
  bytes: Uint8Array
  byteSize: number
  pageCount: number
  verification: PdfStructureReport
}

export interface OrganizerBuildResult {
  mode: OrganizerOutputMode
  artifacts: OrganizedPdfArtifact[]
  zipArchive: {
    fileName: string
    bytes: Uint8Array
    byteSize: number
  } | null
  totalInputRiskItems: number
  totalOutputRiskItems: number
}

const PT_TO_MM = 25.4 / 72

const STANDARD_PAPER_SIZES_MM: { name: string; shortMm: number; longMm: number }[] = [
  { name: 'A3', shortMm: 297, longMm: 420 },
  { name: 'A4', shortMm: 210, longMm: 297 },
  { name: 'A5', shortMm: 148, longMm: 210 },
  { name: 'B4', shortMm: 257, longMm: 364 },
  { name: 'B5', shortMm: 182, longMm: 257 },
  { name: 'Letter', shortMm: 215.9, longMm: 279.4 },
  { name: 'Legal', shortMm: 215.9, longMm: 355.6 },
]

export function normalizeRotationAngle(angle: number): number {
  const mod = ((Math.round(angle) % 360) + 360) % 360
  if (mod === 90 || mod === 180 || mod === 270) return mod
  return 0
}

export function describePaperSize(
  widthPt: number,
  heightPt: number,
  effectiveRotationDeg = 0
): PaperSizeDescriptor {
  const rot = normalizeRotationAngle(effectiveRotationDeg)
  const swapped = rot === 90 || rot === 270
  const effW = swapped ? heightPt : widthPt
  const effH = swapped ? widthPt : heightPt

  const wMm = effW * PT_TO_MM
  const hMm = effH * PT_TO_MM
  const shortMm = Math.min(wMm, hMm)
  const longMm = Math.max(wMm, hMm)

  const orientation: PaperSizeDescriptor['orientation'] =
    Math.abs(effW - effH) < 2
      ? 'square'
      : effW > effH
        ? 'landscape'
        : 'portrait'

  const orientJa =
    orientation === 'landscape'
      ? '横'
      : orientation === 'portrait'
        ? '縦'
        : '正方形'

  let matchedName = 'カスタム'
  for (const spec of STANDARD_PAPER_SIZES_MM) {
    if (
      Math.abs(shortMm - spec.shortMm) <= 4.5 &&
      Math.abs(longMm - spec.longMm) <= 4.5
    ) {
      matchedName = spec.name
      break
    }
  }

  return {
    label: `${matchedName} ${orientJa}`,
    dimensionsMm: `${Math.round(wMm)}×${Math.round(hMm)}mm`,
    orientation,
  }
}

export function validateOrganizerFileAdd(
  existingTotalBytes: number,
  existingFileCount: number,
  newFileBytes: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(newFileBytes) || newFileBytes <= 0) {
    return { ok: false, error: '空のPDFファイルは読み込めません。' }
  }
  if (existingFileCount >= MAX_ORGANIZER_FILES) {
    return {
      ok: false,
      error: `一度に読み込めるPDFファイル数の上限（${MAX_ORGANIZER_FILES}ファイル）に達しています。`,
    }
  }
  if (newFileBytes > MAX_ORGANIZER_FILE_BYTES) {
    return {
      ok: false,
      error: `1ファイルのサイズ上限（${formatPdfBytes(MAX_ORGANIZER_FILE_BYTES)}）を超えています。`,
    }
  }
  if (existingTotalBytes + newFileBytes > MAX_ORGANIZER_TOTAL_BYTES) {
    return {
      ok: false,
      error: `合計ファイルサイズが上限（${formatPdfBytes(MAX_ORGANIZER_TOTAL_BYTES)}）を超えます。不要なファイルを削除してください。`,
    }
  }
  return { ok: true }
}

export async function inspectOrganizerSourcePdf(
  bytes: Uint8Array,
  fileName: string,
  fileId: string,
  existingTotalPages = 0
): Promise<{ source: OrganizerSourceFile; pages: OrganizerPageItem[] }> {
  const structure = await inspectPdfStructure(bytes, {
    maxPages: MAX_ORGANIZER_TOTAL_PAGES,
  })
  if (existingTotalPages + structure.pageCount > MAX_ORGANIZER_TOTAL_PAGES) {
    throw new Error(
      `合計ページ数が上限（${MAX_ORGANIZER_TOTAL_PAGES}ページ）を超えます（現在 ${existingTotalPages}ページ + 追加 ${structure.pageCount}ページ）。`
    )
  }

  const source: OrganizerSourceFile = {
    id: fileId,
    fileName,
    byteSize: bytes.byteLength,
    pageCount: structure.pageCount,
    structure,
    bytes,
  }

  const pages: OrganizerPageItem[] = structure.pages.map((p) => ({
    id: `${fileId}-p${p.pageNumber}`,
    kind: 'source',
    sourceFileId: fileId,
    sourceFileName: fileName,
    sourcePageIndex: p.pageNumber - 1,
    originalPageNumber: p.pageNumber,
    widthPt: p.widthPt,
    heightPt: p.heightPt,
    baseRotation: normalizeRotationAngle(p.rotation),
    rotationDelta: 0,
    included: true,
    selected: false,
  }))

  return { source, pages }
}

export function moveOrganizerPage(
  items: OrganizerPageItem[],
  fromIndex: number,
  toIndex: number
): OrganizerPageItem[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items
  }
  const copy = items.slice()
  const [moved] = copy.splice(fromIndex, 1)
  copy.splice(toIndex, 0, moved)
  return copy
}

export function rotateOrganizerPages(
  items: OrganizerPageItem[],
  targetIds: Set<string>,
  deltaDeg: 90 | -90 | 180
): OrganizerPageItem[] {
  return items.map((item) => {
    if (!targetIds.has(item.id)) return item
    return {
      ...item,
      rotationDelta: normalizeRotationAngle(item.rotationDelta + deltaDeg),
    }
  })
}

export function rotateEvenIncludedPages(
  items: OrganizerPageItem[],
  deltaDeg: 90 | -90 | 180
): OrganizerPageItem[] {
  let includedOrder = 0
  return items.map((item) => {
    if (!item.included) return item
    includedOrder += 1
    if (includedOrder % 2 !== 0) return item
    return {
      ...item,
      rotationDelta: normalizeRotationAngle(item.rotationDelta + deltaDeg),
    }
  })
}

export function insertBlankPageAfter(
  items: OrganizerPageItem[],
  afterId: string | null,
  newId: string
): OrganizerPageItem[] {
  const idx = afterId ? items.findIndex((it) => it.id === afterId) : items.length - 1
  const template = idx >= 0 ? items[idx] : undefined
  const blankItem: OrganizerPageItem = {
    id: newId,
    kind: 'blank',
    sourceFileId: '__blank__',
    sourceFileName: '白紙ページ',
    sourcePageIndex: -1,
    originalPageNumber: 0,
    widthPt: template ? template.widthPt : A4_PORTRAIT_WIDTH_PT,
    heightPt: template ? template.heightPt : A4_PORTRAIT_HEIGHT_PT,
    baseRotation: template ? template.baseRotation : 0,
    rotationDelta: template ? template.rotationDelta : 0,
    included: true,
    selected: false,
  }
  const copy = items.slice()
  const insertAt = idx >= 0 ? idx + 1 : copy.length
  copy.splice(insertAt, 0, blankItem)
  return copy
}

export function reverseIncludedPages(
  items: OrganizerPageItem[]
): OrganizerPageItem[] {
  const includedOnly = items.filter((it) => it.included).reverse()
  let cursor = 0
  return items.map((item) => {
    if (!item.included) return item
    const next = includedOnly[cursor++]
    return next
  })
}

export function sortPagesByFilename(
  items: OrganizerPageItem[]
): OrganizerPageItem[] {
  return items.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'blank' ? 1 : -1
    const nameCmp = a.sourceFileName.localeCompare(b.sourceFileName, 'ja')
    if (nameCmp !== 0) return nameCmp
    return a.originalPageNumber - b.originalPageNumber
  })
}

/**
 * 分割範囲指定文字列を解析する。
 * カンマ/改行で分割ファイルを分け、同一ファイル内に複数区間を含める場合は "+" で連結する。
 * 例: "1-2, 3-5" -> 2ファイル / "1-2 + 5, 3-4" -> ファイル1(1,2,5), ファイル2(3,4)
 */
export function parseRangeGroups(
  spec: string,
  totalActivePages: number
): { ok: true; groups: SplitGroupSpec[] } | { ok: false; error: string } {
  if (totalActivePages <= 0) {
    return { ok: false, error: '出力対象のページが1ページもありません。' }
  }
  const rawGroups = spec
    .split(/[,\n\r;]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (rawGroups.length === 0) {
    return {
      ok: false,
      error: '分割するページ範囲を入力してください（例: 1-2, 3-5）。',
    }
  }

  const groups: SplitGroupSpec[] = []
  for (let gIdx = 0; gIdx < rawGroups.length; gIdx++) {
    const groupText = rawGroups[gIdx]
    const subParts = groupText
      .split(/\+/)
      .map((s) => s.trim())
      .filter(Boolean)

    if (subParts.length === 0) {
      return {
        ok: false,
        error: `範囲指定 "${groupText}" の形式が不正です。`,
      }
    }

    const indices: number[] = []
    for (const part of subParts) {
      const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/)
      const singleMatch = part.match(/^(\d+)$/)
      if (rangeMatch) {
        const start = Number(rangeMatch[1])
        const end = Number(rangeMatch[2])
        if (start < 1 || end < 1 || start > end) {
          return {
            ok: false,
            error: `範囲 "${part}" が不正です（開始 <= 終了の1以上の整数を指定してください）。`,
          }
        }
        if (end > totalActivePages) {
          return {
            ok: false,
            error: `ページ ${end} は現在の有効ページ数（${totalActivePages}ページ）を超えています。`,
          }
        }
        for (let p = start; p <= end; p++) {
          indices.push(p)
        }
      } else if (singleMatch) {
        const p = Number(singleMatch[1])
        if (p < 1 || p > totalActivePages) {
          return {
            ok: false,
            error: `ページ ${p} は現在の有効ページ数（1〜${totalActivePages}）の範囲外です。`,
          }
        }
        indices.push(p)
      } else {
        return {
          ok: false,
          error: `範囲指定 "${part}" を解釈できません（"1-3" または "5" の形式で入力してください）。`,
        }
      }
    }

    const compactLabel = indices.length === 1 ? `p${indices[0]}` : `p${indices[0]}-${indices[indices.length - 1]}`
    groups.push({
      label: `ファイル ${gIdx + 1}: ${groupText}（${indices.length}ページ）`,
      fileSuffix: `part${gIdx + 1}-${compactLabel}`,
      oneBasedIndices: indices,
    })
  }

  return { ok: true, groups }
}

export function buildChunkedSplitGroups(
  totalActivePages: number,
  pagesPerFile = 1
): SplitGroupSpec[] {
  if (totalActivePages <= 0) return []
  const chunk = Math.max(1, Math.min(totalActivePages, Math.floor(pagesPerFile)))
  const groups: SplitGroupSpec[] = []
  for (let start = 1; start <= totalActivePages; start += chunk) {
    const end = Math.min(totalActivePages, start + chunk - 1)
    const indices: number[] = []
    for (let p = start; p <= end; p++) indices.push(p)
    const suffix = start === end ? `p${start}` : `p${start}-${end}`
    groups.push({
      label: start === end ? `ページ ${start}` : `ページ ${start}〜${end}`,
      fileSuffix: suffix,
      oneBasedIndices: indices,
    })
  }
  return groups
}

function sanitizeBaseFilename(name: string): string {
  const baseOnly = (name || 'document')
    .split(/[/\\]/)
    .pop()!
    .replace(/\.pdf$/i, '')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .trim()
  return (baseOnly || 'document').slice(0, 64)
}

export function buildOrganizerDownloadFilename(
  baseName: string,
  anonymize: boolean,
  mode: OrganizerOutputMode,
  groupSuffix?: string
): string {
  const stem = anonymize
    ? mode === 'merge'
      ? 'merged-document'
      : 'split-document'
    : `${sanitizeBaseFilename(baseName)}-${mode === 'merge' ? 'organized' : 'split'}`

  if (!groupSuffix) return `${stem}.pdf`
  return `${stem}-${groupSuffix}.pdf`
}

/**
 * コピーした PDFPage 配下から、ページ単位XMP・編集アプリ固有情報・危険アクション・
 * 除外ページへの間接参照（Annots 等）を除去する。
 */
export function sanitizeCopiedPageNode(
  outDoc: PDFDocument,
  page: PDFPage,
  stripAnnotations = true
): void {
  const pageKeysToRemove = [
    'AA',
    'Metadata',
    'PieceInfo',
    'LastModified',
    'Thumb',
    'B',
    'StructParents',
  ]
  for (const key of pageKeysToRemove) {
    if (page.node.has(PDFName.of(key))) {
      page.node.delete(PDFName.of(key))
    }
  }
  if (stripAnnotations && page.node.has(PDFName.of('Annots'))) {
    page.node.delete(PDFName.of('Annots'))
  }

  const resources = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict)
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  if (xObjects) {
    for (const [, refOrObj] of xObjects.entries()) {
      const resolved = outDoc.context.lookup(refOrObj)
      const dict =
        resolved instanceof PDFStream
          ? resolved.dict
          : resolved instanceof PDFDict
            ? resolved
            : null
      if (!dict) continue
      dict.delete(PDFName.of('Metadata'))
      dict.delete(PDFName.of('PieceInfo'))
    }
  }
}

async function assembleSingleOrganizedPdf(
  selectedItems: OrganizerPageItem[],
  loadedSrcDocs: Map<string, PDFDocument>,
  options: {
    stripMetadataAndRisks: boolean
    normalizeToA4Portrait: boolean
  }
): Promise<Uint8Array> {
  if (selectedItems.length === 0) {
    throw new Error('出力対象のページが1ページも選択されていません。')
  }

  const outDoc = await PDFDocument.create({ updateMetadata: false })
  if (options.stripMetadataAndRisks) {
    if (outDoc.context.trailerInfo.Info) {
      delete outDoc.context.trailerInfo.Info
    }
    if (outDoc.context.trailerInfo.ID) {
      delete outDoc.context.trailerInfo.ID
    }
    if (outDoc.catalog.has(PDFName.of('Metadata'))) {
      outDoc.catalog.delete(PDFName.of('Metadata'))
    }
  }

  for (const item of selectedItems) {
    if (item.kind === 'blank') {
      const targetW = options.normalizeToA4Portrait
        ? A4_PORTRAIT_WIDTH_PT
        : Math.max(1, item.widthPt)
      const targetH = options.normalizeToA4Portrait
        ? A4_PORTRAIT_HEIGHT_PT
        : Math.max(1, item.heightPt)
      const blank = outDoc.addPage([targetW, targetH])
      if (!options.normalizeToA4Portrait) {
        const finalAngle = normalizeRotationAngle(
          item.baseRotation + item.rotationDelta
        )
        if (finalAngle !== 0) blank.setRotation(degrees(finalAngle))
      }
      continue
    }

    const srcDoc = loadedSrcDocs.get(item.sourceFileId)
    if (!srcDoc) {
      throw new Error(`元ファイル（${item.sourceFileName}）が見つかりません。`)
    }

    const srcPage = srcDoc.getPage(item.sourcePageIndex)
    if (options.stripMetadataAndRisks) {
      // copyPages() の前に元ページ側の /Annots・/AA・/PieceInfo 等を剥がすことで、
      // PDFObjectCopier が孤立した未参照オブジェクトを outDoc.context へ複製する経路を遮断する。
      sanitizeCopiedPageNode(srcDoc, srcPage, true)
    }

    const finalAngle = normalizeRotationAngle(
      item.baseRotation + item.rotationDelta
    )

    if (options.normalizeToA4Portrait) {
      const [embedded] = await outDoc.embedPages([srcPage])
      const page = outDoc.addPage([A4_PORTRAIT_WIDTH_PT, A4_PORTRAIT_HEIGHT_PT])

      const srcSwapped = finalAngle === 90 || finalAngle === 270
      const visualW = srcSwapped ? embedded.height : embedded.width
      const visualH = srcSwapped ? embedded.width : embedded.height
      const scale = Math.min(
        A4_PORTRAIT_WIDTH_PT / Math.max(1, visualW),
        A4_PORTRAIT_HEIGHT_PT / Math.max(1, visualH)
      )
      const drawW = embedded.width * scale
      const drawH = embedded.height * scale
      const visualDrawW = visualW * scale
      const visualDrawH = visualH * scale
      const marginX = (A4_PORTRAIT_WIDTH_PT - visualDrawW) / 2
      const marginY = (A4_PORTRAIT_HEIGHT_PT - visualDrawH) / 2

      // pdf-lib の rotate は (x, y) を基準に反時計回り、かつ PDF /Rotate は時計回り
      let drawX = marginX
      let drawY = marginY
      let ccwDeg = 0
      if (finalAngle === 90) {
        ccwDeg = -90
        drawX = marginX
        drawY = marginY + visualDrawH
      } else if (finalAngle === 180) {
        ccwDeg = 180
        drawX = marginX + visualDrawW
        drawY = marginY + visualDrawH
      } else if (finalAngle === 270) {
        ccwDeg = 90
        drawX = marginX + visualDrawW
        drawY = marginY
      }

      page.drawPage(embedded, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
        rotate: degrees(ccwDeg),
      })
      if (options.stripMetadataAndRisks) {
        sanitizeCopiedPageNode(outDoc, page, true)
      }
      continue
    }

    const [copiedPage] = await outDoc.copyPages(srcDoc, [item.sourcePageIndex])
    if (options.stripMetadataAndRisks) {
      sanitizeCopiedPageNode(outDoc, copiedPage, true)
    }
    copiedPage.setRotation(degrees(finalAngle))
    outDoc.addPage(copiedPage)
  }

  if (options.stripMetadataAndRisks) {
    if (outDoc.context.trailerInfo.Info) {
      delete outDoc.context.trailerInfo.Info
    }
    if (outDoc.context.trailerInfo.ID) {
      delete outDoc.context.trailerInfo.ID
    }
    if (outDoc.catalog.has(PDFName.of('Metadata'))) {
      outDoc.catalog.delete(PDFName.of('Metadata'))
    }
  }

  return outDoc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  })
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * 依存パッケージゼロ・UTF-8ファイル名対応の標準 PKZIP (STORE) アーカイブを生成する。
 * PDF内部はすでに圧縮済みのため、無圧縮格納でも容量劣化がなく高速に生成できる。
 */
export function buildZipArchive(
  entries: { name: string; data: Uint8Array }[]
): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = computeCrc32(entry.data)
    const size = entry.data.byteLength

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true) // signature
    lv.setUint16(4, 20, true) // version needed (2.0)
    lv.setUint16(6, 0x0800, true) // UTF-8 filename flag
    lv.setUint16(8, 0, true) // compression method: STORE
    lv.setUint16(10, 0, true) // mod time
    lv.setUint16(12, 0x5421, true) // fixed DOS date (no timestamp leak)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra len
    localHeader.set(nameBytes, 30)

    localParts.push(localHeader, entry.data)

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true) // UTF-8
    cv.setUint16(10, 0, true) // STORE
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x5421, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra
    cv.setUint16(32, 0, true) // comment
    cv.setUint16(34, 0, true) // disk
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true) // relative offset
    centralHeader.set(nameBytes, 46)

    centralParts.push(centralHeader)
    offset += localHeader.length + size
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const totalLength = offset + centralSize + eocd.length
  const out = new Uint8Array(totalLength)
  let pos = 0
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}

export async function buildOrganizedOutput(params: {
  sources: OrganizerSourceFile[]
  items: OrganizerPageItem[]
  mode: OrganizerOutputMode
  rangeSpec?: string
  pagesPerFile?: number
  stripMetadataAndRisks: boolean
  normalizeToA4Portrait: boolean
  anonymizeFilename: boolean
}): Promise<OrganizerBuildResult> {
  const activeItems = params.items.filter((it) => it.included)
  if (activeItems.length === 0) {
    throw new Error('有効なページが1ページもありません。')
  }

  const loadedSrcDocs = new Map<string, PDFDocument>()
  for (const src of params.sources) {
    const doc = await PDFDocument.load(src.bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    })
    loadedSrcDocs.set(src.id, doc)
  }

  const baseName = params.sources[0]?.fileName || 'document'
  const totalInputRiskItems = params.sources.reduce(
    (sum, s) => sum + s.structure.totalRiskItems,
    0
  )

  let groups: { fileSuffix?: string; items: OrganizerPageItem[] }[] = []

  if (params.mode === 'merge') {
    groups = [{ items: activeItems }]
  } else if (params.mode === 'split-ranges') {
    const parsed = parseRangeGroups(params.rangeSpec || '', activeItems.length)
    if (!parsed.ok) {
      throw new Error(parsed.error)
    }
    groups = parsed.groups.map((g) => ({
      fileSuffix: g.fileSuffix,
      items: g.oneBasedIndices.map((oneIdx) => activeItems[oneIdx - 1]),
    }))
  } else {
    const chunkGroups = buildChunkedSplitGroups(
      activeItems.length,
      params.pagesPerFile ?? 1
    )
    groups = chunkGroups.map((g) => ({
      fileSuffix: g.fileSuffix,
      items: g.oneBasedIndices.map((oneIdx) => activeItems[oneIdx - 1]),
    }))
  }

  const artifacts: OrganizedPdfArtifact[] = []
  for (const group of groups) {
    const bytes = await assembleSingleOrganizedPdf(group.items, loadedSrcDocs, {
      stripMetadataAndRisks: params.stripMetadataAndRisks,
      normalizeToA4Portrait: params.normalizeToA4Portrait,
    })
    const verification = await inspectPdfStructure(bytes, {
      maxPages: MAX_ORGANIZER_TOTAL_PAGES,
    })
    artifacts.push({
      fileName: buildOrganizerDownloadFilename(
        baseName,
        params.anonymizeFilename,
        params.mode,
        group.fileSuffix
      ),
      bytes,
      byteSize: bytes.byteLength,
      pageCount: verification.pageCount,
      verification,
    })
  }

  const zipArchive =
    artifacts.length >= 2
      ? (() => {
          const zipBytes = buildZipArchive(
            artifacts.map((a) => ({ name: a.fileName, data: a.bytes }))
          )
          const zipName = params.anonymizeFilename
            ? 'split-documents.zip'
            : `${sanitizeBaseFilename(baseName)}-split.zip`
          return {
            fileName: zipName,
            bytes: zipBytes,
            byteSize: zipBytes.byteLength,
          }
        })()
      : null

  const totalOutputRiskItems = artifacts.reduce(
    (sum, a) => sum + a.verification.totalRiskItems,
    0
  )

  return {
    mode: params.mode,
    artifacts,
    zipArchive,
    totalInputRiskItems,
    totalOutputRiskItems,
  }
}
