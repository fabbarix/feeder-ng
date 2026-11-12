// Byte-array builders for the image header tests (no binary fixtures).
export const u16be = (n: number) => [(n >>> 8) & 255, n & 255]
export const u16le = (n: number) => [n & 255, (n >>> 8) & 255]
export const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
export const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
export const u24le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255]
export const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))
export const bytes = (...parts: number[][]) => new Uint8Array(parts.flat())

/** SOF segment: marker FF <m>, length 17, precision 8, height, width, 3 components. */
export function sof(marker: number, width: number, height: number): number[] {
  return [0xff, marker, ...u16be(17), 8, ...u16be(height), ...u16be(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
}

export interface ExifOptions {
  little?: boolean
  value?: number // the orientation value
  type?: number // TIFF field type of tag 0x0112 (3 = SHORT)
  tag?: number
  count?: number // the declared IFD0 entry count
  noEntries?: boolean // IFD0 with count 0
  otherEntryFirst?: boolean // a different tag precedes the orientation entry
  magic?: string // 'Exif\0\0' by default
}

/** An APP1 segment (marker included) carrying a TIFF with one orientation entry. */
export function app1Exif(o: ExifOptions = {}): number[] {
  const le = o.little ?? false
  const u16 = le ? u16le : u16be
  const u32 = le ? u32le : u32be
  const entry = (tag: number, type: number, value: number) => [...u16(tag), ...u16(type), ...u32(1), ...u16(value), 0, 0]
  const entries = o.noEntries ? [] : [...(o.otherEntryFirst ? entry(0x0100, 3, 640) : []), ...entry(o.tag ?? 0x0112, o.type ?? 3, o.value ?? 1)]
  const declared = o.count ?? (o.noEntries ? 0 : entries.length / 12)
  const tiff = [...ascii(le ? 'II' : 'MM'), ...u16(42), ...u32(8), ...u16(declared), ...entries, ...u32(0)]
  const body = [...ascii(o.magic ?? 'Exif'), ...(o.magic ? [] : [0, 0]), ...tiff]
  return [0xff, 0xe1, ...u16be(body.length + 2), ...body]
}

/** SOI + segments + EOI. */
export const jpeg = (...segments: number[][]) => bytes([0xff, 0xd8], ...segments, [0xff, 0xd9])
