// The values behind the new-Product sheet's controls (SR5): the Ingredient Select's options, the pack selection that a choice starts
// on, and the text a NumberField keeps. Plain TypeScript, no React.
import type { SelectOption } from '../../../ui/Select/lib'
import { selectStrings } from '../../../ui/Select/strings'
import type { IngredientKind } from '../../ingredients/types'
import { newProductStrings } from '../newProductStrings'
import { suggestPackChips, type PackProduct } from './packChips'
import { choicesOfKind, unitOptions, type IngredientChoice } from './unknownForm'
import type { BaseUnit } from '../types'

/** The Select value of an Ingredient or Supply created in this sheet (it has no id yet). */
export const NEW_CHOICE_VALUE = -1

/** The pack selection of the form: the typed or chosen size and unit, which chip (if any) is pressed, and whether "Other" is open. */
export interface PackSelection {
  size: string
  unit: string
  key: string | null
  other: boolean
}

export const noPackSelection = (base: BaseUnit): PackSelection => ({ size: '', unit: base, key: null, other: false })

/** The Select value of a choice: its id, or the new-choice value; null while nothing is chosen. */
export function choiceValue(choice: IngredientChoice | null): number | null {
  if (!choice) return null
  return choice.id ?? NEW_CHOICE_VALUE
}

/**
 * The options of the Ingredient or Supply Select: the choices of one kind under one subheader, plus the chosen one when the list does not
 * hold it (an adopted Ingredient, or the one created in this sheet). The create row is added by the Select itself.
 */
export function kindChoiceOptions(choices: IngredientChoice[], kind: IngredientKind, chosen: IngredientChoice | null): SelectOption<number>[] {
  const group = kind === 'supply' ? newProductStrings.groupSupplies : newProductStrings.groupIngredients
  const listed = choicesOfKind(choices, kind).filter((c) => c.id !== undefined)
  const toOption = (c: IngredientChoice): SelectOption<number> => ({ value: choiceValue(c) ?? NEW_CHOICE_VALUE, label: c.name, meta: selectStrings.baseUnitMeta(c.baseUnit), group })
  const options = listed.map(toOption)
  if (chosen && !listed.some((c) => c.id !== undefined && c.id === chosen.id)) options.push(toOption(chosen))
  return options
}

/** The pack selection a choice starts on: its one usual size when it has exactly one, else nothing (the User picks). */
export function packSelectionFor(choice: IngredientChoice, products: PackProduct[]): PackSelection {
  const preselected = suggestPackChips({ ingredientId: choice.id, baseUnit: choice.baseUnit }, products).preselected
  if (!preselected) return noPackSelection(choice.baseUnit)
  return { size: preselected.value, unit: preselected.unit, key: preselected.key, other: false }
}

/** The Base Units a new Ingredient or Supply can take, and the units its pack size can be typed in. */
export const BASE_UNIT_CHOICES: BaseUnit[] = ['g', 'ml', 'piece']

export function unitChoices(base: BaseUnit) {
  return { baseUnit: base, conversions: [], globalUnits: unitOptions(base) }
}

/**
 * The text the form keeps for a NumberField's number: a dot decimal ("1.5"), as the pack chips keep theirs ("1.5" kg). The NumberField
 * already parsed what the User typed (a comma included); toUnknownOp turns this text into the Op's number in Base Units.
 */
export function numberText(n: number | null): string {
  return n === null ? '' : String(n)
}

/** The number a NumberField shows for the text kept ("" = nothing). */
export function numberValue(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
