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
 * The overline of the Step tile: "Active", "Passive · 15 min timer" (a Passive Step), in sentence case. An
 * Active Step with a duration reads "Active · 10 min".
 */
export function stepOverline(step: { kind: 'active' | 'passive' | string; durationMinutes: number; number?: number; of?: number }): string {
  const kind =
    step.kind === 'passive'
      ? `Passive · ${formatStepDuration(step.durationMinutes)} timer`
      : step.durationMinutes > 0
        ? `Active · ${formatStepDuration(step.durationMinutes)}`
        : 'Active'
  return step.number && step.number > 0 ? `Step ${step.number} of ${step.of ?? step.number} · ${kind}` : kind
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

// ---- B9-40: the Step text (PC-03, PC-16 items 1 to 3) ----

const NBSP = ' '
const UNIT = '(?:°C|°F|kg|g|mg|ml|cl|dl|l|L|tbsp|tsp|cups?|oz|lb|minutes?|mins?|hours?|hrs?|h|seconds?|secs?|s|cm|mm)'
const UNIT_RE = new RegExp(`(\\d) (${UNIT})(?![\\p{L}\\p{N}])`, 'gu')

/** PC-16 item 1: joins a number to its unit with a no-break space ("220 °C"). Idempotent; nothing else changes. */
export function nbspUnits(text: string): string {
  return text.replace(UNIT_RE, `$1${NBSP}$2`)
}

/** PC-03: 'long' for a Step of more than 25 words (it uses a smaller type size), else 'short'. */
export function stepTextSize(text: string): 'short' | 'long' {
  const words = text.split(/[\s ]+/u).filter((w) => w.length > 0)
  return words.length > 25 ? 'long' : 'short'
}

/** PC-16 item 3: 45 -> "45 min", 90 -> "1 h 30 min", 360 -> "6 h"; never days. */
export function formatStepDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const ARTICLES = new Set(['the', 'a', 'an', 'your', 'some'])

/** PC-16 item 2: the phrase the held line names the timer by ("the oven"); never ends in punctuation. */
export function shortTimerLabel(label: string): string {
  const parts = label.split(' · ')
  let text = (parts[parts.length - 1] ?? '').trim()
  text = text.replace(/^Step\s+\d+\s*:\s*/i, '')
  text = text.replace(/[\s.!?:;,]+$/u, '')
  text = text.replace(/\s+(?:to|for|at|until)\s+\d.*$/iu, '')
  text = text.replace(/[\s.!?:;,]+$/u, '')
  const words = text.split(/\s+/u).filter((w) => w.length > 0)
  if (words.length >= 2 && ARTICLES.has(words[1]!.toLowerCase())) words.shift()
  const out = words.join(' ')
  return out.toLowerCase()
}
