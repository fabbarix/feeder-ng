// Stub (test-first step): the implementation follows the tests. See docs/dev/design/photo-read.md sections 3.1, 3.5 and 8.
import type { Orientation } from './exif'
import type { DecodedImage, ImageEngine } from './prepare'

/** The upright working copy of a photo (always a JPEG). */
export interface Working {
  blob: Blob
  width: number
  height: number
  /** true when the original bytes are the working copy (keepOriginal). */
  kept: boolean
  /** The upright size of the decoded original, before any shrinking. */
  original: { width: number; height: number }
}

/** What the browser adapter draws for a working copy (a canvas in the real engine, a fake in tests). */
export interface WorkingDraw {
  width: number
  height: number
  /** Clockwise quarter turns, then a horizontal mirror when `mirror`; both from orientationOps, or 0/false when the browser already oriented. */
  turns: 0 | 1 | 2 | 3
  mirror: boolean
  type: 'image/jpeg'
  quality: number
  /** Transparency is drawn on this colour. */
  background: string
}

export interface ReadImageEngine extends ImageEngine {
  /** Decodes, applies EXIF once, and returns the working copy. Rejects with the decoder's error when it cannot decode, with TooManyPixelsError when over opts.maxPixels (nothing is drawn). */
  normalise(blob: Blob, opts?: { maxPixels?: number }): Promise<Working>
  /** True when the browser applies EXIF orientation when it decodes; probed once and cached. */
  browserOrients(): Promise<boolean>
  /** The first 128 KB of the blob. */
  readHead(blob: Blob): Promise<Uint8Array>
}

export class TooManyPixelsError extends Error {
  constructor() {
    super('too_many_pixels')
    this.name = 'TooManyPixelsError'
  }
}

export interface EngineDeps {
  /** decode and encode of the final render; the real one is prepare.ts's browserEngine. */
  base: ImageEngine
  /** Decodes with imageOrientation 'from-image'. Used by normalise and the probe. */
  decode: (blob: Blob) => Promise<DecodedImage>
  /** Draws `image` into a JPEG of the given size, turns and mirror. */
  drawWorking: (image: DecodedImage, o: WorkingDraw) => Promise<Blob>
  /** For tests: skip the probe. */
  browserOrients?: boolean
}

export const PROBE_JPEG_ORIENTATION: Orientation = 6

export function createImageEngine(_deps?: Partial<EngineDeps>): ReadImageEngine {
  const fail = (): never => {
    throw new Error('not implemented')
  }
  return { decode: fail, encode: fail, normalise: fail, browserOrients: fail, readHead: fail }
}

export const browserImageEngine: ReadImageEngine = createImageEngine()
