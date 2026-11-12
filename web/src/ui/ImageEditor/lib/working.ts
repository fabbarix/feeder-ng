// Pure limits and sizes of the photo read's working copy. See docs/dev/design/photo-read.md section 3.5.
import type { Orientation } from './exif'
import type { Size } from './crop'

export const WORK_MAX_SIDE = 4096
export const WORK_MAX_AREA = 16_777_216 // iOS Safari's canvas area limit
export const READ_MAX_SIDE = 2576 // = RAW_MAX_SIDE, the model's limit (server ModelMaxSide)
export const INPUT_MAX_BYTES = 30 * 1024 * 1024 // an original
export const INPUT_MAX_PIXELS = 50_000_000
export const KEEP_MAX_BYTES = 8 * 1024 * 1024 // an original kept byte for byte as the working copy
export const AS_IS_MAX_BYTES = 8 * 1024 * 1024 // a HEIC sent as it is (the server's per-photo limit)

/** The working size: fitWithin(WORK_MAX_SIDE), then shrunk further (keeping the aspect, rounding down) until w * h <= WORK_MAX_AREA. */
export function workingSize(width: number, height: number): Size {
  const long = Math.max(width, height)
  let scale = Math.min(1, WORK_MAX_SIDE / long)
  let w = Math.max(1, Math.round(width * scale))
  let h = Math.max(1, Math.round(height * scale))
  if (w * h > WORK_MAX_AREA) {
    scale = Math.sqrt(WORK_MAX_AREA / (w * h))
    w = Math.max(1, Math.floor(w * scale))
    h = Math.max(1, Math.floor(h * scale))
  }
  return { width: w, height: h }
}

/**
 * Keep the original bytes as the working copy? Exactly when
 *   type === 'image/jpeg' && orientation === 1 && bytes <= KEEP_MAX_BYTES && workingSize(width, height) equals {width, height}.
 * Any other orientation, any PNG or WebP, anything larger: a new JPEG working copy (D4).
 */
export function keepOriginal(info: { type: string; orientation: Orientation; width: number; height: number; bytes: number }): boolean {
  if (info.type !== 'image/jpeg' || info.orientation !== 1 || info.bytes > KEEP_MAX_BYTES) return false
  const fit = workingSize(info.width, info.height)
  return fit.width === info.width && fit.height === info.height
}
