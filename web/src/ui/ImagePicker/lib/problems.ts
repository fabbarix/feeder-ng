import { ApiError } from '../../../lib/http'
import { imagePickerStrings, tooLargeMessage } from '../strings'
import { ACCEPT_TYPES, MAX_UPLOAD_BYTES } from './limits'

/** Every way picking a picture can fail. The message for each is in ../strings.ts. */
export type ImageProblemCode =
  | 'unsupported' // not JPEG, PNG, WebP or HEIC/HEIF
  | 'too_large' // over the byte limit
  | 'too_many_pixels'
  | 'empty'
  | 'crop_unavailable' // the stored picture could not be loaded for cropping
  | 'unreadable' // the browser cannot decode it (corrupt; HEIC in raw mode on a browser without HEIC support)
  | 'link_empty'
  | 'link_invalid' // not https, credentials, not a URL
  | 'link_blocked' // the server refused a private address
  | 'link_unreachable'
  | 'clipboard_empty'
  | 'clipboard_denied'
  | 'clipboard_unsupported'
  | 'camera_failed'
  | 'offline'
  | 'failed'

export class ImageProblemError extends Error {
  readonly code: ImageProblemCode
  constructor(code: ImageProblemCode) {
    super(code)
    this.name = 'ImageProblemError'
    this.code = code
  }
}

const HEIC_NAME = /\.hei[cf]$/i

/** unsupported for a type outside JPEG/PNG/WebP/HEIC/HEIF (a file with no type but a .heic/.heif name is HEIC), empty for size 0, too_large above maxBytes; null when fine. */
export function checkImageFile(file: { type: string; size: number; name?: string }, maxBytes: number = MAX_UPLOAD_BYTES): ImageProblemCode | null {
  const type = file.type.toLowerCase()
  const known = (ACCEPT_TYPES as readonly string[]).includes(type) || (type === '' && HEIC_NAME.test(file.name ?? ''))
  if (!known) return 'unsupported'
  if (file.size === 0) return 'empty'
  if (file.size > maxBytes) return 'too_large'
  return null
}

const API_CODES: Record<string, ImageProblemCode> = {
  image_too_large: 'too_large',
  image_too_large_pixels: 'too_many_pixels',
  unsupported_image: 'unsupported',
  image_url_invalid: 'link_invalid',
  image_url_blocked: 'link_blocked',
  image_url_unreachable: 'link_unreachable',
  network: 'offline',
  timeout: 'offline',
}

/** ImageProblemError -> its code; ApiError with an image code -> the matching code; network or timeout -> offline; anything else -> failed. */
export function problemFromError(err: unknown): ImageProblemCode {
  if (err instanceof ImageProblemError) return err.code
  if (err instanceof ApiError) return API_CODES[err.code] ?? 'failed'
  return 'failed'
}

/** The user-facing sentence for a code (strings.problems). `too_large` names the actual limit in MB (default 8). */
export function problemMessage(code: ImageProblemCode, maxBytes: number = MAX_UPLOAD_BYTES): string {
  return code === 'too_large' ? tooLargeMessage(maxBytes) : imagePickerStrings.problems[code]
}
