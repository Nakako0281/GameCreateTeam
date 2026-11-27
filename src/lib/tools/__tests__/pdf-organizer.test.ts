import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import {
  A4_PORTRAIT_HEIGHT_PT,
  A4_PORTRAIT_WIDTH_PT,
  MAX_ORGANIZER_FILE_BYTES,
  MAX_ORGANIZER_FILES,
  buildChunkedSplitGroups,
  buildOrganizedOutput,
  buildZipArchive,
  computeCrc32,
  describePaperSize,
  insertBlankPageAfter,
  inspectOrganizerSourcePdf,
  moveOrganizerPage,
  parseRangeGroups,
  reverseIncludedPages,
  rotateEvenIncludedPages,
  rotateOrganizerPages,
  validateOrganizerFileAdd,
} from '../pdf-organizer'

async function buildDirtySamplePdf(options: {
  title: string
  author: string
  pages: { label: string; width: number; height: number; addDangerousAnnot?: boolean }[]
  withDigitalSignature?: boolean
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(options.title)
  doc.setAuthor(options.author)
  doc.setCreator('Internal Editor v9')
  doc.setProducer('Dirty PDF Engine')
  doc.setCreationDate(new Date('2026-11-15T10:00:00Z'))

  const xmpStream = doc.context.flateStream('<x:xmpmeta>HiddenUser</x:xmpmeta>')
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmpStream))

  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (const spec of options.pages) {
    const page = doc.addPage([spec.width, spec.height])
    page.drawText(spec.label, {
      x: 40,
      y: spec.height - 60,
      size: 13,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })

    // ページ単位 PieceInfo と Metadata を付与
    page.node.set(
      PDFName.of('PieceInfo'),
      doc.context.obj({ Illustrator: { Private: PDFString.of('InternalData') } })
    )

    if (spec.addDangerousAnnot) {
      const uriAction = doc.context.obj({
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of('https://tracker.example.invalid/ping'),
      })
      const jsAction = doc.context.obj({
        Type: 'Action',
        S: 'JavaScript',
        JS: PDFString.of('app.alert("x")'),
      })
      const annot1 = doc.context.register(
        doc.context.obj({
          Type: 'Annot',
          Subtype: 'Text',
          Rect: [40, 40, 60, 60],
          Contents: PDFString.of('Confidential review comment'),
          A: uriAction,
        })
      )
      const annot2 = doc.context.register(
        doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [80, 40, 120, 60],
          A: jsAction,
        })
      )
      page.node.set(PDFName.of('Annots'), doc.context.obj([annot1, annot2]))
    }
  }

  if (options.withDigitalSignature) {
    const sigField = doc.context.register(
      doc.context.obj({
        FT: 'Sig',
        T: PDFString.of('Signature1'),
      })
    )
    doc.catalog.set(
      PDFName.of('AcroForm'),
      doc.context.obj({
        SigFlags: 3,
        Fields: [sigField],
      })
    )
  }

  return doc.save()
}

describe('pdf-organizer pure TS engine', () => {
  it('validates file limits and detects paper sizes accurately', () => {
    expect(validateOrganizerFileAdd(0, 0, 0).ok).toBe(false)
    expect(
      validateOrganizerFileAdd(0, 0, MAX_ORGANIZER_FILE_BYTES + 1).ok
    ).toBe(false)
    expect(validateOrganizerFileAdd(0, MAX_ORGANIZER_FILES, 1024).ok).toBe(
      false
    )
    expect(validateOrganizerFileAdd(0, 1, 1024 * 1024).ok).toBe(true)

    const a4Portrait = describePaperSize(595.28, 841.89, 0)
    expect(a4Portrait.label).toBe('A4 縦')
    expect(a4Portrait.orientation).toBe('portrait')

    const a4Rotated = describePaperSize(595.28, 841.89, 90)
    expect(a4Rotated.label).toBe('A4 横')
    expect(a4Rotated.orientation).toBe('landscape')

    const a3Landscape = describePaperSize(1190.55, 841.89, 0)
    expect(a3Landscape.label).toBe('A3 横')
    expect(a3Landscape.orientation).toBe('landscape')
  })

  it('detects page-level PieceInfo, Annots URI/JS actions, and digital signatures', async () => {
    const dirtyBytes = await buildDirtySamplePdf({
      title: 'Secret_Contract_2026',
      author: 'Hanako Sato',
      pages: [
        { label: 'Page 1 Secret', width: 595, height: 842, addDangerousAnnot: true },
        { label: 'Page 2 Secret', width: 842, height: 595 },
      ],
      withDigitalSignature: true,
    })

    const { source, pages } = await inspectOrganizerSourcePdf(
      dirtyBytes,
      'secret.pdf',
      'src-1'
    )
    expect(pages).toHaveLength(2)
    expect(source.structure.metadataEntries.length).toBeGreaterThanOrEqual(5)
    expect(source.structure.hasXmpMetadata).toBe(true)
    expect(source.structure.hasDigitalSignature).toBe(true)
    expect(source.structure.pageLevelRiskCount).toBeGreaterThanOrEqual(2)
    expect(source.structure.dangerousActionCount).toBeGreaterThanOrEqual(2)
    expect(source.structure.hasJavaScript).toBe(true)
  })

  it('merges, reorders, rotates, inserts blank pages, and strips Info/XMP/Annots/PieceInfo to 0 risks', async () => {
    const pdf1Bytes = await buildDirtySamplePdf({
      title: 'Contract_Part1',
      author: 'Taro Yamada',
      pages: [
        { label: 'UNIQUE_MARKER_P1_KEEP', width: 595, height: 842, addDangerousAnnot: true },
        { label: 'UNIQUE_MARKER_P2_EXCLUDE', width: 595, height: 842, addDangerousAnnot: true },
      ],
    })
    const pdf2Bytes = await buildDirtySamplePdf({
      title: 'Appendix_Landscape',
      author: 'Internal PC',
      pages: [{ label: 'UNIQUE_MARKER_APPENDIX', width: 842, height: 595 }],
    })

    const loaded1 = await inspectOrganizerSourcePdf(pdf1Bytes, 'contract.pdf', 'f1', 0)
    const loaded2 = await inspectOrganizerSourcePdf(pdf2Bytes, 'appendix.pdf', 'f2', 2)

    let items = [...loaded1.pages, ...loaded2.pages]
    // 2ページ目 (f1-p2) を除外
    items = items.map((it) =>
      it.id === 'f1-p2' ? { ...it, included: false } : it
    )
    // appendix (index 2) を先頭へ移動
    items = moveOrganizerPage(items, 2, 0)
    // 先頭 (appendix) を 90度回転
    items = rotateOrganizerPages(items, new Set(['f2-p1']), 90)
    // f1-p1 の後に白紙ページを挿入
    items = insertBlankPageAfter(items, 'f1-p1', 'blank-1')

    const result = await buildOrganizedOutput({
      sources: [loaded1.source, loaded2.source],
      items,
      mode: 'merge',
      stripMetadataAndRisks: true,
      normalizeToA4Portrait: false,
      anonymizeFilename: true,
    })

    expect(result.artifacts).toHaveLength(1)
    expect(result.zipArchive).toBeNull()
    const out = result.artifacts[0]
    expect(out.fileName).toBe('merged-document.pdf')
    expect(out.pageCount).toBe(3) // appendix + p1 + blank
    expect(out.verification.totalRiskItems).toBe(0)
    expect(out.verification.metadataEntries).toHaveLength(0)
    expect(out.verification.hasXmpMetadata).toBe(false)
    expect(out.verification.totalAnnotations).toBe(0)
    expect(out.verification.pageLevelRiskCount).toBe(0)
    expect(out.verification.dangerousActionCount).toBe(0)
    expect(out.verification.hasJavaScript).toBe(false)

    // 除外したページの機密文字列やメタデータキーがバイナリに残っていないことを確認
    const rawLatin1 = Buffer.from(out.bytes).toString('latin1')
    expect(rawLatin1).not.toContain('UNIQUE_MARKER_P2_EXCLUDE')
    expect(rawLatin1).not.toContain('/Producer')
    expect(rawLatin1).not.toContain('/Author')
    expect(rawLatin1).not.toContain('/PieceInfo')
    expect(rawLatin1).not.toContain('tracker.example.invalid')

    // 回転が正しく反映されていること
    const outDoc = await PDFDocument.load(out.bytes)
    expect(outDoc.getPage(0).getRotation().angle).toBe(90)
  })

  it('normalizes mixed page sizes to A4 portrait when enabled', async () => {
    const pdfBytes = await buildDirtySamplePdf({
      title: 'MixedSizes',
      author: 'Tester',
      pages: [{ label: 'A3 Landscape Page', width: 1190.55, height: 841.89 }],
    })
    const loaded = await inspectOrganizerSourcePdf(pdfBytes, 'a3.pdf', 'f1', 0)

    const result = await buildOrganizedOutput({
      sources: [loaded.source],
      items: loaded.pages,
      mode: 'merge',
      stripMetadataAndRisks: true,
      normalizeToA4Portrait: true,
      anonymizeFilename: true,
    })

    const outDoc = await PDFDocument.load(result.artifacts[0].bytes)
    const size = outDoc.getPage(0).getSize()
    expect(size.width).toBeCloseTo(A4_PORTRAIT_WIDTH_PT, 1)
    expect(size.height).toBeCloseTo(A4_PORTRAIT_HEIGHT_PT, 1)
    expect(result.artifacts[0].verification.totalRiskItems).toBe(0)
  })

  it('parses split ranges, builds chunked split ZIP archives with valid CRC-32', async () => {
    const parsed = parseRangeGroups('1-2, 3+5', 5)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.groups).toHaveLength(2)
      expect(parsed.groups[0].oneBasedIndices).toEqual([1, 2])
      expect(parsed.groups[1].oneBasedIndices).toEqual([3, 5])
    }

    expect(parseRangeGroups('4-2', 5).ok).toBe(false)
    expect(parseRangeGroups('1-9', 5).ok).toBe(false)
    expect(parseRangeGroups('', 5).ok).toBe(false)

    expect(buildChunkedSplitGroups(5, 2)).toHaveLength(3)

    const pdfBytes = await buildDirtySamplePdf({
      title: 'MultiPage',
      author: 'Author',
      pages: [
        { label: 'P1', width: 595, height: 842 },
        { label: 'P2', width: 595, height: 842 },
        { label: 'P3', width: 595, height: 842 },
      ],
    })
    const loaded = await inspectOrganizerSourcePdf(pdfBytes, '報告書.pdf', 'f1', 0)

    const splitResult = await buildOrganizedOutput({
      sources: [loaded.source],
      items: loaded.pages,
      mode: 'split-each',
      pagesPerFile: 1,
      stripMetadataAndRisks: true,
      normalizeToA4Portrait: false,
      anonymizeFilename: false,
    })

    expect(splitResult.artifacts).toHaveLength(3)
    expect(splitResult.zipArchive).not.toBeNull()
    const zipBytes = splitResult.zipArchive!.bytes
    // PKZIP Local Header ("PK\x03\x04") and EOCD ("PK\x05\x06")
    expect(zipBytes[0]).toBe(0x50)
    expect(zipBytes[1]).toBe(0x4b)
    expect(zipBytes[2]).toBe(0x03)
    expect(zipBytes[3]).toBe(0x04)

    const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
    const eocdOffset = zipBytes.length - 22
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50)
    expect(view.getUint16(eocdOffset + 8, true)).toBe(3)
    expect(view.getUint16(eocdOffset + 10, true)).toBe(3)

    // CRC-32 sanity check
    const sampleData = new TextEncoder().encode('123456789')
    expect(computeCrc32(sampleData)).toBe(0xcbf43926)

    const zipCustom = buildZipArchive([{ name: 'テスト.txt', data: sampleData }])
    expect(zipCustom.byteLength).toBeGreaterThan(22 + 30 + 46)
  })

  it('supports even-page rotation and reverse order helpers', async () => {
    const pdfBytes = await buildDirtySamplePdf({
      title: 'Scan',
      author: 'Scanner',
      pages: [
        { label: 'P1', width: 595, height: 842 },
        { label: 'P2', width: 595, height: 842 },
        { label: 'P3', width: 595, height: 842 },
        { label: 'P4', width: 595, height: 842 },
      ],
    })
    const loaded = await inspectOrganizerSourcePdf(pdfBytes, 'scan.pdf', 'f1', 0)
    const rotated = rotateEvenIncludedPages(loaded.pages, 180)
    expect(rotated.map((p) => p.rotationDelta)).toEqual([0, 180, 0, 180])

    const reversed = reverseIncludedPages(rotated)
    expect(reversed.map((p) => p.originalPageNumber)).toEqual([4, 3, 2, 1])
  })
})
