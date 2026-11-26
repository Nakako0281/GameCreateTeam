import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CopyPlus,
  Download,
  Eye,
  FileLock2,
  Hand,
  Layers,
  PenTool,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import {
  REDACTION_PRESETS,
  buildRedactedFilename,
  buildRedactedPdfFromImages,
  formatPdfBytes,
  inspectPdfStructure,
  normalizeRectCoords,
  validatePdfUploadSize,
  verifyRedactedPdfOutput,
  type PdfStructureReport,
  type PdfVerificationReport,
  type PiiTextCandidate,
  type RasterizedPageAsset,
  type RedactionColor,
  type RedactionPresetId,
  type RedactionRect,
} from '../../lib/tools/pdf-redactor'
import {
  analyzePdfTextAndCandidates,
  countPdfExtractedTextChars,
  createSampleConfidentialPdf,
  openPdfjsDocument,
  rasterizePageWithRedactions,
  renderPdfPagePreview,
  type OpenedPdfjsSession,
} from '../../lib/tools/pdf-rasterizer.client'

interface LoadedPdfSession {
  fileName: string
  structure: PdfStructureReport
  totalExtractedChars: number
  candidatesByPage: Record<number, PiiTextCandidate[]>
  pageDimensions: Record<number, { widthPt: number; heightPt: number }>
  sizeWarning?: string
}

interface RedactedOutputState {
  downloadUrl: string
  fileName: string
  verification: PdfVerificationReport
  clampedAnyPage: boolean
}

interface DraftBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export default function PdfRedactor() {
  const [session, setSession] = useState<LoadedPdfSession | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [rects, setRects] = useState<RedactionRect[]>([])
  const [excludedPages, setExcludedPages] = useState<number[]>([])
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null)
  const [interactionMode, setInteractionMode] = useState<'draw' | 'scroll'>('draw')
  const [activeColor, setActiveColor] = useState<RedactionColor>('black')
  const [presetId, setPresetId] = useState<RedactionPresetId>('standard')
  const [anonymizeFilename, setAnonymizeFilename] = useState(true)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [output, setOutput] = useState<RedactedOutputState | null>(null)
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null)

  const pdfDocRef = useRef<OpenedPdfjsSession | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const cancelRequestedRef = useRef(false)
  const outputUrlRef = useRef<string | null>(null)

  const revokeOutputUrl = () => {
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current)
      outputUrlRef.current = null
    }
  }

  const closeActivePdfDoc = async () => {
    if (pdfDocRef.current) {
      try {
        await pdfDocRef.current.destroy()
      } catch {
        // ignore cleanup errors
      }
      pdfDocRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      cancelRequestedRef.current = true
      revokeOutputUrl()
      void closeActivePdfDoc()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const active = pdfDocRef.current
    const canvas = previewCanvasRef.current
    if (!session || !active || !canvas) return

    renderPdfPagePreview(active.doc, currentPage, canvas).catch((err) => {
      if (!cancelled) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'PDFページのプレビュー描画に失敗しました。'
        )
      }
    })

    return () => {
      cancelled = true
    }
  }, [session, currentPage])

  const currentPageRects = useMemo(
    () => rects.filter((r) => r.pageNumber === currentPage),
    [rects, currentPage]
  )

  const currentPageCandidates = useMemo(() => {
    if (!session) return []
    return session.candidatesByPage[currentPage] || []
  }, [session, currentPage])

  const totalCandidatesCount = useMemo(() => {
    if (!session) return 0
    return Object.values(session.candidatesByPage).reduce(
      (sum, list) => sum + list.length,
      0
    )
  }, [session])

  const activePagesCount = useMemo(() => {
    if (!session) return 0
    return session.structure.pageCount - excludedPages.length
  }, [session, excludedPages])

  const rectCountByPage = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const r of rects) {
      counts[r.pageNumber] = (counts[r.pageNumber] || 0) + 1
    }
    return counts
  }, [rects])

  const loadPdfBytes = async (
    rawBytes: Uint8Array,
    fileName: string,
    sizeWarning?: string
  ) => {
    setErrorMsg(null)
    setIsLoadingPdf(true)
    revokeOutputUrl()
    setOutput(null)
    setDraftBox(null)
    setSelectedRectId(null)

    try {
      await closeActivePdfDoc()
      const structure = await inspectPdfStructure(rawBytes)
      const opened = await openPdfjsDocument(rawBytes)
      const textAnalysis = await analyzePdfTextAndCandidates(opened.doc, activeColor)

      const candidatesByPage: Record<number, PiiTextCandidate[]> = {}
      const pageDimensions: Record<number, { widthPt: number; heightPt: number }> = {}
      for (const pageInfo of textAnalysis.pages) {
        candidatesByPage[pageInfo.pageNumber] = pageInfo.piiCandidates
        pageDimensions[pageInfo.pageNumber] = {
          widthPt: pageInfo.widthPt,
          heightPt: pageInfo.heightPt,
        }
      }

      pdfDocRef.current = opened
      setSession({
        fileName,
        structure,
        totalExtractedChars: textAnalysis.totalExtractedChars,
        candidatesByPage,
        pageDimensions,
        sizeWarning,
      })
      setCurrentPage(1)
      setRects([])
      setExcludedPages([])
    } catch (err) {
      await closeActivePdfDoc()
      setSession(null)
      setErrorMsg(
        err instanceof Error ? err.message : 'PDFの読み込みに失敗しました。'
      )
    } finally {
      setIsLoadingPdf(false)
    }
  }

  const handleFileInput = async (file: File | undefined) => {
    if (!file) return
    if (
      file.type &&
      file.type !== 'application/pdf' &&
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      setErrorMsg('PDFファイル（.pdf）を選択してください。')
      return
    }
    const check = validatePdfUploadSize(file.size)
    if (!check.ok) {
      setErrorMsg(check.error)
      return
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await loadPdfBytes(bytes, file.name, check.warning)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    void handleFileInput(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files?.[0]
    void handleFileInput(file)
  }

  const handleLoadSample = async () => {
    setErrorMsg(null)
    try {
      const sampleBytes = await createSampleConfidentialPdf()
      await loadPdfBytes(sampleBytes, 'sample_confidential_nda.pdf')
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'サンプルPDFの生成に失敗しました。'
      )
    }
  }

  const handleResetAll = async () => {
    cancelRequestedRef.current = true
    revokeOutputUrl()
    await closeActivePdfDoc()
    if (previewCanvasRef.current) {
      previewCanvasRef.current.width = 0
      previewCanvasRef.current.height = 0
    }
    setSession(null)
    setRects([])
    setExcludedPages([])
    setSelectedRectId(null)
    setOutput(null)
    setErrorMsg(null)
    setProgressText('')
  }

  const getRelativePoint = (clientX: number, clientY: number) => {
    const el = overlayRef.current
    if (!el) return { x: 0, y: 0 }
    const box = el.getBoundingClientRect()
    const x = box.width > 0 ? (clientX - box.left) / box.width : 0
    const y = box.height > 0 ? (clientY - box.top) / box.height : 0
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionMode !== 'draw' || isGenerating) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = getRelativePoint(e.clientX, e.clientY)
    setSelectedRectId(null)
    setDraftBox({
      startX: pt.x,
      startY: pt.y,
      currentX: pt.x,
      currentY: pt.y,
    })
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draftBox) return
    const pt = getRelativePoint(e.clientX, e.clientY)
    setDraftBox((prev) =>
      prev ? { ...prev, currentX: pt.x, currentY: pt.y } : null
    )
  }

  const commitDraftBox = () => {
    if (!draftBox) return
    const norm = normalizeRectCoords(
      draftBox.startX,
      draftBox.startY,
      draftBox.currentX,
      draftBox.currentY
    )
    setDraftBox(null)
    if (norm.width < 0.012 || norm.height < 0.012) return

    const id = `rect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setRects((prev) => [
      ...prev,
      {
        id,
        pageNumber: currentPage,
        ...norm,
        color: activeColor,
        source: 'manual',
      },
    ])
    setSelectedRectId(id)
    revokeOutputUrl()
    setOutput(null)
  }

  const applyCandidate = (candidate: PiiTextCandidate) => {
    const exists = rects.some(
      (r) =>
        r.pageNumber === candidate.rect.pageNumber &&
        Math.abs(r.x - candidate.rect.x) < 0.01 &&
        Math.abs(r.y - candidate.rect.y) < 0.01 &&
        Math.abs(r.width - candidate.rect.width) < 0.01
    )
    if (exists) return

    const id = `rect-pii-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setRects((prev) => [
      ...prev,
      {
        ...candidate.rect,
        id,
        color: activeColor,
      },
    ])
    setSelectedRectId(id)
    revokeOutputUrl()
    setOutput(null)
  }

  const applyAllCandidatesAcrossPages = () => {
    if (!session) return
    const toAdd: RedactionRect[] = []
    for (const list of Object.values(session.candidatesByPage)) {
      for (const candidate of list) {
        const duplicate = [...rects, ...toAdd].some(
          (r) =>
            r.pageNumber === candidate.rect.pageNumber &&
            Math.abs(r.x - candidate.rect.x) < 0.01 &&
            Math.abs(r.y - candidate.rect.y) < 0.01
        )
        if (!duplicate) {
          toAdd.push({
            ...candidate.rect,
            id: `rect-pii-${candidate.id}-${Math.random().toString(36).slice(2, 6)}`,
            color: activeColor,
          })
        }
      }
    }
    if (toAdd.length === 0) return
    setRects((prev) => [...prev, ...toAdd])
    revokeOutputUrl()
    setOutput(null)
  }

  const handleMaskEntirePage = () => {
    const id = `rect-full-${Date.now()}`
    setRects((prev) => [
      ...prev,
      {
        id,
        pageNumber: currentPage,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        color: activeColor,
        label: 'ページ全面',
        source: 'full-page',
      },
    ])
    setSelectedRectId(id)
    revokeOutputUrl()
    setOutput(null)
  }

  const handleApplyRectToAllPages = (target: RedactionRect) => {
    if (!session) return
    const clones: RedactionRect[] = []
    for (let p = 1; p <= session.structure.pageCount; p++) {
      if (p === target.pageNumber) continue
      const exists = rects.some(
        (r) =>
          r.pageNumber === p &&
          Math.abs(r.x - target.x) < 0.005 &&
          Math.abs(r.y - target.y) < 0.005
      )
      if (!exists) {
        clones.push({
          ...target,
          id: `rect-clone-p${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pageNumber: p,
        })
      }
    }
    if (clones.length > 0) {
      setRects((prev) => [...prev, ...clones])
      revokeOutputUrl()
      setOutput(null)
    }
  }

  const handleUndo = () => {
    setRects((prev) => {
      const next = prev.slice(0, -1)
      return next
    })
    setSelectedRectId(null)
    revokeOutputUrl()
    setOutput(null)
  }

  const handleDeleteRect = (id: string) => {
    setRects((prev) => prev.filter((r) => r.id !== id))
    if (selectedRectId === id) setSelectedRectId(null)
    revokeOutputUrl()
    setOutput(null)
  }

  const toggleExcludePage = (pageNum: number) => {
    setExcludedPages((prev) =>
      prev.includes(pageNum)
        ? prev.filter((p) => p !== pageNum)
        : [...prev, pageNum]
    )
    revokeOutputUrl()
    setOutput(null)
  }

  const handleGenerateRedactedPdf = async () => {
    const active = pdfDocRef.current
    if (!session || !active) return
    if (activePagesCount <= 0) {
      setErrorMsg('出力対象のページが1ページ以上必要です。')
      return
    }

    setErrorMsg(null)
    setIsGenerating(true)
    cancelRequestedRef.current = false
    revokeOutputUrl()
    setOutput(null)

    try {
      const preset = REDACTION_PRESETS[presetId]
      const assets: RasterizedPageAsset[] = []
      let clampedAnyPage = false
      let processed = 0

      for (let pageNum = 1; pageNum <= session.structure.pageCount; pageNum++) {
        if (cancelRequestedRef.current) {
          setProgressText('')
          setIsGenerating(false)
          return
        }
        if (excludedPages.includes(pageNum)) continue

        processed += 1
        setProgressText(
          `ラスタライズ焼付け中: ${processed} / ${activePagesCount} ページ (${pageNum}ページ目)`
        )

        const pageRects = rects.filter((r) => r.pageNumber === pageNum)
        const { asset, clamped } = await rasterizePageWithRedactions(
          active.doc,
          pageNum,
          pageRects,
          preset
        )
        if (clamped) clampedAnyPage = true
        assets.push(asset)
      }

      if (cancelRequestedRef.current) {
        setProgressText('')
        setIsGenerating(false)
        return
      }

      setProgressText('メタデータゼロの新規PDFを構築・再検証中...')
      const outBytes = await buildRedactedPdfFromImages(assets)
      const extractedAfterChars = await countPdfExtractedTextChars(outBytes)
      const verification = await verifyRedactedPdfOutput(
        outBytes,
        extractedAfterChars
      )

      const copyBuffer = outBytes.buffer.slice(
        outBytes.byteOffset,
        outBytes.byteOffset + outBytes.byteLength
      ) as ArrayBuffer
      const blob = new Blob([copyBuffer], { type: 'application/pdf' })
      const downloadUrl = URL.createObjectURL(blob)
      outputUrlRef.current = downloadUrl

      setOutput({
        downloadUrl,
        fileName: buildRedactedFilename(session.fileName, anonymizeFilename),
        verification,
        clampedAnyPage,
      })
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : '墨消しPDFの生成中にエラーが発生しました。'
      )
    } finally {
      setIsGenerating(false)
      setProgressText('')
    }
  }

  const currentDim = session?.pageDimensions[currentPage] || {
    widthPt: 595,
    heightPt: 842,
  }
  const selectedRect = currentPageRects.find((r) => r.id === selectedRectId) || null
  const isCurrentPageExcluded = excludedPages.includes(currentPage)

  const draftRectStyle = draftBox
    ? normalizeRectCoords(
        draftBox.startX,
        draftBox.startY,
        draftBox.currentX,
        draftBox.currentY
      )
    : null

  return (
    <div className="space-y-5">
      {/* ファイル読み込み / サンプル投入エリア */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDraggingFile(true)
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
          isDraggingFile
            ? 'border-sky-500 bg-sky-50'
            : 'border-slate-300 bg-slate-50/70'
        }`}
      >
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
            <FileLock2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              PDFファイルをここにドロップ、または選択（最大 50MB / 50ページ）
            </p>
            <p className="mt-1 text-xs text-slate-600">
              選択されたPDFファイルの中身は端末のメモリ内のみで描画・画像化され、外部サーバーへ送信されません。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>PDFファイルを選択</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleFileChange}
                className="sr-only"
                data-testid="pdf-file-input"
              />
            </label>
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoadingPdf || isGenerating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-900 transition hover:bg-sky-100 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
              <span>サンプル機密PDFを試す</span>
            </button>
            {session && (
              <button
                type="button"
                onClick={handleResetAll}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>リセット</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoadingPdf && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-900">
          PDFの構造・テキスト層・メタデータをブラウザ内で解析しています...
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p>{errorMsg}</p>
        </div>
      )}

      {session && (
        <>
          {session.sizeWarning && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p>{session.sizeWarning}</p>
            </div>
          )}

          {/* Before 診断サマリー */}
          <div
            data-testid="pdf-before-summary"
            className="rounded-xl border border-slate-200 bg-slate-50/90 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <h2 className="text-sm font-bold text-slate-900">
                  処理前スキャン診断: {session.fileName}
                </h2>
              </div>
              <span className="text-xs font-medium text-slate-600">
                {session.structure.pageCount} ページ / {formatPdfBytes(session.structure.byteSize)}
              </span>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-medium text-slate-500">下層の抽出可能テキスト</p>
                <p
                  data-testid="pdf-before-text-chars"
                  className="mt-0.5 text-sm font-bold text-slate-900"
                >
                  {session.totalExtractedChars.toLocaleString()} 文字
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-medium text-slate-500">埋め込みメタデータ / リスク要素</p>
                <p
                  data-testid="pdf-before-risk-count"
                  className="mt-0.5 text-sm font-bold text-amber-700"
                >
                  {session.structure.totalRiskItems} 件検出
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-medium text-slate-500">PII・機密候補の自動検出</p>
                <p className="mt-0.5 text-sm font-bold text-sky-700">
                  {totalCandidatesCount} 箇所
                </p>
              </div>
            </div>

            {(session.structure.metadataEntries.length > 0 ||
              session.structure.totalAnnotations > 0 ||
              session.structure.hasXmpMetadata) && (
              <details className="mt-3 rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">
                  検出されたメタデータ・注釈・構造情報の内訳を表示（書き出し時にすべて消去されます）
                </summary>
                <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
                  <ul className="space-y-1">
                    {session.structure.metadataEntries.map((entry) => (
                      <li key={entry.key}>
                        <span className="font-semibold text-slate-800">{entry.label}:</span>{' '}
                        <span className="break-all">{entry.valuePreview}</span>
                      </li>
                    ))}
                    {session.structure.hasXmpMetadata && (
                      <li>
                        <span className="font-semibold text-slate-800">XMP メタデータストリーム:</span>{' '}
                        カタログ上に存在（全消去対象）
                      </li>
                    )}
                    {session.structure.totalAnnotations > 0 && (
                      <li>
                        <span className="font-semibold text-slate-800">PDF注釈 (Annots):</span>{' '}
                        {session.structure.totalAnnotations} 件（画像統合時に消去）
                      </li>
                    )}
                    {session.structure.hasAcroForm && (
                      <li>フォーム項目 (AcroForm) を検出（再構築時に除去）</li>
                    )}
                    {session.structure.hasEmbeddedFiles && (
                      <li>埋め込み添付ファイル (EmbeddedFiles) を検出（再構築時に除去）</li>
                    )}
                  </ul>
                </div>
              </details>
            )}
          </div>

          {/* 操作ツールバー */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="キャンバス操作モード"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => setInteractionMode('draw')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                    interactionMode === 'draw'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>墨消し枠を引く</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionMode('scroll')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                    interactionMode === 'scroll'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>閲覧・スクロール</span>
                </button>
              </div>

              <div
                role="group"
                aria-label="墨消し色"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => setActiveColor('black')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                    activeColor === 'black'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-700'
                  }`}
                >
                  黒塗り
                </button>
                <button
                  type="button"
                  onClick={() => setActiveColor('white')}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                    activeColor === 'white'
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-300'
                      : 'text-slate-600'
                  }`}
                >
                  白塗り
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {totalCandidatesCount > 0 && (
                <button
                  type="button"
                  onClick={applyAllCandidatesAcrossPages}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 transition hover:bg-sky-100"
                >
                  <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                  <span>PII候補を一括黒塗り ({totalCandidatesCount}件)</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleMaskEntirePage}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>このページ全面</span>
              </button>
              <button
                type="button"
                onClick={handleUndo}
                disabled={rects.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>戻す</span>
              </button>
            </div>
          </div>

          {/* ページ切り替え & 除外設定 */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: session.structure.pageCount }, (_, i) => i + 1).map(
                (p) => {
                  const count = rectCountByPage[p] || 0
                  const isExcluded = excludedPages.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setCurrentPage(p)
                        setSelectedRectId(null)
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                        currentPage === p
                          ? 'bg-slate-900 text-white'
                          : isExcluded
                            ? 'bg-slate-200 text-slate-500 line-through'
                            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>P.{p}</span>
                      {count > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                            currentPage === p
                              ? 'bg-sky-500 text-white'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  )
                }
              )}
            </div>

            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isCurrentPageExcluded}
                onChange={() => toggleExcludePage(currentPage)}
                className="rounded border-slate-300"
              />
              <span>このページを出力から除外</span>
            </label>
          </div>

          {/* プレビューキャンバス ＋ 墨消しオーバーレイ */}
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="rounded-xl border border-slate-300 bg-slate-200/80 p-3 sm:p-4">
              {isCurrentPageExcluded && (
                <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                  このページは現在「出力から除外」されています。
                </div>
              )}

              <div
                ref={overlayRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={commitDraftBox}
                onPointerCancel={() => setDraftBox(null)}
                style={{
                  aspectRatio: `${currentDim.widthPt} / ${currentDim.heightPt}`,
                  touchAction: interactionMode === 'draw' ? 'none' : 'pan-y',
                }}
                className={`relative mx-auto w-full max-w-[740px] select-none overflow-hidden rounded-lg bg-white shadow-md ${
                  interactionMode === 'draw' ? 'cursor-crosshair' : 'cursor-grab'
                }`}
                data-testid="pdf-page-stage"
              >
                <canvas
                  ref={previewCanvasRef}
                  className="block h-full w-full"
                />

                {/* PII自動検出候補（未追加のものを青い破線枠でガイド表示） */}
                {currentPageCandidates.map((cand) => {
                  const alreadyAdded = currentPageRects.some(
                    (r) =>
                      Math.abs(r.x - cand.rect.x) < 0.01 &&
                      Math.abs(r.y - cand.rect.y) < 0.01
                  )
                  if (alreadyAdded) return null
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      title={`クリックして墨消し追加 (${cand.categoryLabel})`}
                      onClick={(e) => {
                        e.stopPropagation()
                        applyCandidate(cand)
                      }}
                      style={{
                        left: `${cand.rect.x * 100}%`,
                        top: `${cand.rect.y * 100}%`,
                        width: `${cand.rect.width * 100}%`,
                        height: `${cand.rect.height * 100}%`,
                      }}
                      className="absolute border-2 border-dashed border-sky-500 bg-sky-400/20 transition hover:bg-sky-500/35"
                    >
                      <span className="sr-only">
                        {cand.categoryLabel} を墨消し枠へ追加
                      </span>
                    </button>
                  )
                })}

                {/* 確定済み墨消し矩形 */}
                {currentPageRects.map((rect, idx) => {
                  const isSelected = rect.id === selectedRectId
                  return (
                    <div
                      key={rect.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedRectId(rect.id)
                      }}
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.width * 100}%`,
                        height: `${rect.height * 100}%`,
                      }}
                      className={`absolute ${
                        rect.color === 'white'
                          ? 'border border-slate-500 bg-white'
                          : 'bg-black'
                      } ${isSelected ? 'ring-2 ring-sky-500 ring-offset-1' : ''}`}
                      data-testid="redaction-box"
                    >
                      <button
                        type="button"
                        aria-label={`墨消し枠 ${idx + 1} を削除`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteRect(rect.id)
                        }}
                        className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow-xs hover:bg-rose-700"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}

                {/* ドラッグ中のプレビュー矩形 */}
                {draftRectStyle && (
                  <div
                    style={{
                      left: `${draftRectStyle.x * 100}%`,
                      top: `${draftRectStyle.y * 100}%`,
                      width: `${draftRectStyle.width * 100}%`,
                      height: `${draftRectStyle.height * 100}%`,
                    }}
                    className={`pointer-events-none absolute border-2 border-sky-500 ${
                      activeColor === 'white' ? 'bg-white/80' : 'bg-black/75'
                    }`}
                  />
                )}
              </div>

              <p className="mt-2 text-center text-[11px] text-slate-600">
                {interactionMode === 'draw'
                  ? 'ドラッグして墨消し枠を追加します。スマホで画面スクロールしたい場合は上の「閲覧・スクロール」へ切り替えてください。'
                  : '閲覧・スクロールモード中です。枠を引くには「墨消し枠を引く」を押してください。'}
              </p>
            </div>

            {/* サイドパネル：PII候補＆このページの枠一覧 */}
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Eye className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                  <span>P.{currentPage} の墨消し管理 ({currentPageRects.length}枠)</span>
                </h3>

                {selectedRect && (
                  <div className="mt-2.5 rounded-lg border border-sky-200 bg-sky-50/70 p-2.5 text-xs">
                    <p className="font-bold text-sky-950">選択中の枠操作</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {session.structure.pageCount > 1 && (
                        <button
                          type="button"
                          onClick={() => handleApplyRectToAllPages(selectedRect)}
                          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
                        >
                          <CopyPlus className="h-3 w-3" aria-hidden="true" />
                          <span>全ページ同位置へ複製</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteRect(selectedRect.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>削除</span>
                      </button>
                    </div>
                  </div>
                )}

                {currentPageCandidates.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-600">
                      このページで検出された機密候補:
                    </p>
                    <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                      {currentPageCandidates.map((cand) => {
                        const applied = currentPageRects.some(
                          (r) =>
                            Math.abs(r.x - cand.rect.x) < 0.01 &&
                            Math.abs(r.y - cand.rect.y) < 0.01
                        )
                        return (
                          <li
                            key={cand.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800">
                                {cand.categoryLabel}
                              </p>
                              <p className="truncate font-mono text-[10px] text-slate-500">
                                {cand.matchedPreview}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={applied}
                              onClick={() => applyCandidate(cand)}
                              className="shrink-0 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-800 disabled:bg-emerald-600"
                            >
                              {applied ? '追加済' : '塗る'}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {currentPageRects.length === 0 && currentPageCandidates.length === 0 && (
                  <p className="mt-2.5 text-xs text-slate-500">
                    プレビュー上をドラッグして隠したい箇所を囲んでください（枠なしのページもテキスト層・メタデータは消去されます）。
                  </p>
                )}
              </div>

              {/* 書き出し詳細設定 */}
              <details className="rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-3.5 py-2.5 text-xs font-bold text-slate-800">
                  画質(DPI)・出力ファイル名設定
                </summary>
                <div className="space-y-3 border-t border-slate-100 p-3.5 text-xs">
                  <div>
                    <label
                      htmlFor="redactor-preset-select"
                      className="block font-bold text-slate-700"
                    >
                      出力画質・フォーマット
                    </label>
                    <select
                      id="redactor-preset-select"
                      value={presetId}
                      onChange={(e) =>
                        setPresetId(e.target.value as RedactionPresetId)
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                    >
                      {Object.values(REDACTION_PRESETS).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {REDACTION_PRESETS[presetId].description}
                    </p>
                  </div>

                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={anonymizeFilename}
                      onChange={(e) => setAnonymizeFilename(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    <span className="text-[11px] leading-relaxed text-slate-700">
                      ファイル名を匿名化（<code>redacted-document.pdf</code>）して、元のファイル名に含まれる顧客名・案件名の漏洩を防ぐ
                    </span>
                  </label>
                </div>
              </details>

              {/* メイン実行ボタン */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGenerateRedactedPdf}
                  disabled={isGenerating || activePagesCount <= 0}
                  data-testid="generate-redacted-pdf-btn"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-sky-800 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isGenerating
                      ? '真の墨消しPDFを生成中...'
                      : `真の墨消しPDFを生成 (${activePagesCount}ページ)`}
                  </span>
                </button>

                {isGenerating && (
                  <div className="space-y-1.5 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-900">
                    <p className="font-semibold">{progressText}</p>
                    <button
                      type="button"
                      onClick={() => {
                        cancelRequestedRef.current = true
                      }}
                      className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-bold text-sky-900 hover:bg-sky-100"
                    >
                      処理を中断
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 処理後再検証結果 ＆ ダウンロードカード */}
          {output && (
            <div
              data-testid="pdf-redacted-result"
              className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950">
                      真の墨消しPDFを生成・再検証しました
                    </h3>
                    <p className="text-xs text-emerald-800">
                      {output.fileName} / {output.verification.pageCount} ページ /{' '}
                      {formatPdfBytes(output.verification.byteSize)}
                    </p>
                  </div>
                </div>

                <a
                  href={output.downloadUrl}
                  download={output.fileName}
                  data-testid="download-redacted-pdf"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>墨消し済みPDFをダウンロード</span>
                </a>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-slate-500">出力PDF 再検査: 抽出テキスト</p>
                  <p
                    data-testid="pdf-after-text-chars"
                    className="mt-0.5 text-sm font-bold text-emerald-700"
                  >
                    {output.verification.extractedTextCharCount} 文字（コピー・検索不能）
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-slate-500">出力PDF 再検査: メタデータ/XMP</p>
                  <p
                    data-testid="pdf-after-metadata-count"
                    className="mt-0.5 text-sm font-bold text-emerald-700"
                  >
                    {output.verification.metadataCount} 件（完全消去済み）
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                  <p className="text-[11px] text-slate-500">注釈・フォーム・添付/JS</p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-700">
                    {output.verification.totalRiskItems} 件（安全）
                  </p>
                </div>
              </div>

              {output.clampedAnyPage && (
                <p className="mt-2.5 text-xs text-amber-800">
                  ※ 超大判ページが含まれていたため、ブラウザのメモリ保護上限に合わせて解像度を自動調整して出力しました。
                </p>
              )}

              {output.verification.byteSize > 10 * 1024 * 1024 && (
                <p className="mt-2 text-xs text-amber-800">
                  ※ 出力サイズが 10MB を超えています。メール添付向けに容量を抑えたい場合は「軽量 (100 DPI / JPEG)」へ切り替えて再生成してください。
                </p>
              )}

              <p className="mt-3 text-xs font-medium text-slate-700">
                ご注意: 出力後は必ずダウンロードしたPDFを別のPDFビューア等で開き、墨消し範囲の漏れや周辺文字の判読可能性がないかご自身で最終確認してください。
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
