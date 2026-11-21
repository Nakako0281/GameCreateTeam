import { describe, expect, it } from 'vitest'
import {
  createSampleShiftJisCsvBytes,
  decodeAndParseCsvBytes,
  encodeTransformedCsv,
  parseDelimitedText,
  transformCsvRows,
} from '../csv-fixer'

describe('csv-fixer', () => {
  it('auto-detects and decodes Shift-JIS sample bytes cleanly into Japanese rows', () => {
    const sjisBytes = createSampleShiftJisCsvBytes()
    const parsed = decodeAndParseCsvBytes(sjisBytes, 'AUTO')

    expect(parsed.detectedEncoding).toBe('SJIS')
    expect(parsed.headers).toEqual([
      '顧客ID',
      '氏名',
      'メールアドレス',
      '部署名',
      '契約金額',
    ])
    expect(parsed.rows[1][1]).toBe('佐藤 花子')
    expect(parsed.totalRows).toBe(4)
  })

  it('parses RFC-4180 quoted commas, escaped quotes, and embedded newlines', () => {
    const raw =
      '項目,メモ\r\n"A, 1","改行を\n含む""引用""テスト"\r\nB2,通常値'
    const rows = parseDelimitedText(raw, ',')
    expect(rows).toEqual([
      ['項目', 'メモ'],
      ['A, 1', '改行を\n含む"引用"テスト'],
      ['B2', '通常値'],
    ])
  })

  it('masks and drops selected columns and encodes UTF-8 with BOM (0xEF 0xBB 0xBF)', () => {
    const rows = [
      ['ID', '氏名', 'メール', '金額'],
      ['1', '田中', 'tanaka@example.com', '5000'],
    ]
    const transformed = transformCsvRows(rows, ['keep', 'mask', 'drop', 'keep'])
    expect(transformed).toEqual([
      ['ID', '氏名', '金額'],
      ['1', '***', '5000'],
    ])

    const encoded = encodeTransformedCsv(transformed, 'utf8-bom')
    expect(encoded.bytes[0]).toBe(0xef)
    expect(encoded.bytes[1]).toBe(0xbb)
    expect(encoded.bytes[2]).toBe(0xbf)

    const decodedBack = decodeAndParseCsvBytes(encoded.bytes, 'AUTO')
    expect(decodedBack.detectedEncoding).toBe('UTF8_BOM')
    expect(decodedBack.rows).toEqual(transformed)
  })
})
