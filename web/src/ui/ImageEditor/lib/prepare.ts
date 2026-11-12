import { clampRect, isFullImage, outputSize, rectInSource, type Rect } from './crop'
import { fitWithin } from './size'
import { addTurn, turnedSize, type Turns } from './turns'

export const DEFAULT_QUALITY = 0.9

/** What the editor's pipeline throws (ui/ImageEditor never imports the picker's ImageProblemError). */
export class ImageEditorError extends Error {
  readonly code: 'unreadable' | 'too_large'
  constructor(code: 'unreadable' | 'too_large') {
    super(code)
    this.name = 'ImageEditorError'
    this.code = code
  }
}

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
  encode(
    image: DecodedImage,
    o: {
      /** The output size. */
      width: number
      height: number
      turns: Turns
      /** Optional crop, in pixels of the TURNED picture; the output shows only that area, scaled to width x height. */
      crop?: Rect
      type: 'image/jpeg' | 'image/png'
      quality: number
    },
  ): Promise<Blob>
}

export interface PrepareOptions {
  maxSide: number
  maxBytes: number
  turns?: Turns
  /** Keep only this area (turned-image pixels; clamped to the picture). The long edge of the OUTPUT is limited to maxSide. A crop that is the whole picture is no crop. */
  crop?: Rect
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

export { fitWithin }

export { addTurn, turnedSize }
export type { Turns }

const isHeic = (type: string) => /^image\/hei[cf]$/i.test(type)

/**
 * Decodes (failure -> ImageEditorError('unreadable')); target = the crop (or the whole turned picture) fitted to maxSide.
 * Returns the ORIGINAL blob (reencoded false) when nothing turns, crops or shrinks, forceEncode is not set, it is not HEIC and blob.size <= maxBytes.
 * Otherwise encodes: PNG stays PNG, everything else becomes JPEG; while the result exceeds maxBytes lowers JPEG quality 0.9 -> 0.6 in 0.1 steps
 * (a PNG that is too big is retried as JPEG); still too big -> ImageEditorError('too_large'). The decoded image is always closed.
 */
export async function prepareImage(blob: Blob, opts: PrepareOptions, engine: ImageEngine): Promise<Prepared> {
  let image: DecodedImage
  try {
    image = await engine.decode(blob)
  } catch {
    throw new ImageEditorError('unreadable')
  }
  try {
    const turns = opts.turns ?? 0
    const turned = turnedSize(image.width, image.height, turns)
    const crop = opts.crop ? clampRect(opts.crop, turned) : undefined
    // A crop that is the whole picture changes nothing: it is passed on (the engine draws the same area) but does not force a re-encode.
    const cropped = crop !== undefined && !isFullImage(crop, turned)
    const target = outputSize(crop ?? { x: 0, y: 0, ...turned }, opts.maxSide)
    const resized = target.width !== turned.width || target.height !== turned.height
    const untouched = turns === 0 && !cropped && !resized && !opts.forceEncode && !isHeic(blob.type)
    if (untouched && blob.size <= opts.maxBytes) {
      return { blob, width: target.width, height: target.height, type: blob.type, reencoded: false }
    }
    const encode = (type: 'image/jpeg' | 'image/png', quality: number) =>
      engine.encode(image, { width: target.width, height: target.height, turns, ...(crop ? { crop } : {}), type, quality })
    const done = (out: Blob, type: string): Prepared => ({ blob: out, width: target.width, height: target.height, type, reencoded: true })
    const first = opts.quality ?? DEFAULT_QUALITY
    if (blob.type === 'image/png') {
      const png = await encode('image/png', first)
      if (png.size <= opts.maxBytes) return done(png, 'image/png')
    }
    for (let q = first; q >= 0.6 - 1e-9; q -= 0.1) {
      const jpeg = await encode('image/jpeg', Math.round(q * 10) / 10)
      if (jpeg.size <= opts.maxBytes) return done(jpeg, 'image/jpeg')
    }
    throw new ImageEditorError('too_large')
  } finally {
    image.close()
  }
}

type Canvas2D = {
  canvas: { width: number; height: number }
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  toBlob(type: string, quality: number): Promise<Blob>
}

export function makeCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    return { canvas, ctx, toBlob: (type, quality) => canvas.convertToBlob({ type, quality }) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  return {
    canvas,
    ctx,
    toBlob: (type, quality) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality)),
  }
}

/** The browser engine: createImageBitmap (EXIF orientation applied) + OffscreenCanvas, or a canvas element. */
export const browserEngine: ImageEngine = {
  async decode(blob) {
    return createImageBitmap(blob, { imageOrientation: 'from-image' })
  },
  async encode(image, o) {
    const bitmap = image as unknown as ImageBitmap
    const { ctx, toBlob } = makeCanvas(o.width, o.height)
    if (o.type === 'image/jpeg') {
      ctx.fillStyle = '#fff' // JPEG has no transparency
      ctx.fillRect(0, 0, o.width, o.height)
    }
    ctx.imageSmoothingQuality = 'high'
    const turned = turnedSize(bitmap.width, bitmap.height, o.turns)
    const area = o.crop ?? { x: 0, y: 0, ...turned }
    const src = rectInSource(area, o.turns, bitmap.width, bitmap.height)
    // Rotate about the centre of the output, then draw the source area into the un-rotated destination box.
    const odd = o.turns % 2 === 1
    const dw = odd ? o.height : o.width
    const dh = odd ? o.width : o.height
    ctx.translate(o.width / 2, o.height / 2)
    ctx.rotate((o.turns * Math.PI) / 2)
    ctx.drawImage(bitmap, src.x, src.y, src.width, src.height, -dw / 2, -dh / 2, dw, dh)
    return toBlob(o.type, o.quality)
  },
}
