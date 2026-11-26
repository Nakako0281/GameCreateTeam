import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import {
  MAX_PAGE_CANVAS_AREA_PX,
  MAX_PAGE_CANVAS_EDGE_PX,
  MAX_PDF_FILE_BYTES,
  buildRedactedFilename,
  buildRedactedPdfFromImages,
  computeSafeRenderViewport,
  detectPiiCandidatesFromTextItems,
  expandRectToSafePixelBounds,
  inspectPdfStructure,
  normalizeRectCoords,
  validatePdfUploadSize,
  verifyRedactedPdfOutput,
} from '../pdf-redactor'

// 最小1x1透明PNG (67 bytes)
const TINY_PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

async function createSamplePdfWithMetadataAndAnnotations(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Confidential Contract 2026')
  doc.setAuthor('Taro Yamada (PC-901)')
  doc.setSubject('NDA Draft')
  doc.setKeywords(['secret', 'contract'])
  doc.setCreator('Internal Editor v1')
  doc.setProducer('Test Producer')
  doc.setCreationDate(new Date('2026-11-01T09:00:00Z'))
  doc.setModificationDate(new Date('2026-11-20T18:30:00Z'))

  // XMP メタデータダミー参照をカタログへ付与
  const xmpStream = doc.context.flateStream('<x:xmpmeta>SecretOwner</x:xmpmeta>')
  const xmpRef = doc.context.register(xmpStream)
  doc.catalog.set(PDFName.of('Metadata'), xmpRef)

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText('Email: canary@secret-corp.example  Tel: 090-1234-5678', {
    x: 50,
    y: 740,
    size: 14,
    font,
    color: rgb(0, 0, 0),
  })

  // 注釈(Annot)を1件追加
  const annotDict = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [50, 700, 70, 720],
    Contents: PDFString.of('Internal review memo'),
  })
  const annotRef = doc.context.register(annotDict)
  page.node.set(PDFName.of('Annots'), doc.context.obj([annotRef]))

  return doc.save()
}

describe('pdf-redactor pure TS engine', () => {
  it('detects standard Info metadata, XMP metadata, and page annotations before redaction', async () => {
    const rawPdf = await createSamplePdfWithMetadataAndAnnotations()
    const report = await inspectPdfStructure(rawPdf)

    expect(report.pageCount).toBe(1)
    expect(report.hasXmpMetadata).toBe(true)
    expect(report.totalAnnotations).toBe(1)
    const keys = report.metadataEntries.map((m) => m.key)
    expect(keys).toContain('Title')
    expect(keys).toContain('Author')
    expect(keys).toContain('Creator')
    expect(keys).toContain('Producer')
    expect(keys).toContain('CreationDate')
    expect(report.totalRiskItems).toBeGreaterThanOrEqual(8)
  })

  it('builds a completely metadata-free image-only PDF with zero Producer/Creator/CreationDate leaks', async () => {
    const outBytes = await buildRedactedPdfFromImages([
      {
        pageNumber: 1,
        widthPt: 595,
        heightPt: 842,
        format: 'png',
        imageBytes: TINY_PNG_BYTES,
      },
      {
        pageNumber: 2,
        widthPt: 595,
        heightPt: 842,
        format: 'png',
        imageBytes: TINY_PNG_BYTES,
      },
    ])

    const verification = await verifyRedactedPdfOutput(outBytes, 0)
    expect(verification.isSafe).toBe(true)
    expect(verification.pageCount).toBe(2)
    expect(verification.metadataCount).toBe(0)
    expect(verification.hasXmpMetadata).toBe(false)
    expect(verification.totalAnnotations).toBe(0)
    expect(verification.hasAcroForm).toBe(false)
    expect(verification.hasEmbeddedFiles).toBe(false)
    expect(verification.hasJavaScript).toBe(false)
    expect(verification.totalRiskItems).toBe(0)

    // 生バイナリ/PDF構造上で pdf-lib デフォルトの Producer/Creator/CreationDate が残っていないことも検証
    const rawText = Buffer.from(outBytes).toString('latin1')
    expect(rawText).not.toContain('/Producer')
    expect(rawText).not.toContain('/Creator')
    expect(rawText).not.toContain('/CreationDate')
    expect(rawText).not.toContain('/ModDate')
    expect(rawText).not.toContain('/Author')
    expect(rawText).not.toContain('/Title')
  })

  it('clamps oversized page dimensions and canvas pixel area to prevent mobile OOM', () => {
    // 標準A4 (595 x 842 pt) @ 150 DPI
    const normal = computeSafeRenderViewport(595, 842, 150)
    expect(normal.clamped).toBe(false)
    expect(normal.pixelWidth).toBe(Math.round(595 * (150 / 72)))
    expect(normal.pixelHeight).toBe(Math.round(842 * (150 / 72)))

    // 超大判A0図面 (2384 x 3370 pt) @ 300 DPI -> 面積・長辺上限で自動クランプ
    const huge = computeSafeRenderViewport(2384, 3370, 300)
    expect(huge.clamped).toBe(true)
    expect(Math.max(huge.pixelWidth, huge.pixelHeight)).toBeLessThanOrEqual(
      MAX_PAGE_CANVAS_EDGE_PX
    )
    expect(huge.pixelWidth * huge.pixelHeight).toBeLessThanOrEqual(
      MAX_PAGE_CANVAS_AREA_PX
    )
  })

  it('expands normalized redaction coordinates by safe margin without exceeding canvas bounds', () => {
    const norm = normalizeRectCoords(0.8, 0.9, 0.2, 0.1)
    expect(norm.x).toBeCloseTo(0.2, 6)
    expect(norm.y).toBeCloseTo(0.1, 6)
    expect(norm.width).toBeCloseTo(0.6, 6)
    expect(norm.height).toBeCloseTo(0.8, 6)

    const expanded = expandRectToSafePixelBounds(
      { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      1000,
      1000,
      2
    )
    expect(expanded.x).toBe(98)
    expect(expanded.y).toBe(198)
    expect(expanded.width).toBe(304)
    expect(expanded.height).toBeGreaterThanOrEqual(404)
    expect(expanded.height).toBeLessThanOrEqual(405)

    const edgeClamped = expandRectToSafePixelBounds(
      { x: 0, y: 0, width: 1, height: 1 },
      500,
      400,
      5
    )
    expect(edgeClamped).toEqual({ x: 0, y: 0, width: 500, height: 400 })
  })

  it('detects PII candidate coordinates accurately from PDF text items without false overlaps', () => {
    const items = [
      {
        str: '連絡先: tanaka@example.co.jp / TEL: 090-1234-5678',
        xPt: 50,
        yPt: 100,
        widthPt: 400,
        heightPt: 14,
      },
      {
        str: 'API_KEY=sk-proj-canary1234567890abcd',
        xPt: 50,
        yPt: 130,
        widthPt: 300,
        heightPt: 14,
      },
      {
        str: 'マイナンバー: 1234-5678-9012 / 〒100-0001',
        xPt: 50,
        yPt: 160,
        widthPt: 320,
        heightPt: 14,
      },
      {
        str: '通常の契約条項テキスト（機密値なし）',
        xPt: 50,
        yPt: 200,
        widthPt: 250,
        heightPt: 14,
      },
    ]

    const candidates = detectPiiCandidatesFromTextItems(items, 1, 595, 842)
    const categories = candidates.map((c) => c.category)
    expect(categories).toContain('email')
    expect(categories).toContain('phone')
    expect(categories).toContain('secret')
    expect(categories).toContain('myNumber')
    expect(categories).toContain('postalCode')
    expect(candidates).toHaveLength(5)

    // プレビュー自体に生の秘密文字列が丸見えになっていないこと
    expect(candidates.every((c) => c.matchedPreview.includes('•••'))).toBe(true)
    for (const c of candidates) {
      expect(c.rect.x).toBeGreaterThanOrEqual(0)
      expect(c.rect.y).toBeGreaterThanOrEqual(0)
      expect(c.rect.x + c.rect.width).toBeLessThanOrEqual(1)
      expect(c.rect.y + c.rect.height).toBeLessThanOrEqual(1)
    }
  })

  it('sanitizes filenames and supports anonymized output filenames', () => {
    expect(buildRedactedFilename('給与明細_山田太郎.pdf', true)).toBe(
      'redacted-document.pdf'
    )
    expect(buildRedactedFilename('../../../secret:doc?.pdf', false)).toBe(
      'secret_doc_-redacted.pdf'
    )
    expect(buildRedactedFilename('NDA_2026.PDF', false)).toBe(
      'NDA_2026-redacted.pdf'
    )
  })

  it('validates upload sizes and rejects invalid or empty PDFs cleanly', async () => {
    expect(validatePdfUploadSize(0).ok).toBe(false)
    expect(validatePdfUploadSize(MAX_PDF_FILE_BYTES + 1).ok).toBe(false)
    expect(validatePdfUploadSize(1024)).toEqual({ ok: true })

    await expect(inspectPdfStructure(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      /有効なPDFファイルではありません/
    )
    await expect(
      inspectPdfStructure(new TextEncoder().encode('%PDF-1.4\ncorrupted'))
    ).rejects.toThrow(/PDFの解析に失敗しました/)
    await expect(buildRedactedPdfFromImages([])).rejects.toThrow(
      /1ページも選択されていません/
    )
  })
})
