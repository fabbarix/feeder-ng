import { useRef, useState } from 'react'
import { useOptionalConfirm } from '../../ui/ConfirmDialog'
import { useOptionalToast } from '../../ui/Toast'
import { baseRecipesApi } from './api'
import { convertConfirm } from './convertConfirm'
import { displayBaseName } from './matchKey'
import { parseTakeOver } from './takeOver'
import { refusalMessage } from './refusals'
import { baseRecipeLinkStrings } from './strings'
import { yieldFromLine } from './yield'
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
  /** Escape or Cancel on the take-over ask: forgets it, nothing is linked. */
  cancelTakeOver: () => void
}

interface Pending {
  line: SavedLine
  name: string
}

/** The line actions of a saved Recipe (the detail): Link to a Base recipe, Use as a plain Ingredient. `onChanged` runs after every change so the screen refetches. */
export function useLineLink(opts: { recipeId: number; onChanged?: () => void }): UseLineLink {
  const { recipeId, onChanged } = opts
  const toast = useOptionalToast()
  const confirm = useOptionalConfirm()
  const [takeOverAsk, setTakeOverAsk] = useState<TakeOverAsk | null>(null)
  const [askName, setAskName] = useState<string | null>(null)
  const [unitPrompt, setUnitPrompt] = useState<LinkUnitPrompt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const askFor = useRef<Pending | null>(null)
  const linkFor = useRef<{ line: SavedLine; base: { id: number; name: string } } | null>(null)

  const fail = (err: unknown): LinkOutcome => {
    setError(refusalMessage(err) ?? baseRecipeLinkStrings.couldNotLink)
    return 'failed'
  }

  const undoLink = async (lineId: number, back: () => Promise<unknown>) => {
    void lineId
    await back()
    onChanged?.()
  }

  /** POST lines/{id}/base, with the unit prompt on a unit the Base recipe's Ingredient cannot convert. */
  const linkExisting = async (line: SavedLine, base: { id: number; name: string }): Promise<LinkOutcome> => {
    linkFor.current = { line, base }
    try {
      await baseRecipesApi.linkLine(recipeId, line.id, base.id)
    } catch (err) {
      const e = err as { code?: string; details?: Record<string, unknown> } & Error
      if (e.code === 'unknown_unit' && e.details) {
        setUnitPrompt({ ingredientId: Number(e.details.ingredientId), unit: String(e.details.unit ?? line.unit), baseUnit: String(e.details.baseUnit ?? '') })
        return 'unit_prompt'
      }
      return fail(err)
    }
    setError(null)
    onChanged?.()
    toast?.show(baseRecipeLinkStrings.linkedTo(base.name), {
      actionLabel: baseRecipeLinkStrings.undo,
      onAction: () => void undoLink(line.id, () => baseRecipesApi.unlinkLine(recipeId, line.id)).catch(() => undefined),
    })
    return 'linked'
  }

  /** POST /api/recipes as a new Base recipe, then the link. `takeOver` answers the take-over ask. */
  const createAndLink = async (pending: Pending, takeOver?: boolean): Promise<LinkOutcome> => {
    const y = yieldFromLine(pending.line.quantity, pending.line.unit)
    const body = {
      name: displayBaseName(pending.name),
      description: '',
      yield: y.yield,
      yieldUnit: y.yieldUnit,
      baseRecipe: true,
      readyMeal: false,
      courseIds: [],
      wholeMeal: false,
      tags: [],
      cooldownDays: null,
      leftoverUseByDays: null,
      frozenUseByDays: null,
      reheatMinutes: null,
      source: { url: '', attribution: '' },
      image: '',
      lines: [],
      steps: [],
      ...(takeOver === undefined ? {} : { takeOver }),
    }
    let created: { id: number; name: string }
    try {
      created = await baseRecipesApi.createBase(body as never)
    } catch (err) {
      const ask = parseTakeOver(err)
      if (ask) {
        askFor.current = pending
        setTakeOverAsk(ask)
        setAskName(body.name)
        return 'asked'
      }
      return fail(err)
    }
    setTakeOverAsk(null)
    setAskName(null)
    askFor.current = null
    if (takeOver === true) {
      // The take-over made this line a Base recipe line already.
      onChanged?.()
      toast?.show(baseRecipeLinkStrings.linkedTo(created.name ?? body.name), {})
      return 'linked'
    }
    return linkExisting(pending.line, { id: created.id, name: created.name ?? body.name })
  }

  const convert = async (line: SavedLine, recipe: { id: number; name: string }): Promise<LinkOutcome> => {
    try {
      const plan = await baseRecipesApi.toBasePlan(recipe.id)
      const c = convertConfirm(recipe.name, plan)
      const yes = confirm ? await confirm.confirm({ title: c.title, body: c.body, confirmLabel: c.confirmLabel }) : false
      if (!yes) return 'cancelled'
      const y = yieldFromLine(line.quantity, line.unit)
      await baseRecipesApi.toBase(recipe.id, { yield: y.yield, yieldUnit: y.yieldUnit })
    } catch (err) {
      return fail(err)
    }
    return linkExisting(line, recipe)
  }

  const linkTo = async (line: SavedLine, choice: LinkChoice): Promise<LinkOutcome> => {
    setError(null)
    if (choice.kind === 'existing') return linkExisting(line, choice.baseRecipe)
    if (choice.kind === 'new') return createAndLink({ line, name: choice.name })
    return convert(line, choice.recipe)
  }

  const answerTakeOver = async (yes: boolean): Promise<LinkOutcome> => {
    const pending = askFor.current
    if (!pending) return 'failed'
    return createAndLink(pending, yes)
  }

  const answerUnitPrompt = async (toBase: number): Promise<LinkOutcome> => {
    const prompt = unitPrompt
    const again = linkFor.current
    if (!prompt || !again) return 'failed'
    try {
      await baseRecipesApi.saveConversion(prompt.ingredientId, prompt.unit, toBase)
    } catch (err) {
      return fail(err)
    }
    setUnitPrompt(null)
    return linkExisting(again.line, again.base)
  }

  const useAsPlain = async (line: SavedLine): Promise<'done' | 'pick' | 'failed'> => {
    if (line.linkedFromIngredientId === null || line.linkedFromIngredientId === undefined || !line.baseRecipe) return 'pick'
    const base = line.baseRecipe
    try {
      await baseRecipesApi.unlinkLine(recipeId, line.id)
    } catch (err) {
      fail(err)
      return 'failed'
    }
    setError(null)
    onChanged?.()
    toast?.show(baseRecipeLinkStrings.plainIngredient(base.name), {
      actionLabel: baseRecipeLinkStrings.undo,
      onAction: () => void undoLink(line.id, () => baseRecipesApi.linkLine(recipeId, line.id, base.id)).catch(() => undefined),
    })
    return 'done'
  }

  return {
    linkTo,
    useAsPlain,
    takeOverAsk,
    askName,
    answerTakeOver,
    unitPrompt,
    answerUnitPrompt,
    dismissUnitPrompt: () => setUnitPrompt(null),
    error,
    cancelTakeOver: () => {
      askFor.current = null
      setTakeOverAsk(null)
      setAskName(null)
    },
  }
}
