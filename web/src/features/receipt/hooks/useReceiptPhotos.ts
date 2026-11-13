// The receipt's photos, in memory only (never IndexedDB, ADR 0018): added from the camera or the library, prepared with the shared
// image pipeline, listed with a preview, removed, and turned into the read's body. Previews are revoked when removed and on unmount.
import { useCallback, useEffect, useRef, useState } from 'react'
import { browserEngine, ImageEditorError, type ImageEngine } from '../../../ui/ImageEditor/lib/prepare'
import { MAX_PHOTOS, prepareReceiptPhoto } from '../lib/preparePhoto'

export interface ReceiptPhotoItem {
  id: string
  previewUrl: string
  dataUrl: string
  width: number
  height: number
}

export type ReceiptPhotoProblem = 'photo_unsupported' | 'photo_too_large' | 'too_many_photos'

export interface UseReceiptPhotos {
  photos: ReceiptPhotoItem[]
  count: number
  /** Below the limit and not preparing a file. */
  canAdd: boolean
  /** Files are being prepared. */
  busy: boolean
  /** The last thing that went wrong, by code (the copy comes from receiptErrors). */
  problem?: ReceiptPhotoProblem
  add(files: File[]): Promise<void>
  remove(id: string): void
  clear(): void
  dismissProblem(): void
  /** The photos for the read, in order. */
  toBody(): { dataUrl: string }[]
}

export interface ReceiptPhotosDeps {
  engine?: ImageEngine
  objectUrls?: { create(blob: Blob): string; revoke(url: string): void }
}

const DEFAULT_URLS = {
  create: (blob: Blob) => URL.createObjectURL(blob),
  revoke: (url: string) => URL.revokeObjectURL(url),
}

export function useReceiptPhotos(deps: ReceiptPhotosDeps = {}): UseReceiptPhotos {
  const [env] = useState(() => ({ engine: deps.engine ?? browserEngine, urls: deps.objectUrls ?? DEFAULT_URLS }))
  const [photos, setPhotos] = useState<ReceiptPhotoItem[]>([])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<ReceiptPhotoProblem>()
  // The list and the preview URLs are mirrored in refs, so an add in progress sees the photos added before it.
  const list = useRef<ReceiptPhotoItem[]>([])
  const previews = useRef(new Map<string, string>())
  const seq = useRef(0)
  // False once the screen is left: an add still preparing a file then makes no preview URL that nothing would revoke.
  const alive = useRef(true)

  const commit = useCallback((next: ReceiptPhotoItem[]) => {
    list.current = next
    setPhotos(next)
  }, [])

  const add = useCallback(
    async (files: File[]) => {
      setBusy(true)
      setProblem(undefined)
      try {
        for (const file of files) {
          if (list.current.length >= MAX_PHOTOS) {
            setProblem('too_many_photos')
            break
          }
          try {
            const out = await prepareReceiptPhoto(file, env.engine)
            if (!alive.current) return
            const id = `receipt-photo-${++seq.current}`
            const previewUrl = env.urls.create(out.blob)
            previews.current.set(id, previewUrl)
            commit([...list.current, { id, previewUrl, dataUrl: out.dataUrl, width: out.width, height: out.height }])
          } catch (err) {
            setProblem(err instanceof ImageEditorError && err.code === 'too_large' ? 'photo_too_large' : 'photo_unsupported')
          }
        }
      } finally {
        if (alive.current) setBusy(false)
      }
    },
    [env, commit],
  )

  const remove = useCallback(
    (id: string) => {
      const url = previews.current.get(id)
      if (url !== undefined) {
        env.urls.revoke(url)
        previews.current.delete(id)
      }
      commit(list.current.filter((p) => p.id !== id))
    },
    [env, commit],
  )

  const clear = useCallback(() => {
    for (const url of previews.current.values()) env.urls.revoke(url)
    previews.current.clear()
    commit([])
  }, [env, commit])

  // Synchronous on unmount: the previews are never kept after the screen is left.
  useEffect(() => {
    const urls = previews.current
    alive.current = true
    return () => {
      alive.current = false
      for (const url of urls.values()) env.urls.revoke(url)
      urls.clear()
    }
  }, [env])

  return {
    photos,
    count: photos.length,
    canAdd: photos.length < MAX_PHOTOS && !busy,
    busy,
    problem,
    add,
    remove,
    clear,
    dismissProblem: useCallback(() => setProblem(undefined), []),
    toBody: useCallback(() => list.current.map((p) => ({ dataUrl: p.dataUrl })), []),
  }
}
