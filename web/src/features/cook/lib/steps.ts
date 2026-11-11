// Step navigation for Cook Mode. Plain TypeScript, no React.
import type { CookStep, CookTimer, StepUse } from '../types'

export interface StepNav {
  /** 0-based index of the Step shown. */
  index: number
  /** Number of Steps in the cooking sequence. */
  total: number
}

/** Starts on the first Step. total is clamped to >= 0; with no Steps index is 0. */
export function createNav(total: number, index = 0): StepNav {
  const count = Math.max(0, total)
  const last = Math.max(0, count - 1)
  return { index: Math.min(Math.max(index, 0), last), total: count }
}

/** One Step on, stopping at the last. Returns the same object when nothing changes. */
export function goNext(nav: StepNav): StepNav {
  if (isLast(nav)) return nav
  return { ...nav, index: nav.index + 1 }
}

/** One Step back, stopping at the first. Returns the same object when nothing changes. */
export function goBack(nav: StepNav): StepNav {
  if (isFirst(nav)) return nav
  return { ...nav, index: nav.index - 1 }
}

export function isFirst(nav: StepNav): boolean {
  return nav.index <= 0
}

/** True on the last Step, and when there are no Steps at all (Mark as Cooked is offered at once). */
export function isLast(nav: StepNav): boolean {
  return nav.index >= nav.total - 1
}

export type TapAction = 'back' | 'next' | null

/**
 * Tablet tap zones on the step tile: the left half is Back, the right half
 * Next. x is the click's clientX; rect the tile's bounding box. Taps outside
 * the box, or on a zero-width box, do nothing (null). The exact middle is Next.
 */
export function tapAction(x: number, rect: { left: number; width: number }): TapAction {
  if (!(rect.width > 0)) return null
  if (x < rect.left || x > rect.left + rect.width) return null
  return x - rect.left < rect.width / 2 ? 'back' : 'next'
}

/** "4 piece onion": the scaled amount, the unit as typed and the Ingredient name. */
export function describeUse(use: StepUse): string {
  const amount = Number.isInteger(use.quantity) ? String(use.quantity) : String(Math.round(use.quantity * 100) / 100)
  return `${amount} ${use.unit} ${use.ingredient}`
}

/**
 * The overline of the Step tile: "Active", "Passive · 15 min timer" (a Passive Step), upper-cased by CSS. An
 * Active Step with a duration reads "Active · 10 min".
 */
export function stepOverline(step: { kind: 'active' | 'passive' | string; durationMinutes: number }): string {
  if (step.kind === 'passive') return `Passive · ${step.durationMinutes} min timer`
  return step.durationMinutes > 0 ? `Active · ${step.durationMinutes} min` : 'Active'
}

/**
 * The timers holding `step` back (spec: a Step starts once every Step in its `after` has finished): this scope's timers
 * of those Steps that still have time left, running or paused. A finished timer (or one past its end), a cancelled or
 * dismissed one (gone from the list), or a Step whose timer never started holds nothing. Keeps the order of `items`.
 */
export function holdingTimers<T extends { timer: CookTimer; seconds: number }>(step: Pick<CookStep, 'after'> | null, items: T[], scope: string): T[] {
  const after = step?.after ?? []
  if (after.length === 0) return []
  return items.filter((i) => i.timer.scope === scope && i.timer.step !== null && after.includes(i.timer.step) && i.timer.state !== 'finished' && i.seconds > 0)
}
