// BR-D: wire and view types of the Base recipe link flows (docs/dev/design/base-recipes.md §3.7, §3.8, §10, §13).

/** `GET /api/recipes?kind=base` row as the picker needs it. */
export interface PickerBaseRecipe {
  id: number
  name: string
  yield: number
  yieldUnit: string | null
  archived: boolean
  usedByCount?: number
}

/** `GET /api/recipes` row (a plannable Recipe) as the picker's "Recipes you plan" group needs it. */
export interface PickerPlannable {
  id: number
  name: string
  archived: boolean
  yield: number
}

export type PickerRow =
  | { kind: 'base'; id: number; name: string; /** "Yield 1 l" */ detail: string; /** The name matches the search or the line exactly (key compare). */ exact: boolean; disabled: boolean; reason?: string }
  | { kind: 'new'; /** Capitalised, from the query or the line's Ingredient name. */ name: string; label: string }
  | { kind: 'plannable'; id: number; name: string; disabled: boolean; reason?: string }

export interface PickerRows {
  base: PickerRow[]
  /** The "Add "Béchamel" as a new Base recipe" row; null when blank, or when a Base recipe already has exactly that name. */
  create: PickerRow | null
  plannable: PickerRow[]
}

/** `GET /api/recipes/{id}/link-candidates` line. */
export interface LinkCandidate {
  lineId: number
  recipeId: number
  recipeName: string
  archived: boolean
  ingredientId: number
  ingredientName: string
  quantity: number
  unit: string
  linkable: boolean
  /** '' | 'unit_unconvertible' | 'cycle' */
  reason: string
}

export interface LinkCandidateRow {
  lineId: number
  recipeId: number
  /** "Lasagne · 500 ml béchamel" */
  label: string
  archived: boolean
  checked: boolean
  disabled: boolean
  reason?: string
}

/** `POST /api/recipes/{id}/link` result. */
export interface LinkResult {
  linked: number[]
  mergeOffer: Array<{ ingredientId: number; name: string; stockLots: number; products: number }>
}

/** The 409 `base_recipe_take_over` ask. */
export interface TakeOverAsk {
  ingredient: { id: number; name: string }
  recipes: Array<{ id: number; name: string }>
  stockLots: number
  convertible: boolean
}

/** `POST /api/recipes/{id}/to-base?dryRun=1` result: what the conversion takes away. */
export interface ToBasePlan {
  plannedMeals: Array<{ date: string; mealSlotName: string; courseName: string; pinned: boolean; bought: boolean }>
  slotRules: Array<Record<string, unknown>>
  leftovers: number
  preferences: number
}
