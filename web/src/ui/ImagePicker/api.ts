import { http } from '../../lib/http'
import type { ImageApi, StoredImage } from './types'

/** Default ImageApi: POST /api/images {dataUrl}, POST /api/images/from-url {url}, DELETE /api/images/{id} (errors swallowed), loadBlob = a same-origin fetch. */
export const imageApi: ImageApi = {
  uploadDataUrl: (dataUrl, opts) => http.post<StoredImage>('/api/images', { dataUrl }, opts),
  ingestUrl: (url, opts) => http.post<StoredImage>('/api/images/from-url', { url }, opts),
  discard: async (id) => {
    try {
      await http.delete(`/api/images/${id}`)
    } catch {
      // Best effort: 409 (in use), 404 and network errors all leave the nightly clean-up to do the job.
    }
  },
  loadBlob: async (url) => {
    const res = await globalThis.fetch(url, { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  },
}
