import { useMemo } from 'react'
import { groupByCause, type CauseGroup } from '../lib/couldntGroups'
import { summarizeSlots } from '../lib/couldntSummary'
import type { PlanSlot } from '../types'

/** `canFix`: the User may use the fix action (false for an Admin-only fix and a plain User). */
export type NoticeGroup = CauseGroup & { summary: string; canFix: boolean }

export interface CouldntPlanNotice {
  groups: NoticeGroup[]
  total: number
}

/** Couldn't plan grouped by cause. `all` is the whole plan, so "every dinner" is measured against it. */
export function useCouldntPlanNotice(unplanned: PlanSlot[], all: PlanSlot[], isAdmin = true): CouldntPlanNotice {
  return useMemo(
    () => ({
      groups: groupByCause(unplanned).map((g) => ({ ...g, summary: summarizeSlots(g.slots, all), canFix: isAdmin || !g.adminOnly })),
      total: unplanned.length,
    }),
    [unplanned, all, isAdmin],
  )
}
