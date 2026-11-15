// Pure helpers for synced timers. Plain TypeScript, no React.
import { weekdayName } from '../../plan/lib/phrase'
import type { CookTimer, StartTimerInput } from '../types'
import { parseTimerLabel } from './householdTimers'

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

// ---- B9-40 (PC-03, SHORT-01): the Cook strip's pills and the rail's place lines ----

/** Short landscape shows whole pills only: two from 768 px (48 em, the breakpoint table's md) wide, one below. */
export function visiblePillCount(width: number): number {
  return width >= 768 ? 2 : 1
}

/** The timers that hold Next first (keeping their order), then the rest in the order given. Does not mutate. */
export function stripOrder<T extends { timer: CookTimer }>(items: T[], holdingIds: number[]): T[] {
  const holding = items.filter((i) => holdingIds.includes(i.timer.id))
  const rest = items.filter((i) => !holdingIds.includes(i.timer.id))
  return [...holding, ...rest]
}

/** The first `max` items and how many are left over ("+N"); no `max` shows them all. */
export function splitPills<T>(items: T[], max?: number): { shown: T[]; more: number } {
  if (max === undefined || max >= items.length) return { shown: [...items], more: 0 }
  const n = Math.max(0, max)
  return { shown: items.slice(0, n), more: items.length - n }
}

const STEP_NUMBER = /^Step\s+(\d+)\b/i

/**
 * The place line of a rail timer tile (PC-03): "Step 1 · next waits for it" for a timer that holds Next, "Step 4" for this scope's,
 * "<where> · Step 2" for another scope's (the Recipe's name, "Tue Planned Meal" or "another Recipe"), '' for a free timer here.
 */
export function railPlace(timer: CookTimer, scope: string, holdsNext: boolean): string {
  const m = STEP_NUMBER.exec(timer.label.trim())
  const step = m ? `Step ${m[1]}` : timer.step !== null && timer.step !== undefined ? `Step ${timer.step + 1}` : ''
  if (holdsNext) return step ? `${step} · next waits for it` : 'Next waits for it'
  if (!timer.scope) return ''
  if (timer.scope === scope) return step
  const where = timerPlace(timer.scope, scope, timer.recipeName)
  return step ? `${where} · ${step}` : where
}

/** What starts `timer` again with `seconds` (Undo of a cancel, Add 1 minute): its scope and Step when it has them, its label. */
export function restartInput(timer: CookTimer, seconds: number): StartTimerInput {
  const input: StartTimerInput = { label: timer.label, durationSeconds: Math.max(1, Math.round(seconds)) }
  if (timer.scope) input.scope = timer.scope
  if (timer.step !== null && timer.step !== undefined) input.step = timer.step
  return input
}

/**
 * The order of Cook Mode's timers (PC-03): finished ones (ringing) first, then the ones that hold Next, then this scope's (or, on the timeline, every one that
 * `belongs`), then the others. Does not mutate.
 */
export function cookTimerOrder<T extends { timer: CookTimer; seconds?: number }>(items: T[], scope: string, holdingIds: number[] = [], belongs?: (timerScope: string | null) => boolean): T[] {
  const here = belongs ? items.filter((i) => belongs(i.timer.scope)) : items.filter((i) => i.timer.scope === scope)
  const elsewhere = belongs ? items.filter((i) => !belongs(i.timer.scope)) : items.filter((i) => i.timer.scope !== scope)
  const ordered = stripOrder([...here, ...elsewhere], holdingIds)
  // B9-40 review (PC-03: by urgency): a finished timer is ringing, so it leads, wherever it belongs; never off the end of the strip
  const done = (i: T) => i.timer.state === 'finished' || (i.seconds !== undefined && i.seconds <= 0)
  return [...ordered.filter(done), ...ordered.filter((i) => !done(i))]
}

/**
 * B9-40 (P38, A11Y-08): the name Cook Mode shows and announces for each timer, unique on the page so "Pause <name>", "Options for <name>"
 * and the pill's open button never repeat. It is the label's title ("Pre-heat the oven"); titles that two timers share get their Step
 * ("Pre-heat the oven · Step 3"), then their Recipe, then a running number. Keyed by timer id; does not mutate.
 */
export function timerNames(timers: CookTimer[]): Map<number, string> {
  const names = new Map<number, string>()
  const base = (t: CookTimer) => parseTimerLabel(t.label).title
  const stepOf = (t: CookTimer) => {
    const n = parseTimerLabel(t.label).stepNumber ?? (t.step !== null && t.step !== undefined ? t.step + 1 : null)
    return n === null ? '' : `Step ${n}`
  }
  const steps: Array<(t: CookTimer, name: string) => string> = [
    (t, name) => (stepOf(t) ? `${name} · ${stepOf(t)}` : name),
    (t, name) => (t.recipeName ? `${name} · ${t.recipeName}` : name),
  ]
  for (const t of timers) names.set(t.id, base(t))
  for (const widen of steps) {
    const count = new Map<string, number>()
    for (const n of names.values()) count.set(n, (count.get(n) ?? 0) + 1)
    for (const t of timers) {
      const name = names.get(t.id)!
      if ((count.get(name) ?? 0) > 1) names.set(t.id, widen(t, name))
    }
  }
  const seen = new Map<string, number>()
  const total = new Map<string, number>()
  for (const n of names.values()) total.set(n, (total.get(n) ?? 0) + 1)
  for (const t of timers) {
    const name = names.get(t.id)!
    if ((total.get(name) ?? 0) < 2) continue
    const k = (seen.get(name) ?? 0) + 1
    seen.set(name, k)
    names.set(t.id, `${name} (${k})`)
  }
  return names
}
