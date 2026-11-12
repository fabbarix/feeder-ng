// Pure image header sizes, read before decoding (the 50 MP check). See docs/dev/design/photo-read.md section 3.1.
import { readJpegInfo } from './exif'

export interface HeaderSize {
  format: 'jpeg' | 'png' | 'webp'
  width: number
  height: number
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const at = (bytes: Uint8Array, i: number): number => bytes[i] ?? 0
const u32be = (bytes: Uint8Array, i: number): number =>
  ((at(bytes, i) << 24) | (at(bytes, i + 1) << 16) | (at(bytes, i + 2) << 8) | at(bytes, i + 3)) >>> 0
const u16le = (bytes: Uint8Array, i: number): number => at(bytes, i) | (at(bytes, i + 1) << 8)
const u24le = (bytes: Uint8Array, i: number): number => at(bytes, i) | (at(bytes, i + 1) << 8) | (at(bytes, i + 2) << 16)
const u32le = (bytes: Uint8Array, i: number): number =>
  (at(bytes, i) | (at(bytes, i + 1) << 8) | (at(bytes, i + 2) << 16) | (at(bytes, i + 3) << 24)) >>> 0
const fourCC = (bytes: Uint8Array, i: number): string => String.fromCharCode(at(bytes, i), at(bytes, i + 1), at(bytes, i + 2), at(bytes, i + 3))

/** By magic bytes: JPEG (FF D8) -> readJpegInfo's SOF size; PNG -> readPngSize; RIFF....WEBP -> readWebpSize. null for anything else, truncated or odd. */
export function readHeaderSize(bytes: Uint8Array): HeaderSize | null {
  if (bytes.length >= 2 && at(bytes, 0) === 0xff && at(bytes, 1) === 0xd8) {
    const { width, height } = readJpegInfo(bytes)
    return width !== undefined && height !== undefined ? { format: 'jpeg', width, height } : null
  }
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => at(bytes, i) === b)) {
    const size = readPngSize(bytes)
    return size && { format: 'png', ...size }
  }
  if (fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') {
    const size = readWebpSize(bytes)
    return size && { format: 'webp', ...size }
  }
  return null
}

/** Signature 89 50 4E 47 0D 0A 1A 0A, then the first chunk must be "IHDR" (bytes 12..15): width = big-endian u32 at 16, height = big-endian u32 at 20. 0 -> null. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  if (!PNG_SIGNATURE.every((b, i) => at(bytes, i) === b)) return null
  if (fourCC(bytes, 12) !== 'IHDR') return null
  const width = u32be(bytes, 16)
  const height = u32be(bytes, 20)
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * "RIFF" at 0, "WEBP" at 8, the first chunk's FourCC at 12:
 *  "VP8 " (lossy): start code 9D 01 2A at 23..25; width = little-endian u16 at 26 & 0x3FFF, height = LE u16 at 28 & 0x3FFF.
 *  "VP8L" (lossless): signature 0x2F at 20; b = LE u32 at 21; width = (b & 0x3FFF) + 1, height = ((b >>> 14) & 0x3FFF) + 1.
 *  "VP8X" (extended): width = 1 + LE u24 at 24, height = 1 + LE u24 at 27 (the canvas size; may exceed 16,383).
 * Anything else or out of bounds -> null.
 */
export function readWebpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') return null
  const chunk = fourCC(bytes, 12)
  let width: number
  let height: number
  if (chunk === 'VP8 ') {
    if (bytes.length < 30 || at(bytes, 23) !== 0x9d || at(bytes, 24) !== 0x01 || at(bytes, 25) !== 0x2a) return null
    width = u16le(bytes, 26) & 0x3fff
    height = u16le(bytes, 28) & 0x3fff
  } else if (chunk === 'VP8L') {
    if (bytes.length < 25 || at(bytes, 20) !== 0x2f) return null
    const b = u32le(bytes, 21)
    width = (b & 0x3fff) + 1
    height = ((b >>> 14) & 0x3fff) + 1
  } else if (chunk === 'VP8X') {
    if (bytes.length < 30) return null
    width = 1 + u24le(bytes, 24)
    height = 1 + u24le(bytes, 27)
  } else {
    return null
  }
  return width > 0 && height > 0 ? { width, height } : null
}
