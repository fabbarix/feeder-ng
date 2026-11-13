// "Which Line is it?" (SR5, 13.5 step 1): which open Shopping List Lines can be the unknown Product, in which order.
// Plain TypeScript, no React. Stub until implemented.
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
export function lineChips(_lines: LineCandidate[], _limit = MAX_LINE_CHIPS): LineChips {
  throw new Error('SR5: lineChips is not implemented')
}

/** Picking a Line takes its Ingredient (or Supply): id, name, Base Unit and kind. */
export function choiceFromLine(_chip: LineChip): IngredientChoice {
  throw new Error('SR5: choiceFromLine is not implemented')
}
