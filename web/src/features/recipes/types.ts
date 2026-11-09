// Wire types of the recipes API (docs/dev/design/t8-recipes.md).

export type StepKind = 'active' | 'passive' | 'advance'
export type PreferenceState = 'none' | 'favourite' | 'dislike' | 'exclusion'
export type BaseUnit = 'g' | 'ml' | 'piece'

export interface RecipeLine {
  ingredientId: number
  /** Output only. */
  ingredient?: string
  quantity: number
  unit: string
  optional: boolean
  note: string
}

export interface StepUse {
  ingredientId: number
  quantity: number
  unit: string
}

export interface RecipeStep {
  text: string
  kind: StepKind
  durationMinutes: number
  leadTimeMinutes: number
  /** 0-based indexes of earlier non-advance Steps. */
  after: number[]
  uses: StepUse[]
  /** Image id, '' = none. */
  image: string
  /** Output only. */
  imageUrl?: string
}

export interface RecipeSource {
  url: string
  attribution: string
}

/** What the editor sends (POST and PUT). */
export interface RecipeInput {
  name: string
  description: string
  yield: number
  readyMeal: boolean
  tags: string[]
  cooldownDays: number | null
  leftoverUseByDays: number | null
  source: RecipeSource
  image: string
  lines: RecipeLine[]
  steps: RecipeStep[]
}

export interface Recipe extends RecipeInput {
  id: number
  archived: boolean
  imageUrl: string
  /** Critical path of the Steps; Advance Steps are not included. */
  totalMinutes: number
  /** Longest Advance Step lead time, 0 if none. */
  advanceMinutes: number
  advance: { step: number; leadTimeMinutes: number }[]
  createdAt: string
  updatedAt: string
}

export interface RecipeSummary {
  id: number
  name: string
  yield: number
  readyMeal: boolean
  tags: string[]
  imageUrl: string
  archived: boolean
  totalMinutes: number
  advanceMinutes: number
}

export interface TagCount {
  name: string
  recipes: number
}

export interface RecipeFilter {
  q?: string
  tag?: string
  archived?: 'no' | 'yes' | 'all'
}

/** An Ingredient as the editor needs it (GET /api/ingredients, ingredients feature). */
export interface IngredientRef {
  id: number
  name: string
  baseUnit: BaseUnit
  conversions: { unit: string; toBase: number }[]
}

/** GET /api/ingredients/search: the exact match and close suggestions. */
export interface IngredientSearch {
  exact: IngredientRef | null
  suggestions: { ingredient: IngredientRef; score: number }[]
}

export interface UploadedImage {
  id: string
  url: string
  width: number
  height: number
}

export interface MemberPreferences {
  memberId: number
  /** Recipe id (as string) -> state; absent = none. */
  recipes: Record<string, Exclude<PreferenceState, 'none'>>
  excludedIngredients: number[]
}
