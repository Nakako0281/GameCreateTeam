import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Download,
  FileArchive,
  FilePlus2,
  Files,
  Layers,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { formatPdfBytes } from '../../lib/tools/pdf-redactor'
import {
  MAX_ORGANIZER_FILE_BYTES,
  MAX_ORGANIZER_FILES,
  MAX_ORGANIZER_TOTAL_BYTES,
  MAX_ORGANIZER_TOTAL_PAGES,
  buildChunkedSplitGroups,
  buildOrganizedOutput,
  describePaperSize,
  insertBlankPageAfter,
  inspectOrganizerSourcePdf,
  moveOrganizerPage,
  normalizeRotationAngle,
  parseRangeGroups,
  reverseIncludedPages,
  rotateEvenIncludedPages,
  rotateOrganizerPages,
  sortPagesByFilename,
  validateOrganizerFileAdd,
  type OrganizerBuildResult,
  type OrganizerOutputMode,
  type OrganizerPageItem,
  type OrganizerSourceFile,
} from '../../lib/tools/pdf-organizer'
import {
  createSampleOrganizerPdfs,
  openPdfjsDocument,
  renderPdfThumbnailBlobUrl,
  type OpenedPdfjsSession,
} from '../../lib/tools/pdf-rasterizer.client'

interface OutputDownloadItem {
  fileName: string
  byteSize: number
  pageCount: number
  downloadUrl: string
  riskCount: number
  metadataCount: number
  annotationCount: number
}

interface OutputViewState {
  mode: OrganizerOutputMode
  totalInputRiskItems: number
  totalOutputRiskItems: number
  items: OutputDownloadItem[]
  zipArchive: {
    fileName: string
    byteSize: number
    downloadUrl: string
  } | null
}

function ThumbnailCanvasPreview({
  pageItem,
  pdfDoc,
  cachedUrl,
  onGenerated,
}: {
  pageItem: OrganizerPageItem
  pdfDoc: OpenedPdfjsSession['doc'] | undefined
  cachedUrl: string | undefined
  onGenerated: (cacheKey: string, url: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const effectiveRotation = normalizeRotationAngle(
    pageItem.baseRotation + pageItem.rotationDelta
  )
  const cacheKey = `${pageItem.id}:${effectiveRotation}`

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '120px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (pageItem.kind !== 'source' || !pdfDoc || !isVisible || cachedUrl) {
      return
    }
    let cancelled = false
    renderPdfThumbnailBlobUrl(
      pdfDoc,
      pageItem.originalPageNumber,
      pageItem.rotationDelta,
      320
    )
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        onGenerated(cacheKey, url)
      })
      .catch(() => {
        // サムネイル失敗時もページ操作自体は継続可能にする
      })
    return () => {
      cancelled = true
    }
  }, [
    pageItem.kind,
    pageItem.originalPageNumber,
    pageItem.rotationDelta,
    pdfDoc,
    isVisible,
    cachedUrl,
    cacheKey,
    onGenerated,
  ])

  const swapped = effectiveRotation === 90 || effectiveRotation === 270
  const visualW = swapped ? pageItem.heightPt : pageItem.widthPt
  const visualH = swapped ? pageItem.widthPt : pageItem.heightPt
  const isLandscape = visualW > visualH

  if (pageItem.kind === 'blank') {
    return (
      <div
        ref={containerRef}
        className="flex h-36 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-2"
      >
        <div
          className={`flex flex-col items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400 shadow-2xs ${
            isLandscape ? 'h-20 w-28' : 'h-28 w-20'
          }`}
        >
          <FilePlus2 className="h-5 w-5" aria-hidden="true" />
          <span className="mt-1 text-[10px] font-medium">白紙ページ</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex h-36 w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100/80 p-2"
    >
      {cachedUrl ? (
        <img
          src={cachedUrl}
          alt={`${pageItem.sourceFileName} ${pageItem.originalPageNumber}ページ目`}
          className="max-h-full max-w-full rounded border border-slate-200 bg-white object-contain shadow-2xs"
        />
      ) : (
        <div className="flex flex-col items-center gap-1 text-xs text-slate-400">
          <Files className="h-5 w-5 animate-pulse" aria-hidden="true" />
          <span>読込中...</span>
        </div>
      )}
    </div>
  )
}

export default function PdfOrganizer() {
  const [sources, setSources] = useState<OrganizerSourceFile[]>([])
  const [pages, setPages] = useState<OrganizerPageItem[]>([])
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({})
  const [outputMode, setOutputMode] = useState<OrganizerOutputMode>('merge')
  const [rangeSpec, setRangeSpec] = useState('1-2, 3')
  const [pagesPerFile, setPagesPerFile] = useState(1)
  const [stripMetadataAndRisks, setStripMetadataAndRisks] = useState(true)
  const [normalizeToA4Portrait, setNormalizeToA4Portrait] = useState(false)
  const [anonymizeFilename, setAnonymizeFilename] = useState(true)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [outputState, setOutputState] = useState<OutputViewState | null>(null)

  const pdfSessionsRef = useRef<Map<string, OpenedPdfjsSession>>(new Map())
  const thumbUrlsRef = useRef<Set<string>>(new Set())
  const outputUrlsRef = useRef<string[]>([])
  const fileCounterRef = useRef(0)
  const blankCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const revokeOutputUrls = () => {
    for (const url of outputUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    outputUrlsRef.current = []
  }

  const revokeAllThumbUrls = () => {
    for (const url of thumbUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    thumbUrlsRef.current.clear()
  }

  const destroyAllSessions = async () => {
    const entries = Array.from(pdfSessionsRef.current.values())
    pdfSessionsRef.current.clear()
    await Promise.all(
      entries.map(async (session) => {
        try {
          await session.destroy()
        } catch {
          // ignore cleanup failure
        }
      })
    )
  }

  useEffect(() => {
    return () => {
      revokeOutputUrls()
      revokeAllThumbUrls()
      void destroyAllSessions()
    }
  }, [])

  const registerThumbnailUrl = (cacheKey: string, url: string) => {
    thumbUrlsRef.current.add(url)
    setThumbCache((prev) => {
      if (prev[cacheKey]) {
        URL.revokeObjectURL(url)
        thumbUrlsRef.current.delete(url)
        return prev
      }
      return { ...prev, [cacheKey]: url }
    })
  }

  const clearOutputResult = () => {
    revokeOutputUrls()
    setOutputState(null)
  }

  const resetAll = async () => {
    clearOutputResult()
    revokeAllThumbUrls()
    setThumbCache({})
    setSources([])
    setPages([])
    setErrorMsg(null)
    await destroyAllSessions()
  }

  const appendPdfBuffers = async (
    entries: { fileName: string; bytes: Uint8Array }[],
    replaceExisting = false
  ) => {
    setErrorMsg(null)
    setIsLoading(true)
    try {
      if (replaceExisting) {
        await resetAll()
      } else {
        clearOutputResult()
      }

      let runningBytes = replaceExisting
        ? 0
        : sources.reduce((sum, s) => sum + s.byteSize, 0)
      let runningCount = replaceExisting ? 0 : sources.length
      let runningPages = replaceExisting ? 0 : pages.length

      const addedSources: OrganizerSourceFile[] = []
      const addedPages: OrganizerPageItem[] = []

      for (const entry of entries) {
        const sizeCheck = validateOrganizerFileAdd(
          runningBytes,
          runningCount,
          entry.bytes.byteLength
        )
        if (!sizeCheck.ok) {
          throw new Error(`${entry.fileName}: ${sizeCheck.error}`)
        }

        const fileId = `src-${++fileCounterRef.current}`
        const inspected = await inspectOrganizerSourcePdf(
          entry.bytes,
          entry.fileName,
          fileId,
          runningPages
        )
        const session = await openPdfjsDocument(entry.bytes)
        pdfSessionsRef.current.set(fileId, session)

        addedSources.push(inspected.source)
        addedPages.push(...inspected.pages)
        runningBytes += inspected.source.byteSize
        runningCount += 1
        runningPages += inspected.pages.length
      }

      setSources((prev) => (replaceExisting ? addedSources : [...prev, ...addedSources]))
      setPages((prev) => (replaceExisting ? addedPages : [...prev, ...addedPages]))
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'PDFファイルの読み込みに失敗しました。'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const items: { fileName: string; bytes: Uint8Array }[] = []
    for (const file of Array.from(fileList)) {
      if (
        file.type &&
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
      ) {
        setErrorMsg(`PDFファイル以外は読み込めません: ${file.name}`)
        e.target.value = ''
        return
      }
      items.push({
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })
    }
    e.target.value = ''
    await appendPdfBuffers(items, false)
  }

  const handleDropFiles = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const dropped = Array.from(e.dataTransfer.files || [])
    if (dropped.length === 0) return
    const items: { fileName: string; bytes: Uint8Array }[] = []
    for (const file of dropped) {
      if (
        file.type &&
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
      ) {
        setErrorMsg(`PDFファイル以外は読み込めません: ${file.name}`)
        return
      }
      items.push({
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })
    }
    await appendPdfBuffers(items, false)
  }

  const handleLoadSamples = async () => {
    setErrorMsg(null)
    setIsLoading(true)
    try {
      const sampleFiles = await createSampleOrganizerPdfs()
      await appendPdfBuffers(sampleFiles, true)
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'サンプルPDFの生成に失敗しました。'
      )
      setIsLoading(false)
    }
  }

  const handleRemoveSource = async (fileId: string) => {
    clearOutputResult()
    const session = pdfSessionsRef.current.get(fileId)
    if (session) {
      pdfSessionsRef.current.delete(fileId)
      try {
        await session.destroy()
      } catch {
        // ignore
      }
    }
    setSources((prev) => prev.filter((s) => s.id !== fileId))
    setPages((prev) => prev.filter((p) => p.sourceFileId !== fileId))
  }

  const activePages = useMemo(() => pages.filter((p) => p.included), [pages])
  const selectedIds = useMemo(
    () => new Set(pages.filter((p) => p.selected).map((p) => p.id)),
    [pages]
  )
  const totalBytes = useMemo(
    () => sources.reduce((sum, s) => sum + s.byteSize, 0),
    [sources]
  )
  const totalBeforeRisks = useMemo(
    () => sources.reduce((sum, s) => sum + s.structure.totalRiskItems, 0),
    [sources]
  )
  const hasAnySignature = useMemo(
    () => sources.some((s) => s.structure.hasDigitalSignature),
    [sources]
  )

  const activeIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let seq = 1
    for (const p of pages) {
      if (p.included) map.set(p.id, seq++)
    }
    return map
  }, [pages])

  const splitPreviewInfo = useMemo(() => {
    if (activePages.length === 0) return null
    if (outputMode === 'split-ranges') {
      return parseRangeGroups(rangeSpec, activePages.length)
    }
    if (outputMode === 'split-each') {
      return {
        ok: true as const,
        groups: buildChunkedSplitGroups(activePages.length, pagesPerFile),
      }
    }
    return null
  }, [outputMode, rangeSpec, pagesPerFile, activePages.length])

  const handleGenerate = async () => {
    setErrorMsg(null)
    setIsBuilding(true)
    clearOutputResult()
    try {
      const built: OrganizerBuildResult = await buildOrganizedOutput({
        sources,
        items: pages,
        mode: outputMode,
        rangeSpec,
        pagesPerFile,
        stripMetadataAndRisks,
        normalizeToA4Portrait,
        anonymizeFilename,
      })

      const createdUrls: string[] = []
      const downloadItems: OutputDownloadItem[] = built.artifacts.map((art) => {
        const blob = new Blob([art.bytes as unknown as BlobPart], {
          type: 'application/pdf',
        })
        const url = URL.createObjectURL(blob)
        createdUrls.push(url)
        return {
          fileName: art.fileName,
          byteSize: art.byteSize,
          pageCount: art.pageCount,
          downloadUrl: url,
          riskCount: art.verification.totalRiskItems,
          metadataCount: art.verification.metadataEntries.length,
          annotationCount: art.verification.totalAnnotations,
        }
      })

      let zipView: OutputViewState['zipArchive'] = null
      if (built.zipArchive) {
        const zipBlob = new Blob([built.zipArchive.bytes as unknown as BlobPart], {
          type: 'application/zip',
        })
        const zipUrl = URL.createObjectURL(zipBlob)
        createdUrls.push(zipUrl)
        zipView = {
          fileName: built.zipArchive.fileName,
          byteSize: built.zipArchive.byteSize,
          downloadUrl: zipUrl,
        }
      }

      outputUrlsRef.current = createdUrls
      setOutputState({
        mode: built.mode,
        totalInputRiskItems: built.totalInputRiskItems,
        totalOutputRiskItems: built.totalOutputRiskItems,
        items: downloadItems,
        zipArchive: zipView,
      })
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'PDFの生成中にエラーが発生しました。'
      )
    } finally {
      setIsBuilding(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 1. ドロップ＆サンプル読み込み */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDraggingFile(true)
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDropFiles}
        className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
          isDraggingFile
            ? 'border-sky-500 bg-sky-50/70'
            : 'border-slate-300 bg-slate-50/60 hover:border-sky-400'
        }`}
      >
        <input
          ref={fileInputRef}
          data-testid="organizer-file-input"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileInputChange}
          className="sr-only"
        />

        <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-sky-700">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              複数のPDFファイルをドロップ、または追加して結合・分割
            </p>
            <p className="mt-1 text-xs text-slate-500">
              最大 {MAX_ORGANIZER_FILES} ファイル・合計 {MAX_ORGANIZER_TOTAL_PAGES} ページ・
              {formatPdfBytes(MAX_ORGANIZER_TOTAL_BYTES)} まで（1ファイル{' '}
              {formatPdfBytes(MAX_ORGANIZER_FILE_BYTES)} 上限）。パスワード付きPDFは非対応です。
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              disabled={isLoading || isBuilding}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-sky-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {sources.length > 0 ? 'PDFを追加する' : 'PDFを選択する'}
            </button>

            <button
              type="button"
              data-testid="load-sample-pdfs-btn"
              disabled={isLoading || isBuilding}
              onClick={handleLoadSamples}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-700 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-sky-600" aria-hidden="true" />
              サンプル2ファイル（契約書案＋別紙）を試す
            </button>

            {sources.length > 0 && (
              <button
                type="button"
                disabled={isLoading || isBuilding}
                onClick={resetAll}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                すべてクリア
              </button>
            )}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-900"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <p>{errorMsg}</p>
        </div>
      )}

      {sources.length > 0 && (
        <>
          {/* 2. 読み込み済みファイルと構造リスク診断（Before） */}
          <section
            data-testid="organizer-before-summary"
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-sky-700" aria-hidden="true" />
                <h2 className="text-sm font-bold text-slate-900">
                  読み込み済みPDF（{sources.length}ファイル / 有効 {activePages.length} / 全 {pages.length} ページ・{formatPdfBytes(totalBytes)}）
                </h2>
              </div>

              <span
                data-testid="organizer-before-risk-count"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  totalBeforeRisks > 0
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {totalBeforeRisks > 0 ? (
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                原本メタデータ・構造リスク: {totalBeforeRisks} 件検出
              </span>
            </div>

            {hasAnySignature && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <p>
                  <strong>電子署名（タイムスタンプ/PAdES等）を含むPDFが検出されました:</strong>{' '}
                  結合・分割・ページ並べ替えを行うと文書構造が変わるため、出力PDFでは元の電子署名は無効になります。原本の署名保持が必要な提出には使用しないでください。
                </p>
              </div>
            )}

            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {sources.map((src) => (
                <li
                  key={src.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{src.fileName}</p>
                    <p className="text-slate-500">
                      {src.pageCount} ページ・{formatPdfBytes(src.byteSize)}・リスク{' '}
                      {src.structure.totalRiskItems} 件
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSource(src.id)}
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`${src.fileName} を削除`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    削除
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* 3. 一括操作バー */}
          <section className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allSelected = pages.every((p) => p.selected)
                  setPages((prev) => prev.map((p) => ({ ...p, selected: !allSelected })))
                }}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {pages.every((p) => p.selected) ? '選択をすべて解除' : '全ページを選択'}
              </button>

              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  clearOutputResult()
                  setPages((prev) => rotateOrganizerPages(prev, selectedIds, 90))
                }}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400 disabled:opacity-40"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                選択を右90°回転 ({selectedIds.size})
              </button>

              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  clearOutputResult()
                  setPages((prev) =>
                    prev.map((p) =>
                      selectedIds.has(p.id)
                        ? { ...p, included: false, selected: false }
                        : p
                    )
                  )
                }}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:border-rose-300 disabled:opacity-40"
              >
                選択を除外
              </button>

              <span className="hidden h-5 w-px bg-slate-200 sm:inline-block" aria-hidden="true" />

              <button
                type="button"
                onClick={() => {
                  clearOutputResult()
                  setPages((prev) => rotateEvenIncludedPages(prev, 180))
                }}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                偶数ページ180°回転
              </button>

              <button
                type="button"
                onClick={() => {
                  clearOutputResult()
                  setPages((prev) => reverseIncludedPages(prev))
                }}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400"
              >
                逆順にする
              </button>

              <button
                type="button"
                onClick={() => {
                  clearOutputResult()
                  setPages((prev) => sortPagesByFilename(prev))
                }}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400"
              >
                ファイル名順に戻す
              </button>

              <button
                type="button"
                onClick={() => {
                  clearOutputResult()
                  const blankId = `blank-${++blankCounterRef.current}`
                  setPages((prev) => insertBlankPageAfter(prev, null, blankId))
                }}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                白紙ページ追加
              </button>

              {pages.some((p) => !p.included) && (
                <button
                  type="button"
                  onClick={() => {
                    clearOutputResult()
                    setPages((prev) => prev.map((p) => ({ ...p, included: true })))
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                  除外をすべて戻す
                </button>
              )}
            </div>
          </section>

          {/* 4. ページサムネイル・並べ替えグリッド（非DnDファースト・390px完全対応） */}
          <section
            data-testid="organizer-page-grid"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {pages.map((item, idx) => {
              const effRotation = normalizeRotationAngle(
                item.baseRotation + item.rotationDelta
              )
              const sizeDesc = describePaperSize(
                item.widthPt,
                item.heightPt,
                effRotation
              )
              const cacheKey = `${item.id}:${effRotation}`
              const activeSeq = activeIndexMap.get(item.id)
              const pdfDoc = pdfSessionsRef.current.get(item.sourceFileId)?.doc

              return (
                <div
                  key={item.id}
                  data-testid="organizer-page-card"
                  className={`flex flex-col gap-2.5 rounded-xl border p-3 transition ${
                    item.included
                      ? item.selected
                        ? 'border-sky-500 bg-sky-50/40 shadow-xs'
                        : 'border-slate-200 bg-white'
                      : 'border-dashed border-slate-300 bg-slate-100/70 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-900">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() =>
                          setPages((prev) =>
                            prev.map((p) =>
                              p.id === item.id ? { ...p, selected: !p.selected } : p
                            )
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-sky-700"
                      />
                      <span
                        data-testid="organizer-page-order"
                        className={`rounded px-1.5 py-0.5 text-[11px] font-extrabold ${
                          item.included
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {item.included ? `#${activeSeq}` : '除外'}
                      </span>
                    </label>

                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {sizeDesc.label} ({sizeDesc.dimensionsMm})
                    </span>
                  </div>

                  <ThumbnailCanvasPreview
                    pageItem={item}
                    pdfDoc={pdfDoc}
                    cachedUrl={thumbCache[cacheKey]}
                    onGenerated={registerThumbnailUrl}
                  />

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span className="truncate font-medium">
                      {item.kind === 'blank'
                        ? '挿入された白紙ページ'
                        : `${item.sourceFileName} (p.${item.originalPageNumber})`}
                    </span>
                    {effRotation !== 0 && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                        {effRotation}°
                      </span>
                    )}
                  </div>

                  {/* ボタン操作（モバイルで44px以上タップ領域を確保） */}
                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        clearOutputResult()
                        setPages((prev) => moveOrganizerPage(prev, idx, idx - 1))
                      }}
                      aria-label="1つ前へ移動"
                      title="1つ前へ移動"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400 hover:bg-white disabled:opacity-35 sm:min-h-[38px]"
                    >
                      <ArrowLeft className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <ArrowUp className="hidden h-4 w-4 sm:block" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      disabled={idx === pages.length - 1}
                      onClick={() => {
                        clearOutputResult()
                        setPages((prev) => moveOrganizerPage(prev, idx, idx + 1))
                      }}
                      aria-label="1つ後ろへ移動"
                      title="1つ後ろへ移動"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400 hover:bg-white disabled:opacity-35 sm:min-h-[38px]"
                    >
                      <ArrowRight className="h-4 w-4 sm:hidden" aria-hidden="true" />
                      <ArrowDown className="hidden h-4 w-4 sm:block" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearOutputResult()
                        setPages((prev) =>
                          rotateOrganizerPages(prev, new Set([item.id]), -90)
                        )
                      }}
                      aria-label="左に90度回転"
                      title="左90°回転"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400 hover:bg-white sm:min-h-[38px]"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearOutputResult()
                        setPages((prev) =>
                          rotateOrganizerPages(prev, new Set([item.id]), 90)
                        )
                      }}
                      aria-label="右に90度回転"
                      title="右90°回転"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-400 hover:bg-white sm:min-h-[38px]"
                    >
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearOutputResult()
                        setPages((prev) =>
                          prev.map((p) =>
                            p.id === item.id ? { ...p, included: !p.included } : p
                          )
                        )
                      }}
                      aria-label={item.included ? 'ページを除外' : 'ページを復帰'}
                      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg border text-xs font-bold sm:min-h-[38px] ${
                        item.included
                          ? 'border-slate-200 bg-slate-50 text-rose-700 hover:border-rose-300 hover:bg-rose-50'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      {item.included ? '除外' : '戻す'}
                    </button>
                  </div>

                  {/* 番号指定での確実な移動 */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px]">
                    <label className="flex items-center gap-1.5 text-slate-600">
                      <span>位置移動:</span>
                      <select
                        aria-label={`${item.sourceFileName} ${item.originalPageNumber}ページ目の移動先位置`}
                        value={idx}
                        onChange={(e) => {
                          clearOutputResult()
                          const toIdx = Number(e.target.value)
                          setPages((prev) => moveOrganizerPage(prev, idx, toIdx))
                        }}
                        className="min-h-[34px] rounded border border-slate-300 bg-white px-1.5 text-xs font-semibold text-slate-800"
                      >
                        {pages.map((_, posIdx) => (
                          <option key={posIdx} value={posIdx}>
                            {posIdx + 1} 番目
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        clearOutputResult()
                        const blankId = `blank-${++blankCounterRef.current}`
                        setPages((prev) => insertBlankPageAfter(prev, item.id, blankId))
                      }}
                      className="text-[11px] font-semibold text-sky-700 hover:underline"
                    >
                      + 直後に白紙
                    </button>
                  </div>
                </div>
              )
            })}
          </section>

          {/* 5. 出力モード設定＆生成ボタン */}
          <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div>
              <p className="text-xs font-bold text-slate-800">出力モードの選択</p>
              <div
                role="group"
                aria-label="出力モードの選択"
                className="mt-2 grid gap-2 sm:grid-cols-3"
              >
                <button
                  type="button"
                  onClick={() => {
                    clearOutputResult()
                    setOutputMode('merge')
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    outputMode === 'merge'
                      ? 'border-sky-600 bg-sky-700 text-white shadow-xs'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400'
                  }`}
                >
                  <Files className="h-4 w-4" aria-hidden="true" />
                  1つのPDFに結合・出力
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearOutputResult()
                    setOutputMode('split-ranges')
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    outputMode === 'split-ranges'
                      ? 'border-sky-600 bg-sky-700 text-white shadow-xs'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400'
                  }`}
                >
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                  範囲指定で分割出力
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearOutputResult()
                    setOutputMode('split-each')
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    outputMode === 'split-each'
                      ? 'border-sky-600 bg-sky-700 text-white shadow-xs'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-sky-400'
                  }`}
                >
                  <FileArchive className="h-4 w-4" aria-hidden="true" />
                  ページ数ごとに全分割
                </button>
              </div>
            </div>

            {outputMode === 'split-ranges' && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <label
                  htmlFor="split-range-input"
                  className="block text-xs font-bold text-slate-800"
                >
                  分割するページ範囲（有効ページ #1〜#{activePages.length} を指定）
                </label>
                <input
                  id="split-range-input"
                  data-testid="split-range-input"
                  type="text"
                  value={rangeSpec}
                  onChange={(e) => {
                    clearOutputResult()
                    setRangeSpec(e.target.value)
                  }}
                  placeholder="例: 1-2, 3-5（カンマ区切りで複数ファイル、+ で同一ファイル内抽出）"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none"
                />
                {splitPreviewInfo && splitPreviewInfo.ok && (
                  <p className="text-xs text-emerald-800">
                    出力予定（{splitPreviewInfo.groups.length}ファイル）:{' '}
                    {splitPreviewInfo.groups.map((g) => g.label).join(' ／ ')}
                  </p>
                )}
                {splitPreviewInfo && !splitPreviewInfo.ok && (
                  <p className="text-xs text-rose-700">{splitPreviewInfo.error}</p>
                )}
              </div>
            )}

            {outputMode === 'split-each' && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <label
                  htmlFor="split-chunk-size"
                  className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800"
                >
                  <span>1ファイルあたりのページ数:</span>
                  <input
                    id="split-chunk-size"
                    type="number"
                    min={1}
                    max={Math.max(1, activePages.length)}
                    value={pagesPerFile}
                    onChange={(e) => {
                      clearOutputResult()
                      setPagesPerFile(Math.max(1, Number(e.target.value) || 1))
                    }}
                    className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900"
                  />
                  <span className="font-normal text-slate-600">
                    （合計 {splitPreviewInfo?.ok ? splitPreviewInfo.groups.length : 0} ファイルに分割・2件以上はZIP一括保存可）
                  </span>
                </label>
              </div>
            )}

            <div className="grid gap-2.5 sm:grid-cols-3">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <input
                  type="checkbox"
                  checked={stripMetadataAndRisks}
                  onChange={(e) => {
                    clearOutputResult()
                    setStripMetadataAndRisks(e.target.checked)
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700"
                />
                <span>
                  <strong className="block text-slate-900">
                    メタデータ・注釈・不要構造を除去（推奨）
                  </strong>
                  <span className="text-slate-500">
                    Info/XMP・レビュー注釈・URI/JSアクション・除外ページ参照を消去して出力します。
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <input
                  type="checkbox"
                  checked={normalizeToA4Portrait}
                  onChange={(e) => {
                    clearOutputResult()
                    setNormalizeToA4Portrait(e.target.checked)
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700"
                />
                <span>
                  <strong className="block text-slate-900">
                    A4縦サイズへ自動フィット統一
                  </strong>
                  <span className="text-slate-500">
                    A3横やレター等の混在ページを縦横比維持でA4縦へ揃えます（既定は原本寸法維持）。
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <input
                  type="checkbox"
                  checked={anonymizeFilename}
                  onChange={(e) => {
                    clearOutputResult()
                    setAnonymizeFilename(e.target.checked)
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700"
                />
                <span>
                  <strong className="block text-slate-900">
                    匿名ファイル名で保存（推奨）
                  </strong>
                  <span className="text-slate-500">
                    元ファイル名に含まれる案件名・顧客名の露出を防ぎます。
                  </span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-600">
                ※ テキスト選択・ベクター画質を保持します。黒塗り墨消しは{' '}
                <a
                  href="/tools/pdf-redactor/"
                  className="font-semibold text-sky-700 underline"
                >
                  PDF真の墨消し
                </a>{' '}
                をご使用ください。
              </p>

              <button
                type="button"
                data-testid="generate-organized-pdf-btn"
                disabled={isBuilding || isLoading || activePages.length === 0}
                onClick={handleGenerate}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-800 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {isBuilding
                  ? 'PDFを生成中...'
                  : outputMode === 'merge'
                    ? '結合・整理済みPDFを生成'
                    : '分割PDFを生成'}
              </button>
            </div>
          </section>
        </>
      )}

      {/* 6. 生成結果と Before/After 構造検証レポート */}
      {outputState && (
        <section
          data-testid="organizer-output-result"
          className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-950">
              <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
              <h2 className="text-sm font-bold">
                出力完了（{outputState.items.length}ファイル生成）
              </h2>
            </div>

            <span
              data-testid="organizer-after-risk-count"
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                outputState.totalOutputRiskItems === 0
                  ? 'bg-emerald-700 text-white'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              出力後リスク再検査: {outputState.totalOutputRiskItems} 件
              {outputState.totalOutputRiskItems === 0 ? '（安全）' : '（除去OFF設定）'}
            </span>
          </div>

          <p className="text-xs text-slate-700">
            原本検出リスク {outputState.totalInputRiskItems} 件 ➔ 出力PDF再スキャン結果{' '}
            <strong>{outputState.totalOutputRiskItems} 件</strong>。出力ファイルを開いてページ順・向き・表示崩れがないか目視確認してください。
          </p>

          {outputState.zipArchive && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-white p-3">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {outputState.zipArchive.fileName}
                </p>
                <p className="text-xs text-slate-500">
                  分割された全 {outputState.items.length} 個のPDFを1つにまとめたZIPアーカイブ（
                  {formatPdfBytes(outputState.zipArchive.byteSize)}）
                </p>
              </div>
              <a
                data-testid="download-organized-zip"
                href={outputState.zipArchive.downloadUrl}
                download={outputState.zipArchive.fileName}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800"
              >
                <FileArchive className="h-4 w-4" aria-hidden="true" />
                ZIPで一括ダウンロード
              </a>
            </div>
          )}

          <ul className="grid gap-2 sm:grid-cols-2">
            {outputState.items.map((item, i) => (
              <li
                key={`${item.fileName}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">
                    {item.fileName}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {item.pageCount} ページ・{formatPdfBytes(item.byteSize)}・メタデータ{' '}
                    {item.metadataCount} 件・注釈 {item.annotationCount} 件
                  </p>
                </div>
                <a
                  data-testid="download-organized-pdf"
                  href={item.downloadUrl}
                  download={item.fileName}
                  className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  保存
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
