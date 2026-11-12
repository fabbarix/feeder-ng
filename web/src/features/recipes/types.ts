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
  /** CRS E2: the Courses the Recipe can fill, at least one (household order). A create without it gets the main Course. */
  courseIds: number[]
  /** CRS E2: planned in the main Course it covers the slot's other Courses. The editor always sends it (the stored value while the switch is hidden). */
  wholeMeal: boolean
  tags: string[]
  cooldownDays: number | null
  leftoverUseByDays: number | null
  /** R12: whole minutes (1 to 30) to reheat a Leftover of this Recipe; null = not set (Reheat uses its formula). */
  reheatMinutes: number | null
  source: RecipeSource
  image: string
  lines: RecipeLine[]
  steps: RecipeStep[]
}

export interface Recipe extends Omit<RecipeInput, 'courseIds'> {
  id: number
  /** CRS E2: the Recipe's Courses, household order (`GET /api/recipes/{id}`). */
  courses: { id: number; name: string }[]
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
  /** CRS E2: household order, never null. */
  courseIds: number[]
  wholeMeal: boolean
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
  /** CRS E2: only Recipes marked with this Course (`?course=`). */
  course?: number
  archived?: 'no' | 'yes' | 'all'
}

/** An Ingredient as the editor needs it (GET /api/ingredients, ingredients feature). */
export interface IngredientRef {
  id: number
  name: string
  baseUnit: BaseUnit
  conversions: { unit: string; toBase: number }[]
  /** PE: the Ingredient's Picture address (GET /api/ingredients sends it); IngredientSelect draws a Thumb from it. */
  imageUrl?: string
}

export interface MemberPreferences {
  memberId: number
  /** Recipe id (as string) -> state; absent = none. */
  recipes: Record<string, Exclude<PreferenceState, 'none'>>
  excludedIngredients: number[]
}

/** CRS E2: a Slot Rule as the editor needs it to name what a save takes away (`GET /api/slot-rules`; the Course is a real id). */
export interface RecipeSlotRule {
  id: number
  mealSlotId: number
  courseId: number
  recipeId?: number
  recipeName?: string
  tag?: string
}

/** CRS E2: a Meal Slot as the editor needs it (`GET /api/meal-slots`): the id, the weekday and the name. */
export interface SlotName {
  id: number
  weekday: number
  name: string
}

/** CRS E2: one Slot Rule a save would remove, named for the confirm ("Friday Dinner · Side = rice"). */
export interface LostRule {
  id: number
  label: string
}

/** CRS E2: what saving the draft takes away from the Recipe's Courses; null when no Slot Rule goes. */
export interface CourseLoss {
  /** The Courses taken off, in household order. */
  courseNames: string[]
  rules: LostRule[]
}
