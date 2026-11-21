import { describe, expect, it } from 'vitest'
import {
  buildCleanedFilename,
  calculateSavedBytesPercent,
  inspectImageMetadata,
} from '../image-exif'

describe('image-exif', () => {
  it('detects JPEG EXIF APP1 and GPS IFD pointer tag (0x8825)', () => {
    const syntheticJpeg = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe1, // APP1
      0x00, 0x2c, // length 44
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF II* offset 8
      0x02, 0x00, // 2 IFD entries
      0x0f, 0x01, 0x02, 0x00, 0x04, 0x00, 0x00, 0x00, 0x54, 0x45, 0x53, 0x00, // Make
      0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // GPS IFD
      0x00, 0x00, 0x00, 0x00,
      0xff, 0xd9, // EOI
    ])

    const report = inspectImageMetadata(syntheticJpeg)
    expect(report.format).toBe('JPEG')
    expect(report.hasExif).toBe(true)
    expect(report.hasGpsTag).toBe(true)
    expect(report.riskLevel).toBe('high')
    expect(report.detectedTags).toContain('JPEG EXIF (APP1)')
    expect(report.detectedTags).toContain('GPS位置情報IFD (0x8825)')
  })

  it('detects PNG tEXt and eXIf chunks and treats clean PNG as safe', () => {
    const pngWithText = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x04, // len 4
      0x74, 0x45, 0x58, 0x74, // "tEXt"
      0x41, 0x42, 0x00, 0x43, // payload
      0x00, 0x00, 0x00, 0x00, // CRC
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4e, 0x44, // "IEND"
      0x00, 0x00, 0x00, 0x00,
    ])
    const reportDirty = inspectImageMetadata(pngWithText)
    expect(reportDirty.format).toBe('PNG')
    expect(reportDirty.hasPngTextChunks).toBe(true)
    expect(reportDirty.riskLevel).toBe('medium')

    const cleanPng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4e, 0x44,
      0x00, 0x00, 0x00, 0x00,
    ])
    const reportClean = inspectImageMetadata(cleanPng)
    expect(reportClean.format).toBe('PNG')
    expect(reportClean.riskLevel).toBe('clean')
    expect(reportClean.detectedTags).toEqual([])
  })

  it('builds cleaned filenames and computes byte reduction percent', () => {
    expect(buildCleanedFilename('DSC_0123.JPG', 'image/webp')).toBe(
      'DSC_0123-clean.webp'
    )
    expect(buildCleanedFilename('shot.png', 'image/jpeg')).toBe('shot-clean.jpg')
    expect(calculateSavedBytesPercent(1000, 250)).toBe(75)
  })
})
