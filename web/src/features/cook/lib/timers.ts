// Pure helpers for synced timers. Plain TypeScript, no React.
import type { CookTimer } from '../types'

/**
 * serverNow - clientNow in ms, measured from a response's `now`. Add it to the
 * device clock to get server time, so a drifting tablet still agrees with the phone.
 */
export function measureSkew(serverNow: string, clientNowMs: number): number {
  return Date.parse(serverNow) - clientNowMs
}

/**
 * Whole seconds left, rounded up and never negative. Running timers count down
 * to endsAt using clientNowMs + skewMs; paused ones show remainingSeconds as
 * sent; finished ones 0.
 */
export function remainingSeconds(timer: CookTimer, clientNowMs: number, skewMs: number): number {
  if (timer.state === 'finished') return 0
  if (timer.state === 'paused') return Math.max(0, timer.remainingSeconds)
  const endsMs = Date.parse(timer.endsAt ?? '')
  if (Number.isNaN(endsMs)) return 0
  const leftMs = endsMs - (clientNowMs + skewMs)
  return Math.max(0, Math.ceil(leftMs / 1000))
}

const RANK: Record<CookTimer['state'], number> = { running: 0, paused: 1, finished: 2 }

/** Running by soonest end, then paused by label, then finished by id. Does not mutate. */
export function sortTimers(timers: CookTimer[], _clientNowMs: number, _skewMs: number): CookTimer[] {
  return [...timers].sort((a, b) => {
    if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state]
    if (a.state === 'running') {
      const diff = Date.parse(a.endsAt ?? '') - Date.parse(b.endsAt ?? '')
      if (diff !== 0) return diff
      return a.id - b.id
    }
    if (a.state === 'paused') return a.label.localeCompare(b.label) || a.id - b.id
    return a.id - b.id
  })
}

/** Ids of the timers that count as finished: state finished, or running and already past endsAt. */
export function finishedIds(timers: CookTimer[], clientNowMs: number, skewMs: number): number[] {
  const serverNow = clientNowMs + skewMs
  return timers
    .filter((t) => t.state === 'finished' || (t.state === 'running' && serverNow >= Date.parse(t.endsAt ?? '')))
    .map((t) => t.id)
}

/** Ids in `now` that are finished and were not finished in `before` (a timer first seen already finished is not new). */
export function newlyFinished(before: number[] | null, now: number[]): number[] {
  if (before === null) return []
  return now.filter((id) => !before.includes(id))
}
