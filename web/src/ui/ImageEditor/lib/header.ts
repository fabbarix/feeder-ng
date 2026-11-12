// Stub (test-first step): the implementation follows the tests. See docs/dev/design/photo-read.md section 3.1.
export interface HeaderSize {
  format: 'jpeg' | 'png' | 'webp'
  width: number
  height: number
}

export function readHeaderSize(_bytes: Uint8Array): HeaderSize | null {
  throw new Error('not implemented')
}
export function readPngSize(_bytes: Uint8Array): { width: number; height: number } | null {
  throw new Error('not implemented')
}
export function readWebpSize(_bytes: Uint8Array): { width: number; height: number } | null {
  throw new Error('not implemented')
}
