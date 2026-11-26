import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import {
  MAX_PDFJS_IMAGE_SIZE,
  computeSafeRenderViewport,
  detectPiiCandidatesFromTextItems,
  expandRectToSafePixelBounds,
  type PdfTextItemBox,
  type PiiTextCandidate,
  type RasterizedPageAsset,
  type RedactionColor,
  type RedactionPreset,
  type RedactionRect,
} from './pdf-redactor'

type PdfjsModule = typeof import('pdfjs-dist')
export type PdfjsDocumentProxy = import('pdfjs-dist').PDFDocumentProxy

export interface OpenedPdfjsSession {
  doc: PdfjsDocumentProxy
  destroy: () => Promise<void>
}

let pdfjsPromise: Promise<PdfjsModule> | null = null

async function getPdfjs(): Promise<PdfjsModule> {
  if (typeof window === 'undefined') {
    throw new Error('PDF rendering is only available in browser environments.')
  }
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
      return mod
    })
  }
  return pdfjsPromise
}

export async function openPdfjsDocument(
  bytes: Uint8Array
): Promise<OpenedPdfjsSession> {
  const pdfjs = await getPdfjs()
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    iccUrl: '/pdfjs/iccs/',
    wasmUrl: '/pdfjs/wasm/',
    useWasm: false,
    enableXfa: false,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    maxImageSize: MAX_PDFJS_IMAGE_SIZE,
  })
  const doc = await task.promise
  return {
    doc,
    destroy: async () => {
      try {
        await doc.cleanup(false)
      } finally {
        await task.destroy()
      }
    },
  }
}

export interface PdfPageTextAnalysis {
  pageNumber: number
  widthPt: number
  heightPt: number
  charCount: number
  piiCandidates: PiiTextCandidate[]
}

export interface PdfDocumentTextAnalysis {
  totalExtractedChars: number
  pages: PdfPageTextAnalysis[]
}

export async function analyzePdfTextAndCandidates(
  pdfDoc: PdfjsDocumentProxy,
  defaultColor: RedactionColor = 'black'
): Promise<PdfDocumentTextAnalysis> {
  const pdfjs = await getPdfjs()
  const pages: PdfPageTextAnalysis[] = []
  let totalExtractedChars = 0

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    try {
      const viewport = page.getViewport({ scale: 1 })
      const textContent = await page.getTextContent()
      const boxes: PdfTextItemBox[] = []
      let pageChars = 0

      for (const rawItem of textContent.items) {
        if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue
        const trimmedCount = rawItem.str.replace(/\s+/g, '').length
        pageChars += trimmedCount
        if (trimmedCount === 0) continue

        const tx = pdfjs.Util.transform(viewport.transform, rawItem.transform)
        const fontHeight = Math.max(
          8,
          Math.hypot(tx[2], tx[3]) || rawItem.height || 12
        )
        const widthPt = Math.max(4, rawItem.width || trimmedCount * fontHeight * 0.55)

        boxes.push({
          str: rawItem.str,
          xPt: tx[4],
          yPt: tx[5] - fontHeight * 0.9,
          widthPt,
          heightPt: fontHeight * 1.15,
        })
      }

      totalExtractedChars += pageChars
      const piiCandidates = detectPiiCandidatesFromTextItems(
        boxes,
        pageNum,
        viewport.width,
        viewport.height,
        defaultColor
      )

      pages.push({
        pageNumber: pageNum,
        widthPt: viewport.width,
        heightPt: viewport.height,
        charCount: pageChars,
        piiCandidates,
      })
    } finally {
      page.cleanup()
    }
  }

  return {
    totalExtractedChars,
    pages,
  }
}

export async function renderPdfPagePreview(
  pdfDoc: PdfjsDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetLongEdgePx = 1100
): Promise<{ widthPt: number; heightPt: number }> {
  const page = await pdfDoc.getPage(pageNumber)
  try {
    const baseViewport = page.getViewport({ scale: 1 })
    const longestPt = Math.max(1, baseViewport.width, baseViewport.height)
    const scale = Math.min(2.5, Math.max(0.6, targetLongEdgePx / longestPt))
    const viewport = page.getViewport({ scale })

    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('ブラウザのCanvasコンテキストを取得できませんでした。')
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise

    return {
      widthPt: baseViewport.width,
      heightPt: baseViewport.height,
    }
  } finally {
    page.cleanup()
  }
}

function encodeCanvasToBytes(
  canvas: HTMLCanvasElement,
  format: 'jpeg' | 'png',
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const mime = format === 'png' ? 'image/png' : 'image/jpeg'
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('ページ画像のエンコードに失敗しました。'))
          return
        }
        resolve(new Uint8Array(await blob.arrayBuffer()))
      },
      mime,
      format === 'jpeg' ? quality : undefined
    )
  })
}

export async function rasterizePageWithRedactions(
  pdfDoc: PdfjsDocumentProxy,
  pageNumber: number,
  rects: RedactionRect[],
  preset: RedactionPreset
): Promise<{ asset: RasterizedPageAsset; clamped: boolean }> {
  const page = await pdfDoc.getPage(pageNumber)
  const canvas = document.createElement('canvas')
  try {
    const baseViewport = page.getViewport({ scale: 1 })
    const safeViewport = computeSafeRenderViewport(
      baseViewport.width,
      baseViewport.height,
      preset.dpi
    )
    const viewport = page.getViewport({ scale: safeViewport.scale })

    canvas.width = safeViewport.pixelWidth
    canvas.height = safeViewport.pixelHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('書き出し用Canvasの作成に失敗しました。')
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise

    // 墨消し矩形を完全不透明・外周+2px安全拡張でピクセルへ直接焼き付ける
    for (const rect of rects) {
      const bounds = expandRectToSafePixelBounds(
        rect,
        canvas.width,
        canvas.height,
        2
      )
      if (bounds.width <= 0 || bounds.height <= 0) continue
      ctx.save()
      ctx.globalAlpha = 1
      ctx.fillStyle = rect.color === 'white' ? '#ffffff' : '#000000'
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
      ctx.restore()
    }

    const imageBytes = await encodeCanvasToBytes(
      canvas,
      preset.format,
      preset.jpegQuality
    )

    return {
      asset: {
        pageNumber,
        widthPt: baseViewport.width,
        heightPt: baseViewport.height,
        format: preset.format,
        imageBytes,
      },
      clamped: safeViewport.clamped,
    }
  } finally {
    page.cleanup()
    canvas.width = 0
    canvas.height = 0
  }
}

export async function countPdfExtractedTextChars(
  pdfBytes: Uint8Array
): Promise<number> {
  const session = await openPdfjsDocument(pdfBytes)
  try {
    let total = 0
    for (let pageNum = 1; pageNum <= session.doc.numPages; pageNum++) {
      const page = await session.doc.getPage(pageNum)
      try {
        const textContent = await page.getTextContent()
        for (const item of textContent.items) {
          if ('str' in item && typeof item.str === 'string') {
            total += item.str.replace(/\s+/g, '').length
          }
        }
      } finally {
        page.cleanup()
      }
    }
    return total
  } finally {
    await session.destroy()
  }
}

function renderBannerCanvasPng(
  titleText: string,
  subtitleText: string
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 170
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas unavailable'))
      return
    }
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 3
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 34px sans-serif'
    ctx.fillText(titleText, 36, 72)
    ctx.fillStyle = '#475569'
    ctx.font = '24px sans-serif'
    ctx.fillText(subtitleText, 36, 126)

    canvas.toBlob((blob) => {
      canvas.width = 0
      canvas.height = 0
      if (!blob) {
        reject(new Error('Banner encode failed'))
        return
      }
      blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)))
    }, 'image/png')
  })
}

/**
 * 手元にPDFがなくても「Before(文字・メタデータ・注釈あり) → After(0件証明)」を
 * 3秒で体験できる2ページのサンプル機密PDFをメモリ上で生成する。
 */
export async function createSampleConfidentialPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Sample_NDA_2026_Confidential')
  doc.setAuthor('Taro Yamada (Corp-PC-04)')
  doc.setSubject('Vendor Agreement Draft')
  doc.setKeywords(['confidential', 'sample', 'pii'])
  doc.setCreator('TemotoBox Sample Builder')
  doc.setProducer('Sample PDF Engine')
  doc.setCreationDate(new Date('2026-11-20T09:30:00Z'))

  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)

  const header1Png = await renderBannerCanvasPng(
    '社外秘・業務委託契約書ドラフト（サンプル）',
    '提出前に連絡先・識別番号・社内メモとメタデータを墨消ししてください'
  )
  const header1Img = await doc.embedPng(header1Png)

  const page1 = doc.addPage([595, 842])
  page1.drawImage(header1Img, { x: 40, y: 700, width: 515, height: 88 })

  const linesPage1 = [
    '1. Parties & Contact Information',
    '   Contractor: Sample Planning Inc. (Tokyo)',
    '   Email: tanaka.taro@secret-corp.example',
    '   Phone: 090-1234-5678',
    '   Postal: 100-0001',
    '   MyNumber ID: 1234-5678-9012',
    '   Sandbox API Token: sk-proj-sample1234567890abcd',
    '',
    '2. Scope of Work',
    '   This sample document embeds selectable PDF text layers and',
    '   Info/Annotation metadata so you can verify zero-text redaction.',
  ]

  let yPos = 650
  for (let i = 0; i < linesPage1.length; i++) {
    const line = linesPage1[i]
    page1.drawText(line, {
      x: 45,
      y: yPos,
      size: i === 0 || i === 8 ? 13 : 11,
      font: i === 0 || i === 8 ? boldFont : font,
      color: rgb(0.1, 0.14, 0.2),
    })
    yPos -= 26
  }

  const annotDict = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [45, 360, 65, 380],
    Contents: PDFString.of('Internal review comment: remove before external sharing'),
  })
  const annotRef = doc.context.register(annotDict)
  page1.node.set(PDFName.of('Annots'), doc.context.obj([annotRef]))

  const header2Png = await renderBannerCanvasPng(
    '別紙・技術連絡窓口および緊急連絡先（2ページ目）',
    '複数ページの個別墨消し・ページ除外・全ページ一括適用を確認できます'
  )
  const header2Img = await doc.embedPng(header2Png)

  const page2 = doc.addPage([595, 842])
  page2.drawImage(header2Img, { x: 40, y: 700, width: 515, height: 88 })
  page2.drawText('Appendix A: Emergency Escalation Contact', {
    x: 45,
    y: 650,
    size: 13,
    font: boldFont,
    color: rgb(0.1, 0.14, 0.2),
  })
  page2.drawText('Security Desk Email: sec-ops@secret-corp.example', {
    x: 45,
    y: 620,
    size: 11,
    font,
    color: rgb(0.1, 0.14, 0.2),
  })
  page2.drawText('Internal IPv4 Gateway: 192.168.10.25', {
    x: 45,
    y: 594,
    size: 11,
    font,
    color: rgb(0.1, 0.14, 0.2),
  })

  return doc.save()
}
