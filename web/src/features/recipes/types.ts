import type { RecipeSort } from './lib/sort'
// Wire types of the recipes API (docs/dev/design/t8-recipes.md).

export type StepKind = 'active' | 'passive' | 'advance'
export type PreferenceState = 'none' | 'favourite' | 'dislike' | 'exclusion'
export type BaseUnit = 'g' | 'ml' | 'piece'

/** BR-D: the Base recipe a Base recipe line calls for (`baseRecipe` on a line of `GET /api/recipes/{id}`; null on a plain line). */
export interface BaseRecipeRef {
  id: number
  name: string
  archived: boolean
  /** True for a Base recipe with no Ingredients yet ("No Ingredients yet"). */
  empty?: boolean
}

/** BR-D: a Recipe named in `usedBy`, in a refusal's `usedBy`, in a take-over ask. */
export interface RecipeRef {
  id: number
  name: string
  archived?: boolean
}

export interface RecipeLine {
  /** BR-D: the stored line's id (output; needed by the link routes). Absent on a new line. */
  id?: number
  ingredientId: number
  /** Output only. */
  ingredient?: string
  quantity: number
  unit: string
  optional: boolean
  note: string
  /** BR-D: set on a Base recipe line (output; a Base recipe line is sent with `baseRecipeId`, see BaseRecipeLineInput). */
  baseRecipe?: BaseRecipeRef | null
  /** BR-D: the explicit "Needed at" Step (0-based); null/absent = the default. */
  neededAtStep?: number | null
  /** BR-D output: the Step that applies (the override or the default). */
  neededAt?: number
  /** BR-D output: the plain Ingredient this line was linked from (for Use as a plain Ingredient); null/absent = none. */
  linkedFromIngredientId?: number | null
}

/** BR-D: a Base recipe line as the editor sends it (POST/PUT): by Base recipe, no `ingredientId`. */
export interface BaseRecipeLineInput {
  /** The stored line's id (absent on a line added in this edit). */
  id?: number
  /** The plain Ingredient the line was linked from, kept for "Use as a plain Ingredient"; null = nothing to go back to. */
  linkedFromIngredientId?: number | null
  baseRecipeId: number
  quantity: number
  unit: string
  optional: boolean
  note: string
  neededAtStep?: number | null
}

/** BR-D: what a Base recipe's detail shows of the Ingredients inside it (`within`, through which Base recipes). */
export interface WithinLine {
  ingredientId: number
  name: string
  path: string[]
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
  /** B5-LOW: whole days (1 to 365) a frozen Leftover of this Recipe keeps; null = the Household's Frozen Use-by. Absent in older payloads. */
  frozenUseByDays?: number | null
  /** BR-D: true = a Base recipe (default false/absent). Never changed by a PUT; the kind changes by to-base / to-plannable. */
  baseRecipe?: boolean
  /** BR-D: a Base recipe's Yield unit ('g', 'kg', 'ml', 'l', ..., 'piece', 'portion'); absent for a plannable Recipe. */
  yieldUnit?: string
  /** BR-D: the answer to the take-over ask (409 base_recipe_take_over): true = take the same-name Ingredient over. */
  takeOver?: boolean
  /** R12: whole minutes (1 to 30) to reheat a Leftover of this Recipe; null = not set (Reheat uses its formula). */
  reheatMinutes: number | null
  source: RecipeSource
  image: string
  lines: Array<RecipeLine | BaseRecipeLineInput>
  steps: RecipeStep[]
}

export interface Recipe extends Omit<RecipeInput, 'courseIds' | 'lines' | 'yieldUnit'> {
  lines: RecipeLine[]
  /** BR-D: null for a plannable Recipe. */
  yieldUnit?: string | null
  /** BR-D: the Base recipe's own Ingredient (Stock and Products attach to it); absent for a plannable Recipe. */
  baseIngredientId?: number
  /** BR-D: the Recipes that call for this Base recipe (never null; [] for a plannable Recipe). */
  usedBy?: RecipeRef[]
  /** BR-D: the Ingredients inside the Base recipes this Recipe calls for, with the path of Base recipe names. */
  within?: WithinLine[]
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
  /** Beta.5 F7: the latest date (YYYY-MM-DD) a Cooked fresh Planned Meal of this Recipe had; null = never cooked. */
  lastCookedOn: string | null
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
  /** Beta.5 F7: see Recipe.lastCookedOn. */
  lastCookedOn: string | null
  /** BR-D: true = a Base recipe (the list is plannable only unless `?kind=base|all`). */
  baseRecipe?: boolean
  /** BR-D: a Base recipe's Yield unit; null/absent for a plannable Recipe. */
  yieldUnit?: string | null
  /** BR-D: how many Recipes call for this Base recipe. */
  usedByCount?: number
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
  /** Beta.5 F7: `?sort=`; absent or 'name' = by name (the server's default). */
  sort?: RecipeSort
  /** BR-D: `?kind=`; absent or 'plannable' = Recipes (the server's default), 'base' = Base recipes, 'all' = both. */
  kind?: RecipeKind
}

/** BR-D: the Recipes list's kind. */
export type RecipeKind = 'plannable' | 'base' | 'all'

/** An Ingredient as the editor needs it (GET /api/ingredients, ingredients feature). */
export interface IngredientRef {
  id: number
  name: string
  baseUnit: BaseUnit
  conversions: { unit: string; toBase: number }[]
  /** PE: the Ingredient's Picture address (GET /api/ingredients sends it); IngredientSelect draws a Thumb from it. */
  imageUrl?: string
  /** BR-D: set when the Ingredient is a Base recipe's (`GET /api/ingredients`); null/absent for a plain Ingredient. */
  baseRecipe?: { id: number; name: string; archived: boolean } | null
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
