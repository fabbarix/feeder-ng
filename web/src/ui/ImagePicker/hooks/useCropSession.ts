import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImageApi, ImagePickerDeps } from '../types'

export type CropSession =
  | { phase: 'closed' }
  | { phase: 'loading' }
  | { phase: 'ready'; blob: Blob; src: string; width: number; height: number }

export type CropSource = { kind: 'stored'; url: string } | { kind: 'held'; blob: Blob; width: number; height: number }

export interface UseCropSession {
  session: CropSession
  /** Loads the picture (upload mode fetches the stored one and reads its size; raw mode already holds it) and opens the editor. */
  open(source: CropSource): Promise<void>
  close(): void
}

/** The life cycle of the crop editor around the picker: closed -> loading -> ready -> closed. Owns the editor's object URL. */
export function useCropSession(deps: Pick<ImagePickerDeps, 'api' | 'engine' | 'objectUrls'>, onFail: () => void): UseCropSession {
  const [session, setSession] = useState<CropSession>({ phase: 'closed' })
  const token = useRef(0)
  const latest = useRef({ deps, onFail })
  latest.current = { deps, onFail }

  const readySrc = session.phase === 'ready' ? session.src : ''
  const revoke = deps.objectUrls.revoke
  useEffect(() => {
    if (!readySrc) return
    return () => revoke(readySrc)
  }, [readySrc, revoke])

  useEffect(
    () => () => {
      token.current++
    },
    [],
  )

  const open = useCallback(async (source: CropSource) => {
    const mine = ++token.current
    const { api, engine, objectUrls } = latest.current.deps
    setSession({ phase: 'loading' })
    try {
      let blob: Blob
      let width: number
      let height: number
      if (source.kind === 'held') {
        ;({ blob, width, height } = source)
      } else {
        blob = await (api as ImageApi).loadBlob(source.url)
        const image = await engine.decode(blob)
        ;({ width, height } = image)
        image.close()
      }
      if (token.current !== mine) return
      setSession({ phase: 'ready', blob, src: objectUrls.create(blob), width, height })
    } catch {
      if (token.current !== mine) return
      setSession({ phase: 'closed' })
      latest.current.onFail()
    }
  }, [])

  const close = useCallback(() => {
    token.current++
    setSession({ phase: 'closed' })
  }, [])

  return { session, open, close }
}
