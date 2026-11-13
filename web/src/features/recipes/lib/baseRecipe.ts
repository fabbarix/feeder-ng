import type { IngredientRef, RecipeKind, RecipeStep, RecipeSummary } from '../types'
import type { RecipeDraft } from './draft'
import { yieldText as yieldAmountText } from '../../../lib/baseRecipes/yield'

// BR-D (docs/dev/design/base-recipes.md §13): the pure rules of the editor, the list and the detail for Base recipes. Plain TypeScript, no React.

/** Which details fields the editor shows for a kind. */
export interface KindFields {
  courses: boolean
  wholeMeal: boolean
  readyMeal: boolean
  cooldown: boolean
  leftoverUseBy: boolean
  reheat: boolean
  frozenUseBy: boolean
  /** The Yield's unit select beside its amount. */
  yieldUnit: boolean
}

/** Plannable: everything but the Yield unit. Base recipe: only the Yield unit (Courses, Whole meal, Ready Meal, Cool-down, Use-by, Reheat time and Frozen Use-by are hidden). */
export function fieldsFor(baseRecipe: boolean): KindFields {
  return {
    courses: !baseRecipe,
    wholeMeal: !baseRecipe,
    readyMeal: !baseRecipe,
    cooldown: !baseRecipe,
    leftoverUseBy: !baseRecipe,
    reheat: !baseRecipe,
    frozenUseBy: !baseRecipe,
    yieldUnit: baseRecipe,
  }
}

/**
 * The Base recipe switch on a draft. On: baseRecipe true, yieldUnit 'portion' unless one is set, and the fields that do not apply are cleared
 * (courseIds [], wholeMeal false, wholeMealSet false, readyMeal false, cooldownDays, leftoverUseByDays, frozenUseByDays, reheatMinutes ''). Off: baseRecipe false, yieldUnit ''.
 * Returns a new draft; the input is not mutated; the same object when nothing changes.
 */
export function setBaseRecipe(draft: RecipeDraft, on: boolean): RecipeDraft {
  if ((draft.baseRecipe ?? false) === on) return draft
  if (!on) return { ...draft, baseRecipe: false, yieldUnit: '' }
  return {
    ...draft,
    baseRecipe: true,
    yieldUnit: draft.yieldUnit && draft.yieldUnit !== '' ? draft.yieldUnit : 'portion',
    courseIds: [],
    wholeMeal: false,
    wholeMealSet: false,
    readyMeal: false,
    cooldownDays: '',
    leftoverUseByDays: '',
    frozenUseByDays: '',
    reheatMinutes: '',
  }
}

/** "500 ml Béchamel (Base recipe)" for the detail and the editor's summary; `quantity` already formatted in the User's units. Name capitalised like other lines. */
export function baseLineLabel(quantityText: string, name: string): string {
  const cap = name.charAt(0).toLocaleUpperCase() + name.slice(1)
  return `${quantityText} ${cap} (Base recipe)`
}

export interface NeededAtOption {
  /** The Step index (0-based), null = the default (clears the override). */
  value: number | null
  label: string
}

const CUT = 40

/** The Steps the Needed at menu offers: every non-Advance Step, by index. */
function neededCandidates(steps: ReadonlyArray<Pick<RecipeStep, 'kind'>>): number[] {
  return steps.flatMap((s, i) => (s.kind === 'advance' ? [] : [i]))
}

/**
 * Options of the Needed at menu: one per non-Advance Step, in order, labelled "Step 4: Layer the lasagne" (text cut at 40 characters with an ellipsis),
 * the first Step labelled "Before you start"; the option whose index is `defaultStep` ends " (default)". A Recipe with no Steps has the one option "Before you start" with value 0.
 * Advance Steps are not listed (they happen days earlier, never "needed at").
 */
export function neededAtOptions(steps: ReadonlyArray<Pick<RecipeStep, 'text' | 'kind'>>, defaultStep: number | null): NeededAtOption[] {
  const candidates = neededCandidates(steps)
  if (candidates.length === 0) return [{ value: 0, label: 'Before you start' }]
  return candidates.map((i, n) => {
    const text = steps[i]!.text
    const cut = text.length > CUT ? `${text.slice(0, CUT).trimEnd()}…` : text
    const words = n === 0 ? 'Before you start' : `Step ${i + 1}: ${cut}`
    return { value: i, label: i === defaultStep ? `${words} (default)` : words }
  })
}

/** The chip's words: "Before you start" for the first non-Advance Step (or when the Recipe has no Steps), "Needed at Step 4" for index 3. */
export function neededAtLabel(steps: ReadonlyArray<Pick<RecipeStep, 'kind'>>, step: number): string {
  const candidates = neededCandidates(steps)
  if (candidates.length === 0 || step <= candidates[0]!) return 'Before you start'
  return `Needed at Step ${step + 1}`
}

/**
 * Links a draft line (by key) to a Base recipe: baseRecipeId, baseRecipeName, ingredientId = the Base recipe's Ingredient (its units apply),
 * ingredientName its name, linkedFromIngredientId = the plain Ingredient the line had (kept for Use as a plain Ingredient), neededAtStep null.
 * Quantity, unit, optional and note carry over. Unknown key: the same draft.
 */
export function linkDraftLine(draft: RecipeDraft, key: string, base: { id: number; name: string; ingredientId: number }): RecipeDraft {
  if (!draft.lines.some((l) => l.key === key)) return draft
  return {
    ...draft,
    lines: draft.lines.map((l) =>
      l.key !== key
        ? l
        : {
            ...l,
            baseRecipeId: base.id,
            baseRecipeName: base.name,
            ingredientId: base.ingredientId,
            ingredientName: base.name,
            // a take-over line (the Base recipe Ingredient was the same one) remembers nothing
            linkedFromIngredientId: l.ingredientId === base.ingredientId ? null : l.ingredientId,
            neededAtStep: null,
          },
    ),
  }
}

/**
 * Back to a plain Ingredient: baseRecipeId/baseRecipeName/neededAtStep cleared, ingredientId/Name from `plain` (the linkedFrom Ingredient, or one the User picked),
 * linkedFromIngredientId cleared. Quantity, unit, optional and note carry over.
 */
export function unlinkDraftLine(draft: RecipeDraft, key: string, plain: IngredientRef): RecipeDraft {
  return {
    ...draft,
    lines: draft.lines.map((l) =>
      l.key !== key
        ? l
        : { ...l, baseRecipeId: null, baseRecipeName: '', neededAtStep: null, ingredientId: plain.id, ingredientName: plain.name, linkedFromIngredientId: null },
    ),
  }
}

/** The Recipes list's kind from the URL: '?kind=base' = 'base'; anything else (absent, 'plannable', junk, 'all') = 'plannable' (the control has two choices). */
export function kindFromParams(params: URLSearchParams): Exclude<RecipeKind, 'all'> {
  return params.get('kind') === 'base' ? 'base' : 'plannable'
}

/** Writes the kind into a copy of the params: 'base' sets `kind=base`; 'plannable' removes it (the default). Other params are kept. */
export function withKind(params: URLSearchParams, kind: Exclude<RecipeKind, 'all'>): URLSearchParams {
  const next = new URLSearchParams(params)
  if (kind === 'base') next.set('kind', 'base')
  else next.delete('kind')
  return next
}

/** "1 l", "300 g", "8 portions" ("1 portion"): the Yield amount with its unit; a plannable Recipe (unit null/absent) gives "4 portions". */
export function yieldText(amount: number, unit: string | null | undefined): string {
  return yieldAmountText(amount, unit)
}

/** "Used in 3 Recipes" / "Used in 1 Recipe" / "Not used yet". */
export function usedInText(count: number): string {
  if (count === 0) return 'Not used yet'
  return count === 1 ? 'Used in 1 Recipe' : `Used in ${count} Recipes`
}

/** The tile's two extra lines for a Base recipe: { yield: "Yield 1 l", usedIn: "Used in 3 Recipes" }; null for a plannable summary. */
export function baseTileMeta(recipe: Pick<RecipeSummary, 'baseRecipe' | 'yield' | 'yieldUnit' | 'usedByCount'>): { yield: string; usedIn: string } | null {
  if (!recipe.baseRecipe) return null
  return { yield: `Yield ${yieldText(recipe.yield, recipe.yieldUnit)}`, usedIn: usedInText(recipe.usedByCount ?? 0) }
}

/**
 * The default "Needed at" Step of a Base recipe line (design §3.3): the first non-Advance Step whose uses name the Ingredient, else the first whose text
 * names the Base recipe (whole words, accents folded), else the first non-Advance Step; null when there is none.
 */
export function defaultNeededAt(
  steps: ReadonlyArray<{ kind: RecipeStep['kind']; text: string; uses: ReadonlyArray<{ ingredientId: number | null }> }>,
  ingredientId: number | null,
  name: string,
): number | null {
  const candidates = steps.flatMap((s, i) => (s.kind === 'advance' ? [] : [i]))
  if (candidates.length === 0) return null
  const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const needle = fold(name.trim())
  const byUse = candidates.find((i) => ingredientId !== null && steps[i]!.uses.some((u) => u.ingredientId === ingredientId))
  if (byUse !== undefined) return byUse
  if (needle !== '') {
    const byText = candidates.find((i) => new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(fold(steps[i]!.text)))
    if (byText !== undefined) return byText
  }
  return candidates[0]!
}
