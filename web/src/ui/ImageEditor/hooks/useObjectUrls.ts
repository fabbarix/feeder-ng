// Object URL registry for the photo read: one URL per (key, blob), revoked on replace, release and unmount.
// See docs/dev/design/photo-read.md section 4.2.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface ObjectUrlApi {
  create: (blob: Blob) => string
  revoke: (url: string) => void
}
export interface ObjectUrls {
  urlFor: (key: string, blob: Blob) => string
  release: (key: string) => void
  releaseAll: () => void
}

interface Entry {
  blob: Blob
  url: string
}

const DEFAULT_API: ObjectUrlApi = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
}

/** `api` is read on mount only; the returned functions keep their identity for the life of the component. */
export function useObjectUrls(api?: ObjectUrlApi): ObjectUrls {
  const apiRef = useRef<ObjectUrlApi>(api ?? DEFAULT_API)
  const [entries] = useState(() => new Map<string, Entry>())

  const release = useCallback(
    (key: string) => {
      const entry = entries.get(key)
      if (!entry) return
      apiRef.current.revoke(entry.url)
      entries.delete(key)
    },
    [entries],
  )

  const releaseAll = useCallback(() => {
    for (const entry of entries.values()) apiRef.current.revoke(entry.url)
    entries.clear()
  }, [entries])

  const urlFor = useCallback(
    (key: string, blob: Blob) => {
      const current = entries.get(key)
      if (current && current.blob === blob) return current.url
      if (current) apiRef.current.revoke(current.url)
      const url = apiRef.current.create(blob)
      entries.set(key, { blob, url })
      return url
    },
    [entries],
  )

  useEffect(() => releaseAll, [releaseAll])

  return useMemo(() => ({ urlFor, release, releaseAll }), [urlFor, release, releaseAll])
}
