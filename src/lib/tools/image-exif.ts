export interface ImageMetadataReport {
  format: 'JPEG' | 'PNG' | 'WEBP' | 'UNKNOWN'
  hasExif: boolean
  hasGpsTag: boolean
  hasXmpOrIptc: boolean
  hasPngTextChunks: boolean
  detectedTags: string[]
  riskLevel: 'high' | 'medium' | 'clean'
}

export type OutputImageMime = 'image/webp' | 'image/jpeg' | 'image/png'

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return ''
  let out = ''
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[offset + i])
  }
  return out
}

function readUInt16(
  bytes: Uint8Array,
  offset: number,
  littleEndian: boolean
): number {
  if (offset + 2 > bytes.length) return 0
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1]
}

function readUInt32(
  bytes: Uint8Array,
  offset: number,
  littleEndian: boolean
): number {
  if (offset + 4 > bytes.length) return 0
  return littleEndian
    ? (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
        0
    : ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
        0
}

function inspectTiffIfdForTags(
  bytes: Uint8Array,
  tiffStart: number
): { hasGps: boolean; extraTags: string[] } {
  const extraTags: string[] = []
  let hasGps = false
  if (tiffStart + 8 > bytes.length) return { hasGps, extraTags }

  const endianMarker = asciiAt(bytes, tiffStart, 2)
  if (endianMarker !== 'II' && endianMarker !== 'MM') {
    return { hasGps, extraTags }
  }
  const littleEndian = endianMarker === 'II'
  const ifdOffset = readUInt32(bytes, tiffStart + 4, littleEndian)
  const ifdPos = tiffStart + ifdOffset
  if (ifdPos + 2 > bytes.length) return { hasGps, extraTags }

  const entryCount = readUInt16(bytes, ifdPos, littleEndian)
  const maxEntries = Math.min(entryCount, 128)
  for (let i = 0; i < maxEntries; i++) {
    const entryOffset = ifdPos + 2 + i * 12
    if (entryOffset + 12 > bytes.length) break
    const tagId = readUInt16(bytes, entryOffset, littleEndian)
    if (tagId === 0x8825) {
      hasGps = true
      extraTags.push('GPS位置情報IFD (0x8825)')
    } else if (tagId === 0x010f) {
      extraTags.push('メーカー名 (Make)')
    } else if (tagId === 0x0110) {
      extraTags.push('端末・機種名 (Model)')
    } else if (tagId === 0x0132 || tagId === 0x9003) {
      extraTags.push('撮影日時 (DateTime)')
    }
  }

  return { hasGps, extraTags }
}

export function inspectImageMetadata(bytes: Uint8Array): ImageMetadataReport {
  const detectedTags: string[] = []
  let hasExif = false
  let hasGpsTag = false
  let hasXmpOrIptc = false
  let hasPngTextChunks = false

  // JPEG: FF D8
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break
      const marker = bytes[offset + 1]
      if (marker === 0xda || marker === 0xd9) break // SOS or EOI
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      const segLength = (bytes[offset + 2] << 8) | bytes[offset + 3]
      if (segLength < 2 || offset + 2 + segLength > bytes.length) break
      const dataStart = offset + 4

      if (marker === 0xe1) {
        if (asciiAt(bytes, dataStart, 6) === 'Exif\0\0') {
          hasExif = true
          detectedTags.push('JPEG EXIF (APP1)')
          const tiffResult = inspectTiffIfdForTags(bytes, dataStart + 6)
          if (tiffResult.hasGps) hasGpsTag = true
          for (const t of tiffResult.extraTags) {
            if (!detectedTags.includes(t)) detectedTags.push(t)
          }
        } else if (
          asciiAt(bytes, dataStart, 28) === 'http://ns.adobe.com/xap/1.0/'
        ) {
          hasXmpOrIptc = true
          detectedTags.push('Adobe XMP メタデータ')
        }
      } else if (marker === 0xed) {
        hasXmpOrIptc = true
        detectedTags.push('IPTC / Photoshop 情報 (APP13)')
      } else if (marker === 0xfe) {
        hasXmpOrIptc = true
        detectedTags.push('JPEG コメント (COM)')
      }

      offset += 2 + segLength
    }

    return {
      format: 'JPEG',
      hasExif,
      hasGpsTag,
      hasXmpOrIptc,
      hasPngTextChunks: false,
      detectedTags,
      riskLevel: hasGpsTag ? 'high' : hasExif || hasXmpOrIptc ? 'medium' : 'clean',
    }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    let offset = 8
    while (offset + 12 <= bytes.length) {
      const length = readUInt32(bytes, offset, false)
      const chunkType = asciiAt(bytes, offset + 4, 4)
      if (chunkType === 'eXIf') {
        hasExif = true
        detectedTags.push('PNG EXIF チャンク (eXIf)')
      } else if (
        chunkType === 'tEXt' ||
        chunkType === 'zTXt' ||
        chunkType === 'iTXt'
      ) {
        hasPngTextChunks = true
        detectedTags.push(`PNG テキストメタデータ (${chunkType})`)
      } else if (chunkType === 'tIME') {
        hasPngTextChunks = true
        detectedTags.push('PNG 最終更新時刻 (tIME)')
      }
      if (chunkType === 'IEND') break
      offset += 12 + length
    }

    return {
      format: 'PNG',
      hasExif,
      hasGpsTag: false,
      hasXmpOrIptc,
      hasPngTextChunks,
      detectedTags,
      riskLevel: hasExif || hasPngTextChunks ? 'medium' : 'clean',
    }
  }

  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 0, 4) === 'RIFF' &&
    asciiAt(bytes, 8, 4) === 'WEBP'
  ) {
    let offset = 12
    while (offset + 8 <= bytes.length) {
      const chunkId = asciiAt(bytes, offset, 4)
      const chunkSize = readUInt32(bytes, offset + 4, true)
      if (chunkId === 'EXIF') {
        hasExif = true
        detectedTags.push('WebP EXIF チャンク')
      } else if (chunkId === 'XMP ') {
        hasXmpOrIptc = true
        detectedTags.push('WebP XMP チャンク')
      }
      offset += 8 + chunkSize + (chunkSize % 2)
    }

    return {
      format: 'WEBP',
      hasExif,
      hasGpsTag: false,
      hasXmpOrIptc,
      hasPngTextChunks: false,
      detectedTags,
      riskLevel: hasExif || hasXmpOrIptc ? 'medium' : 'clean',
    }
  }

  return {
    format: 'UNKNOWN',
    hasExif: false,
    hasGpsTag: false,
    hasXmpOrIptc: false,
    hasPngTextChunks: false,
    detectedTags: [],
    riskLevel: 'clean',
  }
}

export function buildCleanedFilename(
  originalName: string,
  mimeType: OutputImageMime
): string {
  const base = originalName.replace(/\.[^/.]+$/, '') || 'image'
  const ext =
    mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : 'png'
  return `${base}-clean.${ext}`
}

export function calculateSavedBytesPercent(
  beforeBytes: number,
  afterBytes: number
): number {
  if (beforeBytes <= 0) return 0
  return Math.round(((beforeBytes - afterBytes) / beforeBytes) * 100)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
