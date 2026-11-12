// b5-bow: pure helpers for Bought Planned Meals (beta5-plan 2.4). No React. STUBS (red): the developer implements.
import type { PlanChip } from './chips'

export interface BoughtInfo {
  ingredients: { id: number; name: string }[]
}

export interface MealWarning {
  code: 'excluded' | 'archived' | 'course_lost'
  memberId?: number
  ingredientId?: number
}

export interface WarningContext {
  memberName?: (id: number) => string | undefined
  ingredientName?: (id: number) => string | undefined
  courseName?: string
}

export interface RegenerateBoughtRow {
  date: string
  mealSlotName: string
  courseName: string
  recipeName: string
  ingredients: string[]
}

export interface RegenerateDryRun {
  replaces: number
  bought: RegenerateBoughtRow[]
}

/** Ingredient names of a Bought meal, in server order; [] when not Bought. */
export function boughtNames(_bought: BoughtInfo | null | undefined): string[] {
  return []
}

/** Adds the Bought chip: on a 'row' only when no other chip; in the 'sheet' always, after the leading state chips. */
export function addBoughtChip(chips: PlanChip[], _bought: BoughtInfo | null | undefined, _where: 'row' | 'sheet'): PlanChip[] {
  return chips
}

/** The sheet line; null when not Bought. */
export function boughtLine(_bought: BoughtInfo | null | undefined): string | null {
  return ''
}

/** The Swap note; null when not Bought. */
export function swapBoughtNote(_bought: BoughtInfo | null | undefined): string | null {
  return ''
}

/** The hard-rule warn line (Pinned and Bought); null without a warning. */
export function warningLine(_warning: MealWarning | null | undefined, _ctx: WarningContext): string | null {
  return ''
}

/** Regenerate confirm: the intro and one line per Bought meal; null intro and no lines when none. */
export function regenerateBoughtLines(_rows: RegenerateBoughtRow[] | undefined): { intro: string | null; lines: string[] } {
  return { intro: '', lines: [''] }
}
