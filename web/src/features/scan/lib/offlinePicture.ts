// PPX: the Picture of an unknown-barcode form filled in while OFFLINE (docs/dev/design/ppx-product-picture-sync.md).
// The picker cannot upload offline, so it runs in raw mode with these limits and the scan queue keeps the downscaled Blob
// until the phone is back online. Plain TypeScript, no React.
import type { ImageSource } from '../../../ui'

/** Long edge in px: the server keeps pictures at 1600 px anyway (internal/imaging MaxSide), so a bigger Blob is wasted IndexedDB space. */
export const OFFLINE_PICTURE_MAX_SIDE = 1600
/** Byte limit of the stored Blob; the picker lowers the JPEG quality down to 0.6 to fit, then refuses ("too large"). */
export const OFFLINE_PICTURE_MAX_BYTES = 2 * 1024 * 1024
/** No "link": a link is fetched by the SERVER, which an offline phone cannot reach. */
export const OFFLINE_PICTURE_SOURCES: readonly ImageSource[] = ['file', 'paste', 'camera']
