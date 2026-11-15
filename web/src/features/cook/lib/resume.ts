// Cook Mode's resume Step (PC-04): the last Step shown, kept per device in localStorage under `feeder.cook.resume.<scope>`.
// Plain TypeScript, no React. STUB: the developer replaces it (tests in resume.test.ts).
import type { CookTimer } from '../types'

export const RESUME_PREFIX = 'feeder.cook.resume.'
export type ResumeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
export interface Resume {
  /** The CookStep.index of the Step. */
  step: number
  /** True: open on the Step after it (a finished timer). */
  after: boolean
}
export interface OpenPlan {
  path: string
  resume: { scope: string; step: number; after: boolean } | null
}

export const resumeKey = (scope: string): string => `${RESUME_PREFIX}${scope}`
export function saveResume(_scope: string, _step: number, _opts?: { after?: boolean }, _storage?: ResumeStorage): void {}
export function readResume(_scope: string, _storage?: ResumeStorage): Resume | null {
  return null
}
export function clearResume(_scope: string, _storage?: ResumeStorage): void {}
export function resumePosition(_steps: { index: number }[], _resume: Resume | null): number {
  return 0
}
export function timerOpenPlan(_timer: Pick<CookTimer, 'scope' | 'step' | 'state'>, _seconds: number): OpenPlan | null {
  return null
}
