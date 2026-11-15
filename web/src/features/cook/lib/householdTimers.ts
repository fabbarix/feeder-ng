// The household's timers as the shell shows them (PC-04): the pill's timer, the "+N", the finished ones for the banner.
// Plain TypeScript, no React. STUB: the developer replaces it (tests in householdTimers.test.ts).
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

export function parseTimerLabel(label: string): { title: string; stepNumber: number | null } {
  return { title: label, stepNumber: null }
}
export function summarizeTimers(_items: { timer: CookTimer; seconds: number }[]): TimerSummary {
  return { head: null, more: 0, finished: [], all: [] }
}
export function nameSecondsFor(_previous: number | null, seconds: number): number {
  return seconds
}
export function bannerText(_finished: ShellTimer[]): BannerText {
  return { headline: '', subline: '' }
}
/** True when a tap on the pill (or the banner's Open Cook Mode) has no single Cook Mode to go to: the Timers sheet opens instead. */
export function opensTimersSheet(_timers: ShellTimer[]): boolean {
  return false
}
