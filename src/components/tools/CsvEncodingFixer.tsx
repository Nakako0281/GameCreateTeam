import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react'
import {
  createSampleShiftJisCsvBytes,
  decodeAndParseCsvBytes,
  encodeTransformedCsv,
  transformCsvRows,
  type ColumnAction,
  type SupportedSourceEncoding,
  type TargetOutputFormat,
} from '../../lib/tools/csv-fixer'

export default function CsvEncodingFixer() {
  const [rawBytes, setRawBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('')
  const [sourceEncoding, setSourceEncoding] = useState<SupportedSourceEncoding>('AUTO')
  const [delimiterMode, setDelimiterMode] = useState<'AUTO' | ',' | '\t'>('AUTO')
  const [columnActions, setColumnActions] = useState<ColumnAction[]>([])
  const [outputFormat, setOutputFormat] = useState<TargetOutputFormat>('utf8-bom')
  const [isDragging, setIsDragging] = useState(false)

  const parsed = useMemo(() => {
    if (!rawBytes) return null
    return decodeAndParseCsvBytes(
      rawBytes,
      sourceEncoding,
      delimiterMode === 'AUTO' ? undefined : delimiterMode
    )
  }, [rawBytes, sourceEncoding, delimiterMode])

  const transformedRows = useMemo(() => {
    if (!parsed) return []
    return transformCsvRows(parsed.rows, columnActions)
  }, [parsed, columnActions])

  const handleLoadBytes = (bytes: Uint8Array, name: string) => {
    setRawBytes(bytes)
    setFileName(name)
    setSourceEncoding('AUTO')
    const initial = decodeAndParseCsvBytes(bytes, 'AUTO')
    setColumnActions(initial.headers.map(() => 'keep'))
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    handleLoadBytes(new Uint8Array(buffer), file.name)
    e.target.value = ''
  }

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    handleLoadBytes(new Uint8Array(buffer), file.name)
  }

  const handleLoadSample = () => {
    handleLoadBytes(createSampleShiftJisCsvBytes(), 'sample-shiftjis-customers.csv')
  }

  const handleColumnActionChange = (colIndex: number, action: ColumnAction) => {
    setColumnActions((prev) => {
      const next = [...prev]
      next[colIndex] = action
      return next
    })
  }

  const handleDownload = () => {
    if (!parsed || transformedRows.length === 0) return
    const { bytes, mimeType, extension } = encodeTransformedCsv(
      transformedRows,
      outputFormat
    )
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    const blob = new Blob([buffer], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const baseName = (fileName || 'converted').replace(/\.[^/.]+$/, '')
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}-fixed.${extension}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    setRawBytes(null)
    setFileName('')
    setColumnActions([])
  }

  const previewRows = transformedRows.slice(0, 51)

  return (
    <div className="space-y-5">
      {!parsed ? (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
            isDragging
              ? 'border-sky-400 bg-sky-50/70'
              : 'border-slate-300 bg-slate-50/60'
          }`}
        >
          <FileSpreadsheet className="mx-auto h-9 w-9 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-800">
            CSV / TSV ファイルをドロップ、または選択して変換
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
              <Upload className="h-4 w-4" />
              <span>CSV / TSVファイルを選択</span>
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              onClick={handleLoadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3.5 py-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Shift-JIS サンプルCSVを試す
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ファイル情報＆主要アクション */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <span className="truncate text-sm font-bold text-slate-900" title={fileName}>
                {fileName}
              </span>
              <span
                data-testid="csv-detected-encoding"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                判定: {parsed.detectedEncoding} / 適用: {parsed.appliedEncoding} ({parsed.totalRows}行)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                <span>別のファイル</span>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                閉じる
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800"
              >
                <Download className="h-3.5 w-3.5" />
                ダウンロード
              </button>
            </div>
          </div>

          {/* 変換オプション */}
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:grid-cols-3">
            <div>
              <label
                htmlFor="csv-source-encoding"
                className="block text-xs font-semibold text-slate-700"
              >
                入力文字コード
              </label>
              <select
                id="csv-source-encoding"
                value={sourceEncoding}
                onChange={(e) =>
                  setSourceEncoding(e.target.value as SupportedSourceEncoding)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
              >
                <option value="AUTO">自動判定 (AUTO)</option>
                <option value="SJIS">Shift-JIS (Excel旧形式)</option>
                <option value="UTF8">UTF-8</option>
                <option value="EUCJP">EUC-JP</option>
                <option value="JIS">JIS (ISO-2022-JP)</option>
                <option value="UTF16">UTF-16</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="csv-delimiter"
                className="block text-xs font-semibold text-slate-700"
              >
                区切り文字
              </label>
              <select
                id="csv-delimiter"
                value={delimiterMode}
                onChange={(e) =>
                  setDelimiterMode(e.target.value as 'AUTO' | ',' | '\t')
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
              >
                <option value="AUTO">自動判定 ({parsed.delimiter === '\t' ? 'TAB' : 'カンマ'})</option>
                <option value=",">カンマ (CSV)</option>
                <option value="	">タブ (TSV)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="csv-output-format"
                className="block text-xs font-semibold text-slate-700"
              >
                出力形式
              </label>
              <select
                id="csv-output-format"
                value={outputFormat}
                onChange={(e) =>
                  setOutputFormat(e.target.value as TargetOutputFormat)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
              >
                <option value="utf8-bom">UTF-8 (BOM付・Excel最適)</option>
                <option value="utf8">UTF-8 (BOMなし)</option>
                <option value="sjis">Shift-JIS</option>
                <option value="json">JSON配列</option>
              </select>
            </div>
          </div>

          {/* 列ごとのマスク・削除 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-xs font-bold text-slate-800">
              列ごとのマスク・削除
            </p>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {parsed.headers.map((header, idx) => (
                <div
                  key={`${header}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                >
                  <span className="truncate font-semibold text-slate-800" title={header}>
                    {header || `列 ${idx + 1}`}
                  </span>
                  <select
                    aria-label={`${header || `列 ${idx + 1}`}の扱い`}
                    value={columnActions[idx] || 'keep'}
                    onChange={(e) =>
                      handleColumnActionChange(idx, e.target.value as ColumnAction)
                    }
                    className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800"
                  >
                    <option value="keep">そのまま</option>
                    <option value="mask">マスク (***)</option>
                    <option value="drop">列を削除</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* プレビュー表 */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm">
              {previewRows[0] && (
                <thead className="bg-slate-50 font-bold text-slate-800">
                  <tr>
                    {previewRows[0].map((col, idx) => (
                      <th key={idx} className="whitespace-nowrap px-4 py-2.5">
                        {col || `列 ${idx + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody className="divide-y divide-slate-100">
                {previewRows.slice(1).map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="max-w-xs truncate whitespace-nowrap px-4 py-2 text-slate-700"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
