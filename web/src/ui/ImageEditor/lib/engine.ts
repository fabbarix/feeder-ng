// The read's image engine: decode for the probe and intake, the working copy, and the encode of the final render.
// See docs/dev/design/photo-read.md sections 3.1, 3.5 and 8. The browser adapter lives here; the rules are in the pure libs.
import { needsManualOrientation, orientationOps, orientedSize, readJpegInfo, type Orientation } from './exif'
import { browserEngine, makeCanvas, type DecodedImage, type ImageEngine } from './prepare'
import { keepOriginal, workingSize } from './working'

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

/**
 * The probe image: a 2 x 1 px baseline JPEG with EXIF orientation 6 (APP1 Exif, IFD0 tag 0x0112 = 6).
 * Made once with Pillow (2 x 1 white RGB, quality 90, that EXIF tag) and embedded here, so nothing is generated at build or test time.
 * A browser that applies EXIF decodes it as 1 x 2; one that does not decodes it as 2 x 1.
 */
const PROBE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q=='

/** The first 128 KB: enough for every header the read checks (section 3.1). */
const HEAD_BYTES = 131072

function readArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

const browserDecode = (blob: Blob): Promise<DecodedImage> => createImageBitmap(blob, { imageOrientation: 'from-image' })

/** Draws the decoded picture upright into a JPEG of `o.width` x `o.height`: the turns and mirror of `o` rotate it about the centre, then it fills the box. */
async function browserDrawWorking(image: DecodedImage, o: WorkingDraw): Promise<Blob> {
  const bitmap = image as unknown as ImageBitmap
  const { canvas, ctx, toBlob } = makeCanvas(o.width, o.height)
  try {
    ctx.fillStyle = o.background
    ctx.fillRect(0, 0, o.width, o.height)
    ctx.imageSmoothingQuality = 'high'
    const quarter = o.turns % 2 === 1
    const boxW = quarter ? o.height : o.width
    const boxH = quarter ? o.width : o.height
    ctx.translate(o.width / 2, o.height / 2)
    if (o.mirror) ctx.scale(-1, 1)
    ctx.rotate((o.turns * Math.PI) / 2)
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, -boxW / 2, -boxH / 2, boxW, boxH)
    return await toBlob(o.type, o.quality)
  } finally {
    canvas.width = 0 // release the backing store (section 8)
    canvas.height = 0
  }
}

export function createImageEngine(deps?: Partial<EngineDeps>): ReadImageEngine {
  const base = deps?.base ?? browserEngine
  const decode = deps?.decode ?? browserDecode
  const drawWorking = deps?.drawWorking ?? browserDrawWorking
  let orients: Promise<boolean> | undefined

  const probe = async (): Promise<boolean> => {
    try {
      const image = await decode(new Blob([Uint8Array.from(atob(PROBE_JPEG_BASE64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }))
      try {
        return image.width === 1 && image.height === 2
      } finally {
        image.close()
      }
    } catch {
      return false
    }
  }

  const browserOrients = (): Promise<boolean> => {
    if (deps?.browserOrients !== undefined) return Promise.resolve(deps.browserOrients)
    orients ??= probe()
    return orients
  }

  const readHead = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await readArrayBuffer(blob.slice(0, HEAD_BYTES)))

  const normalise = async (blob: Blob, opts: { maxPixels?: number } = {}): Promise<Working> => {
    const applies = await browserOrients()
    const { orientation } = readJpegInfo(await readHead(blob))
    const image = await decode(blob)
    try {
      if (opts.maxPixels !== undefined && image.width * image.height > opts.maxPixels) throw new TooManyPixelsError()
      // The browser's decode already turned the picture when it applies EXIF; otherwise the stored size is turned here.
      const manual = needsManualOrientation(applies, orientation)
      const original = manual ? orientedSize(image.width, image.height, orientation) : { width: image.width, height: image.height }
      if (keepOriginal({ type: blob.type, orientation, width: original.width, height: original.height, bytes: blob.size })) {
        return { blob, width: original.width, height: original.height, kept: true, original }
      }
      const size = workingSize(original.width, original.height)
      const ops = manual ? orientationOps(orientation) : { turns: 0 as const, mirror: false }
      const out = await drawWorking(image, {
        width: size.width,
        height: size.height,
        turns: ops.turns,
        mirror: ops.mirror,
        type: 'image/jpeg',
        quality: 0.92,
        background: '#fff',
      })
      return { blob: out, width: size.width, height: size.height, kept: false, original }
    } finally {
      image.close()
    }
  }

  return {
    decode: (blob) => base.decode(blob),
    encode: (image, o) => base.encode(image, o),
    normalise,
    browserOrients,
    readHead,
  }
}

export const browserImageEngine: ReadImageEngine = createImageEngine()
