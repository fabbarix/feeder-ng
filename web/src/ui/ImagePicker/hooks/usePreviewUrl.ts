import { useEffect, useState } from 'react'
import type { ImagePickerDeps, RawImage } from '../types'

/** The `src` of the preview: a stored image's URL, a pasted link itself, or an object URL of a held Blob (revoked on change and unmount). */
export function usePreviewUrl(value: string | RawImage | null, objectUrls: ImagePickerDeps['objectUrls']): string {
  const blob = value && typeof value === 'object' && value.kind === 'blob' ? value.blob : null
  const [objectUrl, setObjectUrl] = useState('')
  const create = objectUrls.create
  const revoke = objectUrls.revoke
  useEffect(() => {
    if (!blob) {
      setObjectUrl('')
      return
    }
    const url = create(blob)
    setObjectUrl(url)
    return () => revoke(url)
  }, [blob, create, revoke])
  if (!value) return ''
  if (typeof value === 'string') return `/api/images/${value}`
  return value.kind === 'url' ? value.url : objectUrl
}
