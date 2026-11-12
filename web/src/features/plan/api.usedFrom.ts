// Used from over the wire (ADR 0011): the cooked routes with `usedFrom`. Types fold into types.ts when b5-f1 has merged.
import type { CookedAllEntry, CookedAllResult, CookedResult, CookPreview, SlotDayKey, SlotKey } from './types'
import type { UsedFromEntry, UsedFromNeed } from './lib/usedFrom'

export type CookPreviewWithLots = Omit<CookPreview, 'needs'> & { needs: UsedFromNeed[] }
export type CookedAllEntryWithUsedFrom = CookedAllEntry & { usedFrom?: UsedFromEntry[] }

export interface CookedBody {
  leftoverPortions?: number
  usedFrom?: UsedFromEntry[]
}

export const usedFromApi = {
  /** POST .../{courseId}/cooked; `usedFrom` is sent only when non-empty. */
  cooked: (_key: SlotKey, _body: CookedBody): Promise<CookedResult> => Promise.resolve(undefined as never),
  /** POST .../all/cooked with `courses[i].usedFrom` where picked. */
  cookedAll: (_slot: SlotDayKey, _courses: CookedAllEntryWithUsedFrom[]): Promise<CookedAllResult> => Promise.resolve(undefined as never),
}

/** True for 422 used_from_invalid. */
export function isUsedFromInvalid(_err: unknown): boolean {
  return false
}
