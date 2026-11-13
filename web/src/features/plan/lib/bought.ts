// b5-bow: pure helpers for Bought Planned Meals (beta5-plan 2.4). No React.
import type { PlanChip } from './chips'
import { weekdayName } from './phrase'
import { boughtStrings as b } from '../boughtStrings'

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

export const BOUGHT_CHIP_KEY = 'why:bought'

/** Ingredient names of a Bought meal, in server order; [] when not Bought. */
export function boughtNames(bought: BoughtInfo | null | undefined): string[] {
  return bought ? bought.ingredients.map((i) => i.name) : []
}

/** Adds the Bought chip: on a 'row' only when no other chip; in the 'sheet' always, after the leading state chips. */
export function addBoughtChip(chips: PlanChip[], bought: BoughtInfo | null | undefined, where: 'row' | 'sheet'): PlanChip[] {
  if (boughtNames(bought).length === 0) return chips
  if (where === 'row') return chips.length === 0 ? [boughtChip()] : chips
  if (chips.some((c) => c.key === BOUGHT_CHIP_KEY)) return chips
  const leading = chips.findIndex((c) => c.kind !== 'state')
  const at = leading === -1 ? chips.length : leading
  return [...chips.slice(0, at), boughtChip(), ...chips.slice(at)]
}

function boughtChip(): PlanChip {
  return { key: BOUGHT_CHIP_KEY, kind: 'why', label: b.chip }
}

/** The sheet line; null when not Bought. */
export function boughtLine(bought: BoughtInfo | null | undefined): string | null {
  const names = boughtNames(bought)
  return names.length > 0 ? b.line(names.join(', ')) : null
}

/** The Swap note; null when not Bought. */
export function swapBoughtNote(bought: BoughtInfo | null | undefined): string | null {
  const names = boughtNames(bought)
  return names.length > 0 ? b.swapNote(names.join(', ')) : null
}

/** The hard-rule warn line (Pinned and Bought); null without a warning. */
export function warningLine(warning: MealWarning | null | undefined, ctx: WarningContext): string | null {
  if (!warning) return null
  switch (warning.code) {
    case 'excluded': {
      const member = (warning.memberId !== undefined ? ctx.memberName?.(warning.memberId) : undefined) ?? b.unknownMember
      if (warning.ingredientId === undefined) return b.warnExcludedRecipe(member)
      const ingredient = (warning.ingredientId !== undefined ? ctx.ingredientName?.(warning.ingredientId) : undefined) ?? b.unknownIngredient
      return b.warnExcluded(member, ingredient)
    }
    case 'archived':
      return b.warnArchived
    case 'course_lost':
      return ctx.courseName ? b.warnCourseLost(ctx.courseName) : b.warnCourseLostAny
  }
}

/** Regenerate confirm: the intro and one line per Bought meal; null intro and no lines when none. */
export function regenerateBoughtLines(rows: RegenerateBoughtRow[] | undefined): { intro: string | null; lines: string[] } {
  if (!rows || rows.length === 0) return { intro: null, lines: [] }
  return {
    intro: b.regenerateIntro,
    lines: rows.map((r) => b.regenerateRow(weekdayName(r.date, 'short'), r.mealSlotName, r.recipeName, r.ingredients.join(', '))),
  }
}
