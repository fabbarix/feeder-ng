// SAFE-01 (B9-18): what to do with a stored reload draft when its editor opens. Pure; no React.

/** A draft older than this is never offered (7 days). */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** One stored draft: the editor's state, the record's `updatedAt` when the draft began (null: a new record), when it was written. */
export interface DraftRecord<T = unknown> {
  draft: T
  baseUpdatedAt: string | null
  /** Epoch ms. */
  savedAt: number
}

export type DraftDecision =
  | { kind: 'none'; expired?: true }
  /** The stored record is unchanged since the draft began: restore it, with a notice and Discard changes. */
  | { kind: 'restore'; savedAt: number }
  /** Someone saved the record since: nothing is restored until the person chooses. */
  | { kind: 'ask'; savedAt: number; changedAt: string }
  /** A draft of a new record: offered where the list is ("New Recipe draft"). */
  | { kind: 'offer'; savedAt: number }
  /** The draft was of a stored record that is gone now: the caller drops it. */
  | { kind: 'orphaned'; savedAt: number }

export const isExpired = (savedAt: number, now: number) => now - savedAt > DRAFT_MAX_AGE_MS

export function decideDraft({ draft, currentUpdatedAt, now }: { draft: DraftRecord | null; currentUpdatedAt: string | null; now: number }): DraftDecision {
  if (!draft) return { kind: 'none' }
  const { savedAt, baseUpdatedAt } = draft
  if (isExpired(savedAt, now)) return { kind: 'none', expired: true }
  if (baseUpdatedAt === null) return { kind: 'offer', savedAt }
  if (currentUpdatedAt === null) return { kind: 'orphaned', savedAt }
  // Instants, not strings: the same moment in another offset is no change, and an older updatedAt (clock skew) is none either.
  if (Date.parse(currentUpdatedAt) > Date.parse(baseUpdatedAt)) return { kind: 'ask', savedAt, changedAt: currentUpdatedAt }
  return { kind: 'restore', savedAt }
}
