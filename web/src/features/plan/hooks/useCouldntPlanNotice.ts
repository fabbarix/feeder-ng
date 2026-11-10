import { useMemo } from 'react'
import { groupByCause, type CauseGroup } from '../lib/couldntGroups'
import { summarizeSlots } from '../lib/couldntSummary'
import type { PlanSlot } from '../types'

export type NoticeGroup = CauseGroup & { summary: string }

export interface CouldntPlanNotice {
  groups: NoticeGroup[]
  total: number
}

/** Couldn't plan grouped by cause. `all` is the whole plan, so "every dinner" is measured against it. */
export function useCouldntPlanNotice(unplanned: PlanSlot[], all: PlanSlot[]): CouldntPlanNotice {
  return useMemo(
    () => ({
      groups: groupByCause(unplanned).map((g) => ({ ...g, summary: summarizeSlots(g.slots, all) })),
      total: unplanned.length,
    }),
    [unplanned, all],
  )
}
