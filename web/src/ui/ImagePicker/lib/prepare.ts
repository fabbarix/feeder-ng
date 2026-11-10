import type { ImageProblemCode } from './problems'

export type Turns = 0 | 1 | 2 | 3

/** A decoded picture, EXIF orientation already applied (createImageBitmap imageOrientation: 'from-image'). */
export interface DecodedImage {
  width: number
  height: number
  close(): void
}

/** The browser's decode/encode, injected so the pure rules below are testable in jsdom (which has no canvas). */
export interface ImageEngine {
  /** Rejects when the browser cannot decode the blob (HEIC, corrupt). */
  decode(blob: Blob): Promise<DecodedImage>
  /** Draws the picture rotated `turns` quarter turns clockwise into width x height (the already turned and scaled size) and encodes it. */
  encode(image: DecodedImage, o: { width: number; height: number; turns: Turns; type: 'image/jpeg' | 'image/png'; quality: number }): Promise<Blob>
}

export interface PrepareOptions {
  maxSide: number
  maxBytes: number
  turns?: Turns
  /** First JPEG quality tried, 0.9 by default; lowered in steps of 0.1 down to 0.6 while over maxBytes. */
  quality?: number
  /** Re-encode even when nothing needs to change (camera frames). */
  forceEncode?: boolean
}

export interface Prepared {
  blob: Blob
  width: number
  height: number
  type: string
  /** false when the original Blob is returned untouched. */
  reencoded: boolean
}

/** IP1 stub. The browser engine (createImageBitmap + OffscreenCanvas, canvas fallback). */
export const browserEngine: ImageEngine = {
  decode: () => Promise.reject(new Error('not implemented')),
  encode: () => Promise.reject(new Error('not implemented')),
}

/** IP1 stub. Largest size that fits max x max keeping the aspect ratio; never upscales; each side at least 1; rounds like internal/imaging ScaledSize. */
export function fitWithin(width: number, height: number, _max: number): { width: number; height: number } {
  return { width, height }
}

/** IP1 stub. (current + delta) modulo 4. */
export function addTurn(current: Turns, _delta: 1 | -1): Turns {
  return current
}

/** IP1 stub. The size after `turns` quarter turns: odd turns swap width and height. */
export function turnedSize(width: number, height: number, _turns: Turns): { width: number; height: number } {
  return { width, height }
}

/**
 * IP1 stub. decode (failure -> ImageProblemError('unreadable')); target = fitWithin(turnedSize(...), maxSide).
 * Returns the ORIGINAL blob (reencoded false) when turns is 0, forceEncode is not set, the size does not change and blob.size <= maxBytes.
 * Otherwise encodes: PNG stays PNG, everything else becomes JPEG; while the result exceeds maxBytes lowers JPEG quality 0.9 -> 0.6 in 0.1 steps
 * (a PNG that is too big is retried as JPEG); still too big -> ImageProblemError('too_large'). The decoded image is always closed.
 */
export async function prepareImage(blob: Blob, _opts: PrepareOptions, _engine: ImageEngine): Promise<Prepared> {
  return { blob, width: 0, height: 0, type: blob.type, reencoded: false }
}

export type { ImageProblemCode }
