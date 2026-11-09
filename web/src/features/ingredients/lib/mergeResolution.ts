import type { Conflict, MergeRequest } from '../types'

/** Answers keyed by conflictKey: the chosen value (ToBase, or days; null = "no Shelf Life"). */
export type Answers = Record<string, number | null>

/** 'conversion:<unit>' or 'shelfLife'. */
export function conflictKey(c: Conflict): string {
  return c.kind === 'conversion' ? `conversion:${c.unit}` : 'shelfLife'
}

/** The value a side would give: c.source or c.target. */
export function sideValue(c: Conflict, side: 'source' | 'target'): number {
  return c[side]
}

/** True when every conflict has an answer (null counts as an answer for shelfLife only). */
export function isResolved(conflicts: readonly Conflict[], answers: Answers): boolean {
  return conflicts.every((c) => {
    const value = answers[conflictKey(c)]
    if (c.kind === 'conversion') return typeof value === 'number'
    return value === null || typeof value === 'number'
  })
}

/** The POST /merge body. `resolutions` is omitted when there are no conflicts. Answers for keys not in conflicts are dropped. */
export function buildMergeRequest(targetId: number, conflicts: readonly Conflict[], answers: Answers): MergeRequest {
  const conversions: Record<string, number> = {}
  let shelfLifeDays: number | null | undefined
  for (const c of conflicts) {
    const value = answers[conflictKey(c)]
    if (c.kind === 'conversion' && typeof value === 'number') conversions[c.unit] = value
    if (c.kind === 'shelfLife' && value !== undefined) shelfLifeDays = value
  }
  const resolutions: NonNullable<MergeRequest['resolutions']> = {}
  if (Object.keys(conversions).length > 0) resolutions.conversions = conversions
  if (shelfLifeDays !== undefined) resolutions.shelfLifeDays = shelfLifeDays
  return Object.keys(resolutions).length > 0 ? { into: targetId, resolutions } : { into: targetId }
}
