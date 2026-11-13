import type { TakeOverAsk } from './types'

/** What a line is linked to (BaseRecipePicker's choice). */
export type LinkChoice =
  | { kind: 'existing'; baseRecipe: { id: number; name: string } }
  /** "Add "Béchamel" as a new Base recipe": created with the line's amount and unit as Yield (yieldFromLine) and no Ingredients. */
  | { kind: 'new'; name: string }
  /** A plannable Recipe made a Base recipe first (the P6 confirm). */
  | { kind: 'convert'; recipe: { id: number; name: string } }

/** The saved line being acted on. */
export interface SavedLine {
  id: number
  ingredientName: string
  quantity: number
  unit: string
  /** The plain Ingredient it was linked from; null/absent for a take-over line. */
  linkedFromIngredientId?: number | null
  /** The Base recipe, for a Base recipe line. */
  baseRecipe?: { id: number; name: string } | null
}

/** The inline Unit Conversion question of a link whose unit the Base recipe's Ingredient cannot convert (422 unknown_unit, details ingredientId, unit, baseUnit; `field` may be absent). */
export interface LinkUnitPrompt {
  ingredientId: number
  unit: string
  baseUnit: string
}

export type LinkOutcome = 'linked' | 'cancelled' | 'asked' | 'unit_prompt' | 'failed'

export interface UseLineLink {
  /** Links the line. See hooks tests: existing -> POST lines/{id}/base; new -> POST /api/recipes then link (a 409 base_recipe_take_over sets takeOverAsk and returns 'asked'); convert -> dry run, confirm naming what goes, to-base, then link. Success shows the Toast "Linked to Béchamel (Base recipe)." with Undo. */
  linkTo: (line: SavedLine, choice: LinkChoice) => Promise<LinkOutcome>
  /** Use as a plain Ingredient: DELETE lines/{id}/base, Toast "<Béchamel> is a plain Ingredient on this line." with Undo (links back). A line with no linkedFromIngredientId makes no request and returns 'pick' (the caller opens the ordinary Ingredient picker). */
  useAsPlain: (line: SavedLine) => Promise<'done' | 'pick' | 'failed'>
  /** The take-over ask while the User has not answered it; null otherwise. */
  takeOverAsk: TakeOverAsk | null
  /** The new Base recipe's name the ask is about. */
  askName: string | null
  /** Yes/No: creates the Base recipe again with takeOver true/false; No then links the line (Yes needs no link: the take-over made it a Base recipe line). */
  answerTakeOver: (yes: boolean) => Promise<LinkOutcome>
  /** Set after 'unit_prompt'. */
  unitPrompt: LinkUnitPrompt | null
  /** Saves the Unit Conversion (PUT /api/ingredients/{id}/conversions/{unit} { toBase }), clears the prompt and links again; resolves with that outcome. */
  answerUnitPrompt: (toBase: number) => Promise<LinkOutcome>
  dismissUnitPrompt: () => void
  /** Words for the last failure (refusalMessage or the generic text), or null. */
  error: string | null
}

/** The line actions of a saved Recipe (the detail): Link to a Base recipe, Use as a plain Ingredient. `onChanged` runs after every change so the screen refetches. */
export function useLineLink(opts: { recipeId: number; onChanged?: () => void }): UseLineLink {
  void opts
  throw new Error('BR-D: not implemented')
}
