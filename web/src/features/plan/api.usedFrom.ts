// Used from over the wire (ADR 0011): the cooked routes with `usedFrom`. Types fold into types.ts when b5-f1 has merged.
import { ApiError, http } from '../../lib/http'
import type { CookedAllEntry, CookedAllResult, CookedResult, CookPreview, SlotDayKey, SlotKey } from './types'
import type { UsedFromEntry, UsedFromNeed } from './lib/usedFrom'

export type CookPreviewWithLots = Omit<CookPreview, 'needs'> & { needs: UsedFromNeed[] }
export type CookedAllEntryWithUsedFrom = CookedAllEntry & { usedFrom?: UsedFromEntry[] }

/**
 * A cook preview as the Used from pieces read it. An older server may send needs without `baseUnit` or `lots`: a need
 * with no baseUnit is dropped (there is no unit to show it in), a need with no lots gets none, missing needs become [].
 */
export function normaliseCookPreview(preview: CookPreview): CookPreviewWithLots {
  const raw = (preview.needs ?? []) as unknown as (Omit<UsedFromNeed, 'lots'> & { lots?: UsedFromNeed['lots'] })[]
  const needs: UsedFromNeed[] = []
  for (const need of raw) {
    if (!need.baseUnit) continue
    needs.push({ ...need, baseUnit: need.baseUnit, lots: need.lots ?? [] })
  }
  return { ...preview, needs }
}

export interface CookedBody {
  leftoverPortions?: number
  usedFrom?: UsedFromEntry[]
}

const slotPath = (key: SlotKey) => `/api/plan/${key.date}/${key.mealSlotId}/${key.courseId}`
const slotDayPath = (key: SlotDayKey) => `/api/plan/${key.date}/${key.mealSlotId}`

const hasPicks = (entries: UsedFromEntry[] | undefined): entries is UsedFromEntry[] => entries !== undefined && entries.length > 0

/** `usedFrom` goes on the wire only when something is picked; so does leftoverPortions when given. */
function cookedBody(body: CookedBody): CookedBody {
  const out: CookedBody = {}
  if (body.leftoverPortions !== undefined) out.leftoverPortions = body.leftoverPortions
  if (hasPicks(body.usedFrom)) out.usedFrom = body.usedFrom
  return out
}

function courseEntry(entry: CookedAllEntryWithUsedFrom): CookedAllEntryWithUsedFrom {
  const { usedFrom, ...rest } = entry
  return hasPicks(usedFrom) ? { ...rest, usedFrom } : rest
}

export const usedFromApi = {
  /** POST .../{courseId}/cooked; `usedFrom` is sent only when non-empty. */
  cooked: (key: SlotKey, body: CookedBody) => http.post<CookedResult>(`${slotPath(key)}/cooked`, cookedBody(body)),
  /** POST .../all/cooked with `courses[i].usedFrom` where picked. */
  cookedAll: (slot: SlotDayKey, courses: CookedAllEntryWithUsedFrom[]) =>
    http.post<CookedAllResult>(`${slotDayPath(slot)}/all/cooked`, { courses: courses.map(courseEntry) }),
}

/** True for 422 used_from_invalid. */
export function isUsedFromInvalid(err: unknown): boolean {
  return err instanceof ApiError && err.status === 422 && err.code === 'used_from_invalid'
}
