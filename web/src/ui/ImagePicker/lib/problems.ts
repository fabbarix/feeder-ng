import { MAX_UPLOAD_BYTES } from './limits'

/** Every way picking a picture can fail. The message for each is in ../strings.ts. */
export type ImageProblemCode =
  | 'unsupported' // not JPEG, PNG, WebP or HEIC/HEIF
  | 'too_large' // over the byte limit
  | 'too_many_pixels'
  | 'empty'
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

/** IP1 stub. The Developer implements: unsupported for a type outside JPEG/PNG/WebP/HEIC/HEIF (a file with no type but a .heic/.heif name is HEIC), empty for size 0, too_large above maxBytes; null when fine. */
export function checkImageFile(_file: { type: string; size: number; name?: string }, _maxBytes: number = MAX_UPLOAD_BYTES): ImageProblemCode | null {
  return 'failed'
}

/** IP1 stub. ImageProblemError -> its code; ApiError image_too_large / image_too_large_pixels / unsupported_image / image_url_invalid / image_url_blocked / image_url_unreachable -> the matching code; ApiError network or timeout -> offline; anything else -> failed. */
export function problemFromError(_err: unknown): ImageProblemCode {
  return 'failed'
}

/** IP1 stub. The user-facing sentence for a code (strings.problems). `too_large` names the actual limit in MB (default 8). */
export function problemMessage(_code: ImageProblemCode, _maxBytes: number = MAX_UPLOAD_BYTES): string {
  return ''
}
