import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { importApi } from '../api'
import { errorFromApi, type ReadErrorInput } from '../lib/readErrors'
import { errorBackoff, isTerminal, pollDelay, shouldGiveUp } from '../lib/readProgress'
import { buildReadRequest } from '../lib/readRequest'
import type { AdoptedRead, ReadInput, ReadState, ReadView } from '../types'

/** How the last read ended: 'done' = it reached review; 'cancelled' = by the User or by the server (another tab); 'failed' = it has an error. */
export type ReadOutcome = 'done' | 'cancelled' | 'failed'

export interface UseRecipeRead {
  /** Set when a read ends, cleared when the next one starts. PM decision: photos are cleared only for 'done'. */
  outcome?: ReadOutcome
  /** idle: nothing running. starting: the POST is in flight. running: polling. failed: `error` is set. */
  phase: 'idle' | 'starting' | 'running' | 'failed'
  /** starting or running. */
  busy: boolean
  kind: ReadInput['kind'] | undefined
  /** The server state last seen (undefined while idle). */
  state: ReadState | undefined
  error: ReadErrorInput | undefined
  /** Whole seconds since the read started (for "Still working…"). */
  elapsedSeconds: number
  /** Checks the input (lib/readRequest), POSTs, then polls GET until a final state. A second call while busy does nothing. */
  start: (input: ReadInput) => Promise<void>
  /** DELETE the read and go idle (no error). A failed DELETE still goes idle. */
  cancel: () => Promise<void>
  /** Clears a failure. */
  reset: () => void
}

/**
 * Start, poll, cancel one Recipe Assistant read (docs/dev/design/ra-e-import.md section 5.1). `onDone` receives the finished
 * read's review (the screen passes useImportReview.adopt).
 */
export function useRecipeRead(opts: { onDone: (read: AdoptedRead) => void }): UseRecipeRead {
  const [phase, setPhase] = useState<UseRecipeRead['phase']>('idle')
  const [kind, setKind] = useState<ReadInput['kind'] | undefined>(undefined)
  const [state, setState] = useState<ReadState | undefined>(undefined)
  const [error, setError] = useState<ReadErrorInput | undefined>(undefined)
  const [elapsedSeconds, setElapsed] = useState(0)
  const [outcome, setOutcome] = useState<ReadOutcome | undefined>(undefined)

  const onDoneRef = useRef(opts.onDone)
  onDoneRef.current = opts.onDone
  // One read at a time. `token` changes whenever the current read ends, so late answers of an older one are ignored.
  const token = useRef(0)
  const busy = useRef(false)
  const readId = useRef<string | undefined>(undefined)
  const startedAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlight = useRef<AbortController | undefined>(undefined)

  const stopWork = useCallback(() => {
    token.current += 1
    busy.current = false
    clearTimeout(timer.current)
    timer.current = undefined
    inFlight.current?.abort()
    inFlight.current = undefined
    readId.current = undefined
  }, [])

  // Leaving the page or screen mid-read frees the User's running slot: a best-effort DELETE that may outlive the page.
  useEffect(
    () => () => {
      const id = readId.current
      if (busy.current && id) void importApi.cancelRead(id, { keepalive: true }).catch(() => undefined)
      stopWork()
    },
    [stopWork],
  )

  // The seconds counter of "Still working…".
  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  const fail = useCallback((e: ReadErrorInput) => {
    setError(e)
    setState(undefined)
    setPhase('failed')
    setOutcome('failed')
  }, [])

  const goIdle = useCallback(() => {
    setError(undefined)
    setState(undefined)
    setKind(undefined)
    setElapsed(0)
    setPhase('idle')
  }, [])

  /** Ends the read here and tells the server (best effort) so the User's running slot is freed. */
  const giveUp = useCallback(
    (id: string, e: ReadErrorInput) => {
      stopWork()
      void importApi.cancelRead(id).catch(() => undefined)
      fail(e)
    },
    [stopWork, fail],
  )

  const finish = useCallback(
    (view: ReadView) => {
      stopWork()
      if (view.state === 'cancelled') {
        setOutcome('cancelled')
        return goIdle()
      }
      if (view.state === 'failed') {
        const err = view.error
        return fail({
          code: err?.code ?? 'unknown',
          ...(err?.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
          ...(err?.errors ? { errors: err.errors } : {}),
          ...(err?.model ? { model: err.model } : {}),
        })
      }
      if (!view.review) return fail({ code: 'unknown' })
      const { review } = view
      setOutcome('done')
      goIdle()
      onDoneRef.current({ id: review.id, plan: review.plan, photos: review.photos, source: view.source, model: view.model })
    },
    [stopWork, goIdle, fail],
  )

  const poll = useCallback(
    (id: string, mine: number, attempt: number, failures: number) => {
      const schedule = (delay: number, nextAttempt: number, nextFailures: number) => {
        timer.current = setTimeout(() => poll(id, mine, nextAttempt, nextFailures), delay)
      }
      const controller = new AbortController()
      inFlight.current = controller
      importApi
        .getRead(id, { signal: controller.signal })
        .then((view) => {
          if (mine !== token.current) return
          if (isTerminal(view.state)) return finish(view)
          setState(view.state)
          if (shouldGiveUp({ failures: 0, elapsedMs: Date.now() - startedAt.current })) return giveUp(id, { code: 'assistant_unreachable' })
          schedule(pollDelay(attempt + 1), attempt + 1, 0)
        })
        .catch((e: unknown) => {
          if (mine !== token.current) return
          if (e instanceof ApiError && e.status === 404) {
            stopWork()
            return fail({ code: 'expired' })
          }
          const next = failures + 1
          if (shouldGiveUp({ failures: next, elapsedMs: Date.now() - startedAt.current })) return giveUp(id, errorFromApi(e))
          schedule(errorBackoff(next), attempt, next)
        })
    },
    [finish, giveUp, stopWork, fail],
  )

  const start = useCallback(
    async (input: ReadInput) => {
      if (busy.current) return
      const built = buildReadRequest(input)
      if (!built.ok) {
        setKind(input.kind)
        fail({ code: built.problem })
        return
      }
      busy.current = true
      const mine = ++token.current
      setKind(input.kind)
      setError(undefined)
      setState(undefined)
      setElapsed(0)
      setOutcome(undefined)
      setPhase('starting')
      try {
        const started = await importApi.startRead(built.body)
        if (mine !== token.current) {
          // Cancelled while the POST was on its way: free the slot the server just took.
          void importApi.cancelRead(started.id).catch(() => undefined)
          return
        }
        readId.current = started.id
        startedAt.current = Date.now()
        setState(started.state)
        setPhase('running')
        timer.current = setTimeout(() => poll(started.id, mine, 0, 0), pollDelay(0))
      } catch (e) {
        if (mine !== token.current) return
        stopWork()
        fail(errorFromApi(e, 'start'))
      }
    },
    [poll, fail, stopWork],
  )

  const cancel = useCallback(async () => {
    if (!busy.current) return
    const id = readId.current
    const wasRunning = phase === 'running'
    stopWork()
    setOutcome('cancelled')
    goIdle()
    if (wasRunning && id) {
      try {
        await importApi.cancelRead(id)
      } catch {
        // Already finished or the server is out of reach: nothing more to do.
      }
    }
  }, [phase, stopWork, goIdle])

  const reset = useCallback(() => {
    if (busy.current) return
    goIdle()
  }, [goIdle])

  return { outcome, phase, busy: phase === 'starting' || phase === 'running', kind, state, error, elapsedSeconds, start, cancel, reset }
}
