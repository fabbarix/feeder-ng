import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Rect } from '../lib/crop'
import { blobToDataUrl, parseImageLink } from '../lib/imageUrl'
import { MAX_UPLOAD_BYTES, RAW_MAX_SIDE } from '../lib/limits'
import { prepareImage, type ImageEngine, type Turns } from '../lib/prepare'
import { checkImageFile, problemFromError, type ImageProblemCode } from '../lib/problems'
import type { ImageOrigin, RawImage } from '../types'

export interface UseRawIngestOptions {
  engine: ImageEngine
  onResult: (image: RawImage) => void
  maxSide?: number // default RAW_MAX_SIDE
  maxBytes?: number // default MAX_UPLOAD_BYTES
  output?: 'blob' | 'dataUrl'
}

export interface UseRawIngest {
  phase: 'idle' | 'preparing'
  busy: boolean
  problem: ImageProblemCode | null
  /** Check, prepare in the browser (orient, shrink to maxSide, crop, turn), hand the Blob to the host. Nothing is uploaded. */
  ingestBlob(blob: Blob, origin: ImageOrigin, opts?: { turns?: 0 | 1 | 2 | 3; crop?: Rect }): Promise<void>
  /** An https link is passed through untouched (the consumer's server fetches it); a data:image URL becomes a Blob. */
  ingestLink(text: string): Promise<void>
  cancel(): void
  setProblem(code: ImageProblemCode | null): void
}

/** Raw mode (Recipe Assistant "Read from a photo"): the same pick pipeline as useImageIngest, minus the server. */
export function useRawIngest(options: UseRawIngestOptions): UseRawIngest {
  const latest = useRef(options)
  latest.current = options
  const [phase, setPhase] = useState<'idle' | 'preparing'>('idle')
  const [problem, setProblem] = useState<ImageProblemCode | null>(null)
  const token = useRef(0)

  useEffect(
    () => () => {
      token.current++
    },
    [],
  )

  const fail = useCallback((code: ImageProblemCode) => {
    token.current++
    setPhase('idle')
    setProblem(code)
  }, [])

  const ingestBlob = useCallback<UseRawIngest['ingestBlob']>(
    async (blob, origin, opts) => {
      const { engine } = latest.current
      const maxBytes = latest.current.maxBytes ?? MAX_UPLOAD_BYTES
      const maxSide = latest.current.maxSide ?? RAW_MAX_SIDE
      const refusal = checkImageFile({ type: blob.type, size: blob.size, name: (blob as Blob & { name?: string }).name }, maxBytes)
      if (refusal) return fail(refusal)
      const mine = ++token.current
      setProblem(null)
      setPhase('preparing')
      try {
        const prepared = await prepareImage(blob, { maxSide, maxBytes, turns: (opts?.turns ?? 0) as Turns, crop: opts?.crop, forceEncode: origin === 'camera' }, engine)
        const dataUrl = latest.current.output === 'dataUrl' ? await blobToDataUrl(prepared.blob) : undefined
        if (token.current !== mine) return
        flushSync(() => {
          setPhase('idle')
          latest.current.onResult({
            kind: 'blob',
            blob: prepared.blob,
            ...(dataUrl ? { dataUrl } : {}),
            width: prepared.width,
            height: prepared.height,
            type: prepared.type,
            origin,
          })
        })
      } catch (err) {
        if (token.current !== mine) return
        setPhase('idle')
        setProblem(problemFromError(err))
      }
    },
    [fail],
  )

  const ingestLink = useCallback<UseRawIngest['ingestLink']>(
    async (text) => {
      const parsed = parseImageLink(text)
      if (!parsed.ok) return fail(parsed.code)
      if (parsed.kind === 'data') return ingestBlob(parsed.blob, 'link')
      token.current++
      setProblem(null)
      setPhase('idle')
      latest.current.onResult({ kind: 'url', url: parsed.url })
    },
    [fail, ingestBlob],
  )

  const cancel = useCallback(() => {
    token.current++
    setPhase('idle')
  }, [])

  return { phase, busy: phase !== 'idle', problem, ingestBlob, ingestLink, cancel, setProblem }
}
