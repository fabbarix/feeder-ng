// Cook Mode's resume Step (PC-04): the last Step shown, kept per device in localStorage under `feeder.cook.resume.<scope>`.
// Plain TypeScript, no React.
//   value  "<CookStep.index>"            the Step to reopen on
//          "<CookStep.index>+"           reopen on the Step AFTER it (a finished timer)
//          "...@<batches>"               a Recipe cook's Batches (when not 1), so tapping the pill reopens the same Batches
// Values stored before Batches were kept ("4", "2+") still read. Every storage access is wrapped in try/catch: a blocked or
// missing storage reads as nothing and writes nothing.
import type { CookTimer } from '../types'
import { cookRecipePath, parseMealScope } from './scope'

export const RESUME_PREFIX = 'feeder.cook.resume.'
export type ResumeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
export interface Resume {
  /** The CookStep.index of the Step. */
  step: number
  /** True: open on the Step after it (a finished timer). */
  after: boolean
  /** A Recipe cook's Batches when they were not 1; absent otherwise (and in values stored before Batches were kept). */
  batches?: number
}
export interface OpenPlan {
  path: string
  resume: { scope: string; step: number; after: boolean; batches?: number } | null
}

export const resumeKey = (scope: string): string => `${RESUME_PREFIX}${scope}`

function defaultStorage(): ResumeStorage {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const pick = (storage: ResumeStorage | undefined): ResumeStorage => (storage === undefined ? defaultStorage() : storage)
const VALUE = /^(\d{1,6})(\+?)(?:@(\d{1,3}(?:\.\d{1,3})?))?$/

const keptBatches = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0 && n < 1000 && n !== 1

/** "<step>[+][@<batches>]": the Batches only when they are a number above 0 other than 1. */
export function formatResume(step: number, opts: { after?: boolean; batches?: number } = {}): string {
  const tail = keptBatches(opts.batches) ? `@${Number(opts.batches.toFixed(3))}` : ''
  return `${step}${opts.after ? '+' : ''}${tail}`
}

/** Reads a stored value; anything that is not "<n>" or "<n>+" (optionally with "@<batches>") is null. */
export function parseResume(raw: string | null): Resume | null {
  if (raw === null) return null
  const m = VALUE.exec(raw)
  if (!m) return null
  const out: Resume = { step: Number(m[1]), after: m[2] === '+' }
  if (m[3] !== undefined) {
    const batches = Number(m[3])
    if (keptBatches(batches)) out.batches = batches
  }
  return out
}

export function saveResume(scope: string, step: number, opts: { after?: boolean; batches?: number } = {}, storage?: ResumeStorage): void {
  const s = pick(storage)
  if (!s || !Number.isInteger(step) || step < 0) return
  try {
    s.setItem(resumeKey(scope), formatResume(step, opts ?? {}))
  } catch {
    // blocked storage: Cook Mode opens on the first Step next time
  }
}

export function readResume(scope: string, storage?: ResumeStorage): Resume | null {
  const s = pick(storage)
  if (!s) return null
  try {
    return parseResume(s.getItem(resumeKey(scope)))
  } catch {
    return null
  }
}

export function clearResume(scope: string, storage?: ResumeStorage): void {
  const s = pick(storage)
  if (!s) return
  try {
    s.removeItem(resumeKey(scope))
  } catch {
    // blocked storage: nothing to clear
  }
}

/** The list position to open on: the stored Step by its index; "after" moves to the next one (clamped); a missing Step is 0. */
export function resumePosition(steps: { index: number }[], resume: Resume | null): number {
  if (!resume || steps.length === 0) return 0
  const at = steps.findIndex((s) => s.index === resume.step)
  if (at < 0) return 0
  return resume.after ? Math.min(at + 1, steps.length - 1) : at
}

const RECIPE_SCOPE = /^recipe:(\d+)$/

/**
 * Where a tap on a timer goes, and the Step Cook Mode then opens on. A Recipe timer opens `/cook/recipe/<id>` (with the Batches
 * the cook used, `opts.batches`, when not 1), a Planned Meal Course timer `/cook/meal/<date>/<slot>/<course>`; a free timer or an
 * unknown scope is null. A finished timer (or a running one at 0 seconds) opens on the Step after it.
 */
export function timerOpenPlan(timer: Pick<CookTimer, 'scope' | 'step' | 'state'>, seconds: number, opts: { batches?: number } = {}): OpenPlan | null {
  const scope = timer.scope
  if (!scope) return null
  let path: string
  let batches: number | undefined
  const recipe = RECIPE_SCOPE.exec(scope)
  if (recipe) {
    batches = keptBatches(opts.batches) ? opts.batches : undefined
    path = cookRecipePath(Number(recipe[1]), batches)
  } else {
    const meal = parseMealScope(scope)
    if (!meal) return null
    path = `/cook/meal/${meal.date}/${meal.mealSlotId}/${meal.courseId}`
  }
  if (timer.step === null || timer.step === undefined) return { path, resume: null }
  const after = timer.state === 'finished' || (timer.state === 'running' && seconds <= 0)
  const resume: NonNullable<OpenPlan['resume']> = { scope, step: timer.step, after }
  if (batches !== undefined) resume.batches = batches
  return { path, resume }
}
