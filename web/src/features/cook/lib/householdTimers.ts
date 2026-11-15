// The household's timers as the shell shows them (PC-04): the pill's timer, the "+N", the finished ones for the banner.
// Plain TypeScript, no React.
import type { CookTimer } from '../types'

export type ShellTimerState = 'running' | 'paused' | 'finished'
export interface ShellTimer {
  id: number
  scope: string | null
  /** CookStep.index the timer belongs to, or null for a free timer. */
  step: number | null
  recipeName: string
  /** The label without its "Step N: " prefix, first letter upper case. */
  title: string
  /** The N of "Step N: …" in the label, or null. */
  stepNumber: number | null
  seconds: number
  state: ShellTimerState
}
export interface TimerSummary {
  head: ShellTimer | null
  more: number
  finished: ShellTimer[]
  all: ShellTimer[]
}
export interface BannerText {
  headline: string
  subline: string
}

const STEP_PREFIX = /^Step (\d+):\s*(.*)$/s
const sentence = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

/** "Step 3: roast the chicken" -> { title: "Roast the chicken", stepNumber: 3 }; a free timer's label is its title. */
export function parseTimerLabel(label: string): { title: string; stepNumber: number | null } {
  const m = STEP_PREFIX.exec(label)
  if (m && m[2]!.trim() !== '') return { title: sentence(m[2]!.trim()), stepNumber: Number(m[1]) }
  return { title: sentence(label.trim()), stepNumber: null }
}

function toShell(timer: CookTimer, seconds: number): ShellTimer {
  const { title, stepNumber } = parseTimerLabel(timer.label)
  const finished = timer.state === 'finished' || (timer.state === 'running' && seconds <= 0)
  return {
    id: timer.id,
    scope: timer.scope ?? null,
    step: timer.step ?? null,
    recipeName: timer.recipeName ?? '',
    title,
    stepNumber,
    seconds: finished ? 0 : Math.max(0, seconds),
    state: finished ? 'finished' : timer.state === 'paused' ? 'paused' : 'running',
  }
}

const RANK: Record<ShellTimerState, number> = { finished: 0, running: 1, paused: 2 }

/** The order the shell lists timers in: finished first (by id), then running by the soonest end, then paused (by id). */
function compare(a: ShellTimer, b: ShellTimer): number {
  if (RANK[a.state] !== RANK[b.state]) return RANK[a.state] - RANK[b.state]
  if (a.state === 'running' && a.seconds !== b.seconds) return a.seconds - b.seconds
  return a.id - b.id
}

/** The pill's timer (the head), how many others there are ("+N"), and the finished ones for the banner. */
export function summarizeTimers(items: { timer: CookTimer; seconds: number }[]): TimerSummary {
  const all = items.map(({ timer, seconds }) => toShell(timer, seconds)).sort(compare)
  return {
    head: all[0] ?? null,
    more: Math.max(0, all.length - 1),
    finished: all.filter((t) => t.state === 'finished'),
    all,
  }
}

/** The seconds the pill's accessible name says: kept while the minute is the same, so the name changes once a minute. */
export function nameSecondsFor(previous: number | null, seconds: number): number {
  if (previous === null || seconds <= 0) return seconds
  return Math.floor(previous / 60) === Math.floor(seconds / 60) ? previous : seconds
}

/** "<Recipe> · Step <n>", the Recipe alone, or "" for a free timer. */
export function timerContext(timer: Pick<ShellTimer, 'recipeName' | 'stepNumber'>): string {
  if (!timer.recipeName) return ''
  return timer.stepNumber === null ? timer.recipeName : `${timer.recipeName} · Step ${timer.stepNumber}`
}

/** The finish alert's text: one timer by name with its Recipe and Step, or several by count with their titles. */
export function bannerText(finished: ShellTimer[]): BannerText {
  if (finished.length === 0) return { headline: '', subline: '' }
  if (finished.length === 1) {
    const only = finished[0]!
    return { headline: `Timer finished: ${only.title}`, subline: timerContext(only) }
  }
  return { headline: `${finished.length} timers finished`, subline: finished.map((t) => t.title).join(', ') }
}

/** True when a tap on the pill (or the banner's Open Cook Mode) has no single Cook Mode to go to: the Timers sheet opens instead. */
export function opensTimersSheet(timers: ShellTimer[]): boolean {
  if (timers.length === 0) return false
  if (timers.some((t) => !t.scope)) return true
  return new Set(timers.map((t) => t.scope)).size > 1
}
