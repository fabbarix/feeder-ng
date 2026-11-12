import { useMemo } from 'react'
import { groupByCause, type CauseGroup } from '../lib/couldntGroups'
import { summarizeCells } from '../lib/couldntSummary'
import type { PlanEntry } from '../types'

/** `canFix`: the User may use the fix action (false for an Admin-only fix and a plain User). */
export type NoticeGroup = CauseGroup & { summary: string; canFix: boolean }

export interface CouldntPlanNotice {
  groups: NoticeGroup[]
  total: number
}

/** Couldn't plan grouped by cause. `all` is the whole plan, so "every dinner" is measured against it. */
export function useCouldntPlanNotice(unplanned: PlanEntry[], all: PlanEntry[], isAdmin = true): CouldntPlanNotice {
  return useMemo(
    () => ({
      groups: groupByCause(unplanned, all).map((g) => ({ ...g, summary: summarizeCells(g.slots, all), canFix: isAdmin || !g.adminOnly })),
      total: unplanned.length,
    }),
    [unplanned, all, isAdmin],
  )
}
