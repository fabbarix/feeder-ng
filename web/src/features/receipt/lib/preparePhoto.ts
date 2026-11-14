// A receipt photo, prepared with the shared image pipeline (ui ImageEditor's prepareImage): always re-encoded (camera metadata and
// location go, ADR 0018), JPEG, long edge at most RECEIPT_MAX_SIDE, at most RECEIPT_MAX_BYTES, as a data URL.
import type { ImageEdit } from '../../../ui/ImageEditor/lib/edit'
import { prepareImage, type ImageEngine, type PrepareOptions } from '../../../ui/ImageEditor/lib/prepare'
import { blobToDataUrl } from '../../../ui/ImagePicker/lib/imageUrl'

/** The most photos one read takes (recipeassistant.MaxPhotos). */
export const MAX_PHOTOS = 4
/** The server's per-photo limit (internal/imaging MaxBytes). */
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024
/** The long edge the read is made from (the Recipe Assistant's raw read size). */
export const RECEIPT_MAX_SIDE = 2576

export interface ReceiptPhoto {
  blob: Blob
  dataUrl: string
  width: number
  height: number
}

/**
 * Rejects with ImageEditorError: 'unreadable' when the browser cannot decode it, 'too_large' when no quality fits.
 * `edit` (turns and a crop in pixels of the turned picture) is applied first; without it the photo is only re-encoded.
 */
export async function prepareReceiptPhoto(file: Blob, engine: ImageEngine, edit?: ImageEdit): Promise<ReceiptPhoto> {
  // The output is always a JPEG, so a PNG is read as one (the decoder sniffs the bytes, not the type).
  const source = file.type === 'image/png' ? new Blob([file], { type: 'image/jpeg' }) : file
  const opts: PrepareOptions = { maxSide: RECEIPT_MAX_SIDE, maxBytes: RECEIPT_MAX_BYTES, forceEncode: true, ...(edit ? { turns: edit.turns, crop: edit.crop } : {}) }
  const out = await prepareImage(source, opts, engine)
  return { blob: out.blob, dataUrl: await blobToDataUrl(out.blob), width: out.width, height: out.height }
}
