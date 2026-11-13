// The finished read waits in memory for the review: one at a time, 10 minutes (design 3.3). The photos are never kept (ADR 0018, Q4).
import type { StoredRead } from '../types'

export const READ_KEPT_MS = 600_000

let kept: StoredRead | undefined

/** Keeps this read; a new one replaces the old. */
export function rememberRead(read: Omit<StoredRead, 'storedAt'>, now: number = Date.now()): void {
  kept = { ...read, storedAt: now }
}

/** The kept read, or undefined once it is 10 minutes old (then it is gone for good). */
export function recallRead(now: number = Date.now()): StoredRead | undefined {
  if (kept && now - kept.storedAt >= READ_KEPT_MS) kept = undefined
  return kept
}

export function forgetRead(): void {
  kept = undefined
}
