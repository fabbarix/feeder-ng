import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ImageApi, ImageOrigin, StoredImage } from '../types'
import type { Rect } from '../lib/crop'
import { blobToDataUrl, parseImageLink } from '../lib/imageUrl'
import { MAX_UPLOAD_BYTES, UPLOAD_MAX_SIDE } from '../lib/limits'
import { prepareImage, type ImageEngine, type Turns } from '../lib/prepare'
import { checkImageFile, ImageProblemError, problemFromError, type ImageProblemCode } from '../lib/problems'

/** 'converting' is the upload of a HEIC/HEIF, which the server converts to WebP (it can take seconds). */
export type IngestPhase = 'idle' | 'preparing' | 'uploading' | 'converting' | 'downloading'

export interface UseImageIngestOptions {
  api: ImageApi
  engine: ImageEngine
  /** Called with the stored image id once the server has the picture. */
  onStored: (id: string) => void
  maxBytes?: number // default MAX_UPLOAD_BYTES
  maxSide?: number // default UPLOAD_MAX_SIDE
}

export interface UseImageIngest {
  phase: IngestPhase
  busy: boolean
  problem: ImageProblemCode | null
  /** Check (type, size), prepare (orient, shrink, maybe re-encode; `turns` rotates), upload, then onStored. A newer call supersedes an older one: the late result is ignored and its stored image is discarded. */
  ingestBlob(blob: Blob, origin: ImageOrigin, opts?: { turns?: 0 | 1 | 2 | 3; crop?: Rect }): Promise<void>
  /** Validates the link, then POST /api/images/from-url (the server downloads it). */
  ingestLink(text: string): Promise<void>
  /** Aborts the request in flight; nothing is reported. */
  cancel(): void
  setProblem(code: ImageProblemCode | null): void
  /** Ids this hook uploaded (and has not discarded); the picker discards only these when the user replaces or removes. */
  isOwned(id: string): boolean
  /** Discards an id this hook uploaded (best effort); a no-op for other ids. */
  discardOwned(id: string): void
}

const HEIC_TYPE = /^image\/hei[cf]$/i
const HEIC_NAME = /\.hei[cf]$/i

/** The type a HEIC/HEIF blob is declared as, or null for other pictures. A HEIC with no type is known by its name. */
function heicType(blob: Blob & { name?: string }): string | null {
  if (HEIC_TYPE.test(blob.type)) return blob.type.toLowerCase()
  return blob.type === '' && HEIC_NAME.test(blob.name ?? '') ? 'image/heic' : null
}

/** The upload-mode pipeline (no UI): check, prepare, send, report; one pick at a time, the newest wins. */
export function useImageIngest(options: UseImageIngestOptions): UseImageIngest {
  const latest = useRef(options)
  latest.current = options
  const [phase, setPhase] = useState<IngestPhase>('idle')
  const [problem, setProblem] = useState<ImageProblemCode | null>(null)
  const token = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const owned = useRef(new Set<string>())

  useEffect(
    () => () => {
      token.current++
      controller.current?.abort()
    },
    [],
  )

  /** Runs one pick: `run` prepares and sends. A pick that is no longer the newest is dropped and what it stored is discarded. */
  const start = useCallback(async (first: IngestPhase, run: (signal: AbortSignal, enter: (p: IngestPhase) => void) => Promise<StoredImage>) => {
    const mine = ++token.current
    const ctl = new AbortController()
    controller.current = ctl
    const current = () => token.current === mine
    setProblem(null)
    setPhase(first)
    try {
      const out = await run(ctl.signal, (p) => current() && setPhase(p))
      if (!current()) {
        void latest.current.api.discard(out.id)
        return
      }
      owned.current.add(out.id)
      // The controls are enabled again before the host hears about the new picture, so it can move focus back to them.
      flushSync(() => {
        setPhase('idle')
        latest.current.onStored(out.id)
      })
    } catch (err) {
      if (!current()) return
      setPhase('idle')
      setProblem(problemFromError(err))
    }
  }, [])

  const ingestBlob = useCallback<UseImageIngest['ingestBlob']>(
    async (blob, origin, opts) => {
      const { api, engine } = latest.current
      const maxBytes = latest.current.maxBytes ?? MAX_UPLOAD_BYTES
      const maxSide = latest.current.maxSide ?? UPLOAD_MAX_SIDE
      const named = blob as Blob & { name?: string }
      const refusal = checkImageFile({ type: blob.type, size: blob.size, name: named.name }, maxBytes)
      if (refusal) {
        ++token.current
        setPhase('idle')
        setProblem(refusal)
        return
      }
      const heic = heicType(named)
      await start('preparing', async (signal, enter) => {
        let dataUrl: string
        if (heic) {
          // Most browsers cannot decode HEIC: the bytes go to the server untouched, which converts them to WebP.
          dataUrl = await blobToDataUrl(blob.type === heic ? blob : new Blob([blob], { type: heic }))
        } else {
          const prepared = await prepareImage(
            blob,
            { maxSide, maxBytes, turns: (opts?.turns ?? 0) as Turns, crop: opts?.crop, forceEncode: origin === 'camera' },
            engine,
          )
          dataUrl = await blobToDataUrl(prepared.blob)
        }
        if (signal.aborted) throw new ImageProblemError('failed')
        enter(heic ? 'converting' : 'uploading')
        return api.uploadDataUrl(dataUrl, { signal })
      })
    },
    [start],
  )

  const ingestLink = useCallback<UseImageIngest['ingestLink']>(
    async (text) => {
      const parsed = parseImageLink(text)
      if (!parsed.ok) {
        ++token.current
        setPhase('idle')
        setProblem(parsed.code)
        return
      }
      if (parsed.kind === 'data') return ingestBlob(parsed.blob, 'paste')
      await start('downloading', (signal) => latest.current.api.ingestUrl(parsed.url, { signal }))
    },
    [ingestBlob, start],
  )

  const cancel = useCallback(() => {
    token.current++
    controller.current?.abort()
    setPhase('idle')
  }, [])

  const isOwned = useCallback((id: string) => owned.current.has(id), [])

  const discardOwned = useCallback((id: string) => {
    if (!owned.current.delete(id)) return
    void latest.current.api.discard(id)
  }, [])

  return { phase, busy: phase !== 'idle', problem, ingestBlob, ingestLink, cancel, setProblem, isOwned, discardOwned }
}
