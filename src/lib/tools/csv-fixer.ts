import Encoding from 'encoding-japanese'

export type SupportedSourceEncoding =
  | 'AUTO'
  | 'SJIS'
  | 'UTF8'
  | 'EUCJP'
  | 'JIS'
  | 'UTF16'

export type TargetOutputFormat = 'utf8-bom' | 'utf8' | 'sjis' | 'json'

export type ColumnAction = 'keep' | 'mask' | 'drop'

export interface DecodedCsvResult {
  detectedEncoding: string
  appliedEncoding: string
  delimiter: ',' | '\t'
  rows: string[][]
  headers: string[]
  totalRows: number
}

export function detectBytesEncoding(bytes: Uint8Array): string {
  if (bytes.length === 0) return 'UTF8'
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return 'UTF8_BOM'
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'UTF16LE'
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'UTF16BE'
  }
  const detected = Encoding.detect(bytes)
  return detected || 'UTF8'
}

export function decodeBytesToText(
  bytes: Uint8Array,
  sourceEncoding: SupportedSourceEncoding = 'AUTO'
): { text: string; detectedEncoding: string; appliedEncoding: string } {
  const detectedEncoding = detectBytesEncoding(bytes)
  const resolved =
    sourceEncoding === 'AUTO'
      ? detectedEncoding === 'UTF8_BOM'
        ? 'UTF8'
        : detectedEncoding === 'BINARY'
          ? 'SJIS'
          : detectedEncoding
      : sourceEncoding

  let slice = bytes
  if (resolved === 'UTF8' && detectedEncoding === 'UTF8_BOM') {
    slice = bytes.subarray(3)
  }

  if (resolved === 'UTF8' || resolved === 'ASCII') {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    return {
      text: decoder.decode(slice),
      detectedEncoding,
      appliedEncoding: resolved,
    }
  }

  if (resolved === 'UTF16' || resolved === 'UTF16LE' || resolved === 'UTF16BE') {
    const encName = resolved === 'UTF16BE' ? 'utf-16be' : 'utf-16le'
    const cleanSlice =
      detectedEncoding === 'UTF16LE' || detectedEncoding === 'UTF16BE'
        ? bytes.subarray(2)
        : bytes
    const decoder = new TextDecoder(encName, { fatal: false })
    return {
      text: decoder.decode(cleanSlice),
      detectedEncoding,
      appliedEncoding: resolved,
    }
  }

  const unicodeCodes = Encoding.convert(slice, {
    to: 'UNICODE',
    from: resolved as Encoding.EncodingType,
    type: 'array',
  }) as number[]

  return {
    text: Encoding.codeToString(unicodeCodes),
    detectedEncoding,
    appliedEncoding: resolved,
  }
}

export function inferDelimiter(text: string): ',' | '\t' {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const commaCount = (firstLine.match(/,/g) || []).length
  const tabCount = (firstLine.match(/\t/g) || []).length
  return tabCount > commaCount ? '\t' : ','
}

export function parseDelimitedText(
  text: string,
  delimiter: ',' | '\t' = ','
): string[][] {
  if (!text) return []
  const normalized = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    const next = normalized[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        currentField += ch
      }
      continue
    }

    if (ch === '"' && currentField.length === 0) {
      inQuotes = true
    } else if (ch === delimiter) {
      currentRow.push(currentField)
      currentField = ''
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentField)
      rows.push(currentRow)
      currentRow = []
      currentField = ''
      i += 1
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField)
      rows.push(currentRow)
      currentRow = []
      currentField = ''
    } else {
      currentField += ch
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export function decodeAndParseCsvBytes(
  bytes: Uint8Array,
  sourceEncoding: SupportedSourceEncoding = 'AUTO',
  forcedDelimiter?: ',' | '\t'
): DecodedCsvResult {
  const { text, detectedEncoding, appliedEncoding } = decodeBytesToText(
    bytes,
    sourceEncoding
  )
  const delimiter = forcedDelimiter ?? inferDelimiter(text)
  const rows = parseDelimitedText(text, delimiter)
  const headers = rows[0] ? [...rows[0]] : []
  return {
    detectedEncoding,
    appliedEncoding,
    delimiter,
    rows,
    headers,
    totalRows: rows.length,
  }
}

function maskCellValue(value: string): string {
  if (!value) return ''
  return '***'
}

export function transformCsvRows(
  rows: string[][],
  columnActions: ColumnAction[]
): string[][] {
  if (rows.length === 0) return []
  const maxCols = Math.max(...rows.map((r) => r.length), columnActions.length)

  return rows.map((row, rowIndex) => {
    const outRow: string[] = []
    for (let col = 0; col < maxCols; col++) {
      const action = columnActions[col] || 'keep'
      if (action === 'drop') continue
      const cell = row[col] ?? ''
      if (rowIndex === 0) {
        outRow.push(cell)
      } else if (action === 'mask') {
        outRow.push(maskCellValue(cell))
      } else {
        outRow.push(cell)
      }
    }
    return outRow
  })
}

function serializeCsvCell(cell: string): string {
  if (/[",\r\n\t]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

export function serializeCsvRows(rows: string[][]): string {
  return rows
    .map((row) => row.map(serializeCsvCell).join(','))
    .join('\r\n')
}

export function encodeTransformedCsv(
  rows: string[][],
  format: TargetOutputFormat
): { bytes: Uint8Array; mimeType: string; extension: string } {
  if (format === 'json') {
    const [headers = [], ...dataRows] = rows
    const objects = dataRows.map((r) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => {
        const key = h || `col_${idx + 1}`
        obj[key] = r[idx] ?? ''
      })
      return obj
    })
    const encoder = new TextEncoder()
    return {
      bytes: encoder.encode(JSON.stringify(objects, null, 2)),
      mimeType: 'application/json;charset=utf-8',
      extension: 'json',
    }
  }

  const csvText = serializeCsvRows(rows)

  if (format === 'sjis') {
    const codes = Encoding.stringToCode(csvText)
    const sjisArray = Encoding.convert(codes, {
      to: 'SJIS',
      from: 'UNICODE',
      type: 'array',
    }) as number[]
    return {
      bytes: new Uint8Array(sjisArray),
      mimeType: 'text/csv;charset=shift_jis',
      extension: 'csv',
    }
  }

  const encoder = new TextEncoder()
  const utf8Bytes = encoder.encode(csvText)
  if (format === 'utf8-bom') {
    const withBom = new Uint8Array(3 + utf8Bytes.length)
    withBom.set([0xef, 0xbb, 0xbf], 0)
    withBom.set(utf8Bytes, 3)
    return {
      bytes: withBom,
      mimeType: 'text/csv;charset=utf-8',
      extension: 'csv',
    }
  }

  return {
    bytes: utf8Bytes,
    mimeType: 'text/csv;charset=utf-8',
    extension: 'csv',
  }
}

export function createSampleShiftJisCsvBytes(): Uint8Array {
  const sampleText = [
    '顧客ID,氏名,メールアドレス,部署名,契約金額',
    'C-101,佐藤 花子,hanako@example.co.jp,営業企画部,480000',
    'C-102,鈴木 一郎,ichiro@example.co.jp,システム開発部,920000',
    'C-103,高橋 美咲,misaki@example.co.jp,人事総務部,350000',
  ].join('\r\n')
  const codes = Encoding.stringToCode(sampleText)
  const sjis = Encoding.convert(codes, {
    to: 'SJIS',
    from: 'UNICODE',
    type: 'array',
  }) as number[]
  return new Uint8Array(sjis)
}
