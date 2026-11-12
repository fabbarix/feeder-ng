// Pure JPEG header reading: EXIF orientation and the stored frame size. See docs/dev/design/photo-read.md section 3.1.
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export interface JpegInfo {
  orientation: Orientation
  width?: number
  height?: number
}

/** Only the first 128 KB are scanned: APP segments and the first SOF always sit there. */
const SCAN_LIMIT = 131072

const EXIF_MAGIC = [0x45, 0x78, 0x69, 0x66, 0, 0] // "Exif\0\0"
const TAG_ORIENTATION = 0x0112
const TYPE_SHORT = 3

const at = (bytes: Uint8Array, i: number): number => bytes[i] ?? 0

/** Reads APP1 "Exif\0\0" (TIFF II or MM, IFD0 tag 0x0112 SHORT) and the first SOF from the first 128 KB. Bounds-checked; anything odd -> orientation 1, no size. Not a JPEG -> {orientation: 1}. */
export function readJpegInfo(bytes: Uint8Array): JpegInfo {
  const info: JpegInfo = { orientation: 1 }
  if (bytes.length < 4 || at(bytes, 0) !== 0xff || at(bytes, 1) !== 0xd8) return info

  const end = Math.min(bytes.length, SCAN_LIMIT)
  let pos = 2
  while (pos + 1 < end) {
    if (at(bytes, pos) !== 0xff) break
    const marker = at(bytes, pos + 1)
    if (marker === 0xff) {
      pos += 1 // fill byte
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break // EOI, or SOS: entropy-coded data follows
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2 // standalone marker, no length
      continue
    }
    if (pos + 4 > end) break
    const length = (at(bytes, pos + 2) << 8) | at(bytes, pos + 3)
    const segEnd = pos + 2 + length
    if (length < 2 || segEnd > end) break
    const dataStart = pos + 4

    if (marker === 0xe1 && info.orientation === 1) {
      info.orientation = exifOrientation(bytes, dataStart, segEnd)
    } else if (isSof(marker) && info.width === undefined) {
      const height = (at(bytes, dataStart + 1) << 8) | at(bytes, dataStart + 2)
      const width = (at(bytes, dataStart + 3) << 8) | at(bytes, dataStart + 4)
      if (segEnd - dataStart >= 5 && width > 0 && height > 0) {
        info.width = width
        info.height = height
      }
    }
    pos = segEnd
  }
  return info
}

/** SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC). */
function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

/** The orientation (1..8) of an APP1 segment whose data is [start, end), or 1 when it is not a usable Exif. */
function exifOrientation(bytes: Uint8Array, start: number, end: number): Orientation {
  if (end - start < EXIF_MAGIC.length + 8) return 1
  for (let i = 0; i < EXIF_MAGIC.length; i++) if (at(bytes, start + i) !== EXIF_MAGIC[i]) return 1

  const tiff = start + EXIF_MAGIC.length
  const le = at(bytes, tiff) === 0x49 && at(bytes, tiff + 1) === 0x49 // "II"
  const be = at(bytes, tiff) === 0x4d && at(bytes, tiff + 1) === 0x4d // "MM"
  if (!le && !be) return 1

  const u16 = (i: number): number => (le ? at(bytes, i) | (at(bytes, i + 1) << 8) : (at(bytes, i) << 8) | at(bytes, i + 1))
  const u32 = (i: number): number =>
    le
      ? (at(bytes, i) | (at(bytes, i + 1) << 8) | (at(bytes, i + 2) << 16) | (at(bytes, i + 3) << 24)) >>> 0
      : ((at(bytes, i) << 24) | (at(bytes, i + 1) << 16) | (at(bytes, i + 2) << 8) | at(bytes, i + 3)) >>> 0

  if (u16(tiff + 2) !== 42) return 1
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return 1
  const count = u16(ifd)
  if (ifd + 2 + count * 12 > end) return 1 // the entry table must lie inside the segment

  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (u16(entry) !== TAG_ORIENTATION) continue
    if (u16(entry + 2) !== TYPE_SHORT) return 1
    const value = u16(entry + 8)
    return value >= 1 && value <= 8 ? (value as Orientation) : 1
  }
  return 1
}

/** What to do to the STORED pixels to show them upright: `turns` clockwise quarter turns, then a horizontal mirror when `mirror`. */
export function orientationOps(o: Orientation): { turns: 0 | 1 | 2 | 3; mirror: boolean } {
  switch (o) {
    case 1:
      return { turns: 0, mirror: false }
    case 2:
      return { turns: 0, mirror: true }
    case 3:
      return { turns: 2, mirror: false }
    case 4:
      return { turns: 2, mirror: true }
    case 5:
      return { turns: 1, mirror: true }
    case 6:
      return { turns: 1, mirror: false }
    case 7:
      return { turns: 3, mirror: true }
    case 8:
      return { turns: 3, mirror: false }
  }
}

/** The upright size: width and height swapped for 5..8. */
export function orientedSize(width: number, height: number, o: Orientation): { width: number; height: number } {
  return o >= 5 ? { width: height, height: width } : { width, height }
}

/** True when the engine must apply `o` itself: only when the browser does not (probe) and o !== 1. */
export function needsManualOrientation(browserApplies: boolean, o: Orientation): boolean {
  return !browserApplies && o !== 1
}
