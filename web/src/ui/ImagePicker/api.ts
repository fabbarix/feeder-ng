import { http } from '../../lib/http'
import type { ImageApi, StoredImage } from './types'

/** IP1 stub. Default ImageApi: POST /api/images {dataUrl}, POST /api/images/from-url {url}, DELETE /api/images/{id} (errors swallowed), loadBlob = fetch(url, same-origin).blob(). */
export const imageApi: ImageApi = {
  uploadDataUrl: (_dataUrl, opts) => http.post<StoredImage>('/api/images', {}, opts),
  ingestUrl: (_url, opts) => http.post<StoredImage>('/api/images/from-url', {}, opts),
  discard: async () => {},
  loadBlob: () => Promise.reject(new Error('not implemented')),
}
