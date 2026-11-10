// Pure helpers for synced timers. Plain TypeScript, no React.
import { weekdayName } from '../../plan/lib/phrase'
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

/**
 * Splits timer items into this scope's (`here`) and the others' (`elsewhere`: other Steps' or Recipes' timers and free
 * timers with no scope). Keeps order.
 */
export function partitionByScope<T extends { timer: CookTimer }>(items: T[], scope: string): { here: T[]; elsewhere: T[] } {
  const here: T[] = []
  const elsewhere: T[] = []
  for (const item of items) {
    if (item.timer.scope === scope) here.push(item)
    else elsewhere.push(item)
  }
  return { here, elsewhere }
}

export type TimerAction = 'pause' | 'resume' | 'cancel' | 'dismiss'

/** The explicit controls a timer in this state offers, in display order: running pause + cancel; paused resume + cancel; finished dismiss. */
export function timerActions(state: CookTimer['state']): TimerAction[] {
  switch (state) {
    case 'running':
      return ['pause', 'cancel']
    case 'paused':
      return ['resume', 'cancel']
    case 'finished':
      return ['dismiss']
  }
}

/**
 * Where a timer from another scope belongs, for a hint next to its label: "" for a free timer or this scope,
 * "Tue Planned Meal" for meal:2026-11-10/3, "another Recipe" for recipe:7.
 */
export function timerPlace(timerScope: string | null, currentScope: string, recipeName?: string): string {
  if (!timerScope || timerScope === currentScope) return ''
  if (recipeName) return recipeName
  const meal = /^meal:(\d{4}-\d{2}-\d{2})\//.exec(timerScope)
  if (meal) return `${weekdayName(meal[1]!, 'short')} Planned Meal`
  return 'another Recipe'
}
