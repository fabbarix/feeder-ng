// The options of an Ingredient picker: the Picture, the name, and the Base Unit as the second line.
// Built here rather than with the shared IngredientSelect, whose Base Unit badge is the first thing in each option and
// the trigger: a picker that names the Ingredient first reads better and keeps the Ingredient name the option's label.
import type { SelectOption } from '../../../ui/Select/lib'
import { selectStrings } from '../../../ui/Select/strings'
import { Thumb } from '../../../ui/Thumb'

/** One option per Ingredient that has an id (an Ingredient still to be created has none and is not listed). */
export function ingredientPickerOptions(ingredients: { id?: number; name: string; baseUnit: string; imageUrl?: string }[]): SelectOption<number>[] {
  return ingredients.flatMap((i) => (i.id === undefined ? [] : [{ value: i.id, label: i.name, meta: selectStrings.baseUnitMeta(i.baseUnit), leading: <Thumb imageUrl={i.imageUrl} size={40} /> }]))
}
