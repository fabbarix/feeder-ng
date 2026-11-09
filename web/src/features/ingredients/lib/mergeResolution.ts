import type { Conflict, MergeRequest } from '../types'

/** Answers keyed by conflictKey: the chosen value (ToBase, or days; null = "no Shelf Life"). */
export type Answers = Record<string, number | null>

/** 'conversion:<unit>' or 'shelfLife'. */
export function conflictKey(c: Conflict): string {
  void c
  throw new Error('TODO')
}

/** The value a side would give: c.source or c.target. */
export function sideValue(c: Conflict, side: 'source' | 'target'): number {
  void c
  void side
  throw new Error('TODO')
}

/** True when every conflict has an answer (null counts as an answer for shelfLife only). */
export function isResolved(conflicts: readonly Conflict[], answers: Answers): boolean {
  void conflicts
  void answers
  throw new Error('TODO')
}

/** The POST /merge body. `resolutions` is omitted when there are no conflicts. Answers for keys not in conflicts are dropped. */
export function buildMergeRequest(targetId: number, conflicts: readonly Conflict[], answers: Answers): MergeRequest {
  void targetId
  void conflicts
  void answers
  throw new Error('TODO')
}
