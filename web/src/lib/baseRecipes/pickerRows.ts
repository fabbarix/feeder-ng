import type { PickerBaseRecipe, PickerPlannable, PickerRows } from './types'

// BR-D (design §3.7): the rows of the BaseRecipePicker. Pure.

export interface PickerInput {
  /** What the User typed in the picker's search; '' = nothing typed (then the line's Ingredient name ranks the rows). */
  query: string
  /** The line's Ingredient name ("béchamel"). */
  lineName: string
  baseRecipes: readonly PickerBaseRecipe[]
  plannable: readonly PickerPlannable[]
  /** The Recipe being edited: left out of both groups. */
  selfId?: number
  /** Recipe id -> why it cannot be chosen (a cycle): listed disabled with this reason. */
  blocked?: Readonly<Record<number, string>>
}

/**
 * Base recipes: archived and self left out; with a query only the names that contain it (key compare); order: exact name match first,
 * then names that start with it, then the rest by name (with no query the line's Ingredient name plays the query for the ORDER only).
 * Create row: "Add "Béchamel" as a new Base recipe" named from the query, else the line's name; null when blank or when a Base recipe
 * (archived ones included) already has exactly that name. Plannable: archived and self left out, the names containing the query (or the line's
 * name when nothing is typed), by name. A blocked id is disabled with its reason. Base recipe detail reads "Yield 1 l" (unit omitted when null).
 */
export function pickerRows(input: PickerInput): PickerRows {
  void input
  throw new Error('BR-D: not implemented')
}
