// "Which Line is it?" (SR5, 13.5 step 1): which open Shopping List Lines can be the unknown Product, in which order.
// Plain TypeScript, no React.
import type { IngredientKind } from '../../ingredients/types'
import type { BaseUnit } from '../types'
import type { IngredientChoice } from './unknownForm'

/** A Shopping List Line as the chips need it: ShoppingLine fits (its `kind` arrives with the Supplies work: absent = food). */
export interface LineCandidate {
  ingredientId: number
  name: string
  baseUnit: BaseUnit
  /** still to get, in Base Units; 0 = covered */
  quantity: number
  ticked: boolean
  kind?: IngredientKind
  imageUrl?: string
}

export interface LineChip {
  ingredientId: number
  name: string
  baseUnit: BaseUnit
  kind: IngredientKind
  /** a Supply's Line is a Restock Line */
  restock: boolean
  quantity: number
  imageUrl?: string
}

export interface LineChips {
  /** at most `limit`, shown as chips */
  chips: LineChip[]
  /** the rest, behind "More Lines" */
  more: LineChip[]
}

export const MAX_LINE_CHIPS = 8

/**
 * The unticked Lines that still need something (quantity above 0; a partly covered Line counts), one per Ingredient, food Lines first
 * and Restock Lines of Supplies after them, each group in the list's own order.
 */
export function lineChips(lines: LineCandidate[], limit = MAX_LINE_CHIPS): LineChips {
  const seen = new Set<number>()
  const open: LineChip[] = []
  for (const line of lines) {
    if (line.ticked || line.quantity <= 0 || seen.has(line.ingredientId)) continue
    seen.add(line.ingredientId)
    const kind: IngredientKind = line.kind ?? 'food'
    const chip: LineChip = { ingredientId: line.ingredientId, name: line.name, baseUnit: line.baseUnit, kind, restock: kind === 'supply', quantity: line.quantity }
    if (line.imageUrl) chip.imageUrl = line.imageUrl
    open.push(chip)
  }
  const ordered = [...open.filter((c) => c.kind === 'food'), ...open.filter((c) => c.kind === 'supply')]
  return { chips: ordered.slice(0, limit), more: ordered.slice(limit) }
}

/** Picking a Line takes its Ingredient (or Supply): id, name, Base Unit and kind. */
export function choiceFromLine(chip: LineChip): IngredientChoice {
  const choice: IngredientChoice = { id: chip.ingredientId, name: chip.name, baseUnit: chip.baseUnit, kind: chip.kind }
  if (chip.imageUrl) choice.imageUrl = chip.imageUrl
  return choice
}
