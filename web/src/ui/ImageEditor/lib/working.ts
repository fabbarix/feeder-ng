// Stub (test-first step). See docs/dev/design/photo-read.md section 3.5.
import type { Orientation } from './exif'

// TODO(T1): replace by `import type { Size } from './size'` once T1 has moved size.ts into ui/ImageEditor.
type Size = { width: number; height: number }

export const WORK_MAX_SIDE = 4096
export const WORK_MAX_AREA = 16_777_216
export const READ_MAX_SIDE = 2576
export const INPUT_MAX_BYTES = 30 * 1024 * 1024
export const INPUT_MAX_PIXELS = 50_000_000
export const KEEP_MAX_BYTES = 8 * 1024 * 1024
export const AS_IS_MAX_BYTES = 8 * 1024 * 1024

export function workingSize(_width: number, _height: number): Size {
  throw new Error('not implemented')
}
export function keepOriginal(_info: { type: string; orientation: Orientation; width: number; height: number; bytes: number }): boolean {
  throw new Error('not implemented')
}
