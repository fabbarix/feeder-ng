// React state of the new-Product sheet's Picture (SR5): pick, prepare, upload when online, and what Add needs (the id or the Blob).
import { useRef, useState } from 'react'
import { blobToDataUrl, type RawImage } from '../../../ui'
import type { PictureHandlers } from '../lib/newProductPicture'

export interface PictureState {
  /** the prepared Picture (offline: the Blob the queue keeps) */
  picture: RawImage | null
  /** online: the uploaded image id */
  imageId: string | null
  /** a data URL of the prepared Picture, for the preview */
  preview: string | null
  /** preparing or uploading: Add waits */
  busy: boolean
  /** the last file could not be used or uploaded */
  failed: boolean
}

const EMPTY: PictureState = { picture: null, imageId: null, preview: null, busy: false, failed: false }

export function useNewProductPicture(handlers: PictureHandlers, canUpload: boolean) {
  const [state, setState] = useState<PictureState>(EMPTY)
  // Only the latest pick may land: a Retake while an earlier one is still uploading drops the older answer.
  const latest = useRef(0)

  const pick = async (file: File) => {
    const mine = ++latest.current
    setState((s) => ({ ...s, busy: true, failed: false }))
    try {
      const picture = await handlers.prepare(file)
      const preview = picture.kind === 'blob' ? await blobToDataUrl(picture.blob) : picture.url
      if (mine !== latest.current) return
      if (!canUpload) {
        setState({ picture, imageId: null, preview, busy: false, failed: false })
        return
      }
      setState({ picture, imageId: null, preview, busy: true, failed: false })
      const imageId = await handlers.upload(picture)
      if (mine !== latest.current) return
      setState({ picture, imageId, preview, busy: false, failed: false })
    } catch {
      if (mine !== latest.current) return
      setState({ ...EMPTY, failed: true })
    }
  }

  return { ...state, pick }
}
