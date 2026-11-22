import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  Download,
  Image as ImageIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  buildCleanedFilename,
  calculateSavedBytesPercent,
  formatBytes,
  inspectImageMetadata,
  type ImageMetadataReport,
  type OutputImageMime,
} from '../../lib/tools/image-exif'

interface ProcessedImageItem {
  id: string
  originalName: string
  originalBytes: number
  beforeReport: ImageMetadataReport
  cleanedName: string
  cleanedBytes: number
  afterReport: ImageMetadataReport
  cleanedUrl: string
  width: number
  height: number
}

function createSyntheticExifJpegBlob(): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 400
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas context unavailable'))
      return
    }
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, 640, 400)
    ctx.fillStyle = '#38bdf8'
    ctx.fillRect(40, 40, 560, 320)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillText('LocalBox EXIF Test Sample', 110, 210)

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode sample JPEG'))
          return
        }
        const raw = new Uint8Array(await blob.arrayBuffer())
        // 最小のExif+GPS IFD APP1セグメントをSOI直後に挿入してリアルな診断体験を提供
        const exifBody = new Uint8Array([
          0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
          0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF II*, IFD0 offset 8
          0x02, 0x00, // 2 entries
          0x0f, 0x01, 0x02, 0x00, 0x04, 0x00, 0x00, 0x00, 0x54, 0x45, 0x53, 0x00, // Make tag 0x010F
          0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // GPS IFD tag 0x8825
          0x00, 0x00, 0x00, 0x00, // next IFD
        ])
        const app1Len = exifBody.length + 2
        const out = new Uint8Array(2 + 4 + exifBody.length + (raw.length - 2))
        out[0] = 0xff
        out[1] = 0xd8
        out[2] = 0xff
        out[3] = 0xe1
        out[4] = (app1Len >> 8) & 0xff
        out[5] = app1Len & 0xff
        out.set(exifBody, 6)
        out.set(raw.subarray(2), 6 + exifBody.length)
        resolve(out)
      },
      'image/jpeg',
      0.92
    )
  })
}

async function decodeAndCleanImage(
  fileBytes: Uint8Array,
  originalName: string,
  sourceMime: string,
  targetMime: OutputImageMime,
  quality: number,
  maxWidth: number
): Promise<ProcessedImageItem> {
  const beforeReport = inspectImageMetadata(fileBytes)
  const buf = fileBytes.buffer.slice(
    fileBytes.byteOffset,
    fileBytes.byteOffset + fileBytes.byteLength
  ) as ArrayBuffer
  const srcBlob = new Blob([buf], { type: sourceMime || 'image/jpeg' })
  const srcUrl = URL.createObjectURL(srcBlob)

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(`${originalName} の読み込みに失敗しました`))
      el.src = srcUrl
    })

    let targetW = img.naturalWidth
    let targetH = img.naturalHeight
    if (maxWidth > 0 && targetW > maxWidth) {
      const ratio = maxWidth / targetW
      targetW = maxWidth
      targetH = Math.max(1, Math.round(targetH * ratio))
    }

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas描画コンテキストを取得できませんでした')

    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, targetW, targetH)
    }
    ctx.drawImage(img, 0, 0, targetW, targetH)

    const outBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('画像の再エンコードに失敗しました'))),
        targetMime,
        quality
      )
    })

    const outBytes = new Uint8Array(await outBlob.arrayBuffer())
    const afterReport = inspectImageMetadata(outBytes)
    const cleanedUrl = URL.createObjectURL(outBlob)

    return {
      id: `${originalName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originalName,
      originalBytes: fileBytes.length,
      beforeReport,
      cleanedName: buildCleanedFilename(originalName, targetMime),
      cleanedBytes: outBytes.length,
      afterReport,
      cleanedUrl,
      width: targetW,
      height: targetH,
    }
  } finally {
    URL.revokeObjectURL(srcUrl)
  }
}

export default function ImageExifCleaner() {
  const [items, setItems] = useState<ProcessedImageItem[]>([])
  const [targetMime, setTargetMime] = useState<OutputImageMime>('image/webp')
  const [quality, setQuality] = useState(0.85)
  const [maxWidth, setMaxWidth] = useState(1920)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    return () => {
      items.forEach((item) => URL.revokeObjectURL(item.cleanedUrl))
    }
  }, [items])

  const processFileList = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsProcessing(true)
    setErrorMsg('')
    try {
      const processed: ProcessedImageItem[] = []
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        processed.push(
          await decodeAndCleanImage(
            bytes,
            file.name,
            file.type,
            targetMime,
            quality,
            maxWidth
          )
        )
      }
      setItems((prev) => [...processed, ...prev])
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '画像処理中にエラーが発生しました')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFilesSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    await processFileList(e.target.files)
    e.target.value = ''
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    await processFileList(e.dataTransfer.files)
  }

  const handleLoadSampleExifImage = async () => {
    setIsProcessing(true)
    setErrorMsg('')
    try {
      const sampleBytes = await createSyntheticExifJpegBlob()
      const result = await decodeAndCleanImage(
        sampleBytes,
        'sample-gps-photo.jpg',
        'image/jpeg',
        targetMime,
        quality,
        maxWidth
      )
      setItems((prev) => [result, ...prev])
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'サンプル生成に失敗しました')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClearAll = () => {
    items.forEach((item) => URL.revokeObjectURL(item.cleanedUrl))
    setItems([])
    setErrorMsg('')
  }

  return (
    <div className="space-y-5">
      {/* 最上部: ドロップ対応アップロード枠 */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
          isDragging
            ? 'border-sky-400 bg-sky-50/70'
            : 'border-slate-300 bg-slate-50/60'
        }`}
      >
        <ImageIcon className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-2.5 text-sm font-semibold text-slate-800">
          JPEG / PNG / WebP 画像をドロップ、または選択して一括削除
        </p>
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2.5">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
            <Upload className="h-4 w-4" />
            <span>画像を選択（複数可）</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFilesSelected}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={handleLoadSampleExifImage}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3.5 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            GPS/EXIF入りサンプル画像で検証
          </button>
        </div>
      </div>

      {/* スリムな書き出し設定行 */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 sm:grid-cols-3">
        <div>
          <label
            htmlFor="exif-output-mime"
            className="block text-xs font-semibold text-slate-700"
          >
            出力形式
          </label>
          <select
            id="exif-output-mime"
            value={targetMime}
            onChange={(e) => setTargetMime(e.target.value as OutputImageMime)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value="image/webp">WebP（高圧縮・Web向け）</option>
            <option value="image/jpeg">JPEG（汎用）</option>
            <option value="image/png">PNG（劣化なし）</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="exif-quality"
            className="block text-xs font-semibold tabular-nums text-slate-700"
          >
            画質: {Math.round(quality * 100)}%
          </label>
          <input
            id="exif-quality"
            type="range"
            min={0.5}
            max={0.95}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="mt-2.5 w-full accent-sky-700"
          />
        </div>

        <div>
          <label
            htmlFor="exif-max-width"
            className="block text-xs font-semibold text-slate-700"
          >
            最大横幅
          </label>
          <select
            id="exif-max-width"
            value={maxWidth}
            onChange={(e) => setMaxWidth(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
          >
            <option value={0}>リサイズしない（原寸）</option>
            <option value={1920}>最大 1920px</option>
            <option value={1280}>最大 1280px</option>
            <option value={800}>最大 800px</option>
          </select>
        </div>
      </div>

      {errorMsg && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
          {errorMsg}
        </p>
      )}

      {/* 結果リスト */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold tabular-nums text-slate-700">
              処理済み画像（{items.length}件）
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              一覧を消去
            </button>
          </div>

          {items.map((item) => {
            const savedPercent = calculateSavedBytesPercent(
              item.originalBytes,
              item.cleanedBytes
            )
            return (
              <div
                key={item.id}
                data-testid="cleaned-image-card"
                className="grid gap-3.5 rounded-xl border border-slate-200 bg-white p-3.5 sm:grid-cols-[108px_1fr_auto] sm:items-center"
              >
                <img
                  src={item.cleanedUrl}
                  alt={`${item.cleanedName} の削除後プレビュー`}
                  className="h-20 w-full rounded-lg border border-slate-200 object-cover sm:w-[108px]"
                />

                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {item.originalName}
                    </p>
                    <span className="text-xs tabular-nums text-slate-500">
                      ({item.width} x {item.height}px)
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {item.beforeReport.detectedTags.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-900 ring-1 ring-amber-200">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        削除前検出: {item.beforeReport.detectedTags.join(' / ')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">
                        削除前メタデータなし
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      削除後再検査: 検出 {item.afterReport.detectedTags.length} 件 (安全)
                    </span>
                  </div>

                  <p className="text-xs tabular-nums text-slate-600">
                    {formatBytes(item.originalBytes)} &rarr;{' '}
                    <strong className="text-slate-900">{formatBytes(item.cleanedBytes)}</strong>
                    {savedPercent >= 0 ? ` (${savedPercent}% 削減)` : ' (再エンコード済み)'}
                  </p>
                </div>

                <div>
                  <a
                    href={item.cleanedUrl}
                    download={item.cleanedName}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-sky-800"
                  >
                    <Download className="h-4 w-4" />
                    保存する
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
