// Start, poll, cancel one receipt read (design 3.3, 7.1, 9). A binding to lib/backgroundRead: the read goes on when the screen goes
// (leaving does not cancel it); this hook only shows the read of its Shop and the seconds since it started.
import { useEffect, useRef, useState } from 'react'
import { getBackgroundRead, dismissBackgroundRead, cancelBackgroundRead, startBackgroundRead, type BackgroundRead } from '../lib/backgroundRead'
import { useBackgroundRead } from './useBackgroundRead'
import type { ReceiptErrorInput } from '../types'

export type ReadPhase = 'idle' | 'starting' | 'running' | 'done' | 'failed'

export interface ReadSessionInput {
  shopId: number
  clientUuids: string[]
}

export interface UseReceiptRead {
  phase: ReadPhase
  /** Starting or running. */
  busy: boolean
  error?: ReceiptErrorInput
  /** Seconds since the read started. */
  elapsedSeconds: number
  /** The last poll could not reach the server; polling goes on. */
  connectionLost: boolean
  readId?: string
  start(photos: { dataUrl: string }[]): Promise<void>
  cancel(): Promise<void>
  reset(): void
}

function phaseOf(bg: BackgroundRead | undefined): ReadPhase {
  if (bg === undefined) return 'idle'
  if (bg.status === 'ready') return 'done'
  if (bg.status === 'failed') return 'failed'
  return bg.readId === undefined ? 'starting' : 'running'
}

export function useReceiptRead(session: ReadSessionInput): UseReceiptRead {
  const bg = useBackgroundRead(session.shopId)
  // The store holds one read; one of another Shop that is still reading refuses this Shop's start, with the server's own words for it.
  // It lasts while that read does.
  const any = useBackgroundRead()
  const [refused, setRefused] = useState(false)
  const blocked = refused && any?.status === 'reading' && any.shopId !== session.shopId
  const phase = blocked ? 'failed' : phaseOf(bg)
  const startedAt = bg?.status === 'reading' ? bg.startedAt : undefined
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === undefined) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  // A failure this screen showed goes when the screen does, so the Scan screen does not show it again. One that came while the
  // screen was away stays for the row.
  const shopRef = useRef(session.shopId)
  const showedFailure = useRef(false)
  useEffect(() => {
    if (phase === 'failed') showedFailure.current = true
  }, [phase])
  useEffect(
    () => () => {
      if (!showedFailure.current) return
      const s = getBackgroundRead()
      if (s?.status === 'failed' && s.shopId === shopRef.current) dismissBackgroundRead()
    },
    [],
  )

  return {
    phase,
    busy: phase === 'starting' || phase === 'running',
    error: bg?.status === 'failed' ? bg.error : blocked ? { code: 'read_in_progress' } : undefined,
    elapsedSeconds: startedAt === undefined ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000)),
    connectionLost: bg?.status === 'reading' ? bg.connectionLost : false,
    readId: bg !== undefined && bg.status !== 'failed' ? bg.readId : undefined,
    start: async (photos) => {
      const other = getBackgroundRead()
      if (other?.status === 'reading' && other.shopId !== session.shopId) {
        setRefused(true)
        return
      }
      setRefused(false)
      await startBackgroundRead(session, photos)
    },
    // Only this Shop's read: another Shop's is not this screen's to stop.
    cancel: async () => {
      if (bg !== undefined) await cancelBackgroundRead()
    },
    reset: () => {
      setRefused(false)
      if (bg?.status === 'failed') dismissBackgroundRead()
    },
  }
}
