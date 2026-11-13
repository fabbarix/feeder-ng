// Start, poll, cancel one receipt read (design 3.3, 7.1, 9). A finished read is kept for the review (lib/readStore).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { receiptApi } from '../api'
import { rememberRead } from '../lib/readStore'
import { failureOf, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../lib/readPolling'
import type { ReceiptErrorInput, ReadView } from '../types'

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

/** The run in progress; a new run, a cancel or an unmount ends it, and anything it still answers is ignored. */
interface Run {
  started: number
  readId?: string
  inFlight: boolean
  poll?: ReturnType<typeof setInterval>
  clock?: ReturnType<typeof setInterval>
  timeout?: ReturnType<typeof setTimeout>
}

const noop = () => undefined

function stopTimers(run: Run) {
  if (run.poll !== undefined) clearInterval(run.poll)
  if (run.clock !== undefined) clearInterval(run.clock)
  if (run.timeout !== undefined) clearTimeout(run.timeout)
}

export function useReceiptRead(session: ReadSessionInput): UseReceiptRead {
  const [phase, setPhaseState] = useState<ReadPhase>('idle')
  const [error, setError] = useState<ReceiptErrorInput>()
  const [elapsedSeconds, setElapsed] = useState(0)
  const [connectionLost, setConnectionLost] = useState(false)
  const [readId, setReadId] = useState<string>()
  const phaseRef = useRef<ReadPhase>('idle')
  const current = useRef<Run | null>(null)
  const sessionRef = useRef(session)
  useEffect(() => {
    sessionRef.current = session
  })

  const setPhase = useCallback((p: ReadPhase) => {
    phaseRef.current = p
    setPhaseState(p)
  }, [])

  /** Ends the run's timers and forgets it: nothing it answers from now on is used. */
  const finish = useCallback((run: Run) => {
    stopTimers(run)
    if (current.current === run) current.current = null
  }, [])

  const giveUp = useCallback(
    (run: Run) => {
      if (current.current !== run) return
      finish(run)
      setError({ code: 'timeout' })
      setPhase('failed')
      if (run.readId !== undefined) void receiptApi.cancelRead(run.readId).catch(noop)
    },
    [finish, setPhase],
  )

  const poll = useCallback(
    async (run: Run) => {
      if (run.inFlight || current.current !== run || run.readId === undefined) return
      run.inFlight = true
      try {
        const view: ReadView = await receiptApi.getRead(run.readId)
        if (current.current !== run) return
        setConnectionLost(false)
        if (view.status === 'running') return
        const id = run.readId
        finish(run)
        if (view.status === 'done') {
          rememberRead({ readId: id, shopId: sessionRef.current.shopId, clientUuids: sessionRef.current.clientUuids, read: view })
          setPhase('done')
          return
        }
        setError(view.error.retryAfterSeconds !== undefined ? { code: view.error.code, retryAfterSeconds: view.error.retryAfterSeconds } : { code: view.error.code })
        setPhase('failed')
      } catch (err) {
        if (current.current !== run) return
        if (err instanceof ApiError && err.status === 0) {
          setConnectionLost(true)
          return
        }
        finish(run)
        setError(err instanceof ApiError && err.status === 404 ? { code: 'receipt_read_gone' } : failureOf(err))
        setPhase('failed')
      } finally {
        run.inFlight = false
      }
    },
    [finish, setPhase],
  )

  const start = useCallback(
    async (photos: { dataUrl: string }[]) => {
      if (phaseRef.current === 'starting' || phaseRef.current === 'running') return
      const run: Run = { started: Date.now(), inFlight: false }
      current.current = run
      setElapsed(0)
      setConnectionLost(false)
      setError(undefined)
      setReadId(undefined)
      setPhase('starting')
      const { shopId, clientUuids } = sessionRef.current
      let started: { id: string }
      try {
        started = await receiptApi.startRead({ shopId, clientUuids, photos })
      } catch (err) {
        if (current.current !== run) return
        current.current = null
        setError(failureOf(err))
        setPhase('failed')
        return
      }
      if (current.current !== run) {
        // Cancelled or left while the POST was on its way: free the slot the server took.
        void receiptApi.cancelRead(started.id).catch(noop)
        return
      }
      run.readId = started.id
      setReadId(started.id)
      setPhase('running')
      run.clock = setInterval(() => setElapsed(Math.floor((Date.now() - run.started) / 1000)), 1000)
      run.poll = setInterval(() => void poll(run), POLL_INTERVAL_MS)
      run.timeout = setTimeout(() => giveUp(run), POLL_TIMEOUT_MS)
    },
    [poll, giveUp, setPhase],
  )

  const cancel = useCallback(async () => {
    const run = current.current
    current.current = null
    const wasRunning = phaseRef.current === 'running'
    if (run) stopTimers(run)
    setPhase('idle')
    setError(undefined)
    setConnectionLost(false)
    if (wasRunning && run?.readId !== undefined) await receiptApi.cancelRead(run.readId).catch(noop)
  }, [setPhase])

  const reset = useCallback(() => {
    if (phaseRef.current === 'failed' || phaseRef.current === 'done') {
      setPhase('idle')
      setError(undefined)
    }
  }, [setPhase])

  // Leaving the screen while the read runs: stop polling and free the slot, best effort (the request may outlive the page).
  useEffect(
    () => () => {
      const run = current.current
      if (!run) return
      current.current = null
      stopTimers(run)
      if (phaseRef.current === 'running' && run.readId !== undefined) void receiptApi.cancelRead(run.readId, { keepalive: true }).catch(noop)
    },
    [],
  )

  return {
    phase,
    busy: phase === 'starting' || phase === 'running',
    error,
    elapsedSeconds,
    connectionLost,
    readId,
    start,
    cancel,
    reset,
  }
}
