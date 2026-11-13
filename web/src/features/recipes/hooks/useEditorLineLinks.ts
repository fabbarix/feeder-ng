import { useRef, useState } from 'react'
import { useOptionalConfirm } from '../../../ui/ConfirmDialog'
import { baseRecipesApi } from '../../../lib/baseRecipes/api'
import { convertConfirm } from '../../../lib/baseRecipes/convertConfirm'
import { newBaseRecipeInput } from '../../../lib/baseRecipes/newBase'
import { parseTakeOver } from '../../../lib/baseRecipes/takeOver'
import { refusalMessage } from '../../../lib/baseRecipes/refusals'
import { baseRecipeLinkStrings } from '../../../lib/baseRecipes/strings'
import type { LinkChoice } from '../../../lib/baseRecipes/useLineLink'
import { yieldFromLine } from '../../../lib/baseRecipes/yield'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'
import { recipesApi } from '../api'
import { needsConversion } from '../lib/lineUnits'
import { parseNumber, type LineDraft } from '../lib/draft'
import type { UnitPrompt } from '../lib/unitPrompt'
import type { IngredientRef } from '../types'

/** What a draft line is linked to: a Base recipe's id, name and Ingredient id (the draft keeps the Base recipe's units). */
export interface EditorBase {
  id: number
  name: string
  ingredientId: number
}

export interface UseEditorLineLinks {
  /** Links the draft line `line` to the choice (existing, new, or convert). A link that needs a Unit Conversion first asks (unitPrompt). */
  linkTo: (line: LineDraft, choice: LinkChoice) => Promise<void>
  /** The take-over ask of a new Base recipe named like a plain Ingredient; null when none. */
  takeOverAsk: TakeOverAsk | null
  /** Yes/No: creates the Base recipe again with takeOver, then links the line. */
  answerTakeOver: (yes: boolean) => Promise<void>
  cancelTakeOver: () => void
  /** The inline Unit Conversion question of a link; null when none. */
  unitPrompt: UnitPrompt | null
  answerUnitPrompt: (toBase: number) => Promise<void>
  dismissUnitPrompt: () => void
  /** The line key the Base recipe picker is open for; null when closed. */
  pickerKey: string | null
  openPicker: (key: string) => void
  closePicker: () => void
  /** The line key the plain Ingredient picker is open for (a Base recipe line with nothing remembered); null when closed. */
  plainKey: string | null
  openPlain: (key: string) => void
  closePlain: () => void
  choosePlain: (ingredient: IngredientRef) => void
  /**
   * "Use as a plain Ingredient" on a draft Base recipe line: back to the remembered Ingredient (`linkedFromIngredientId`) when `ingredientOf` still knows it,
   * else (nothing remembered, or it is gone) opens the plain Ingredient dialog for that line (`plainKey`).
   */
  asPlain: (line: LineDraft) => void
  /** The new Base recipe's name the ask is about. */
  askName: string
  /** Words for the last failure, or null. */
  error: string | null
}

interface Options {
  ingredientOf: (id: number) => IngredientRef | undefined
  linkLine: (key: string, base: EditorBase) => void
  unlinkLine: (key: string, plain: IngredientRef) => void
}

/** The editor's Base recipe links (design §3.7, §3.2, §3.6): nothing is saved here; the draft line is linked and the Recipe saves with it. */
export function useEditorLineLinks(opts: Options): UseEditorLineLinks {
  const confirm = useOptionalConfirm()
  const [takeOverAsk, setTakeOverAsk] = useState<TakeOverAsk | null>(null)
  const [unitPrompt, setUnitPrompt] = useState<UnitPrompt | null>(null)
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  const [plainKey, setPlainKey] = useState<string | null>(null)
  const [askName, setAskName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pendingNew = useRef<{ line: LineDraft; name: string } | null>(null)
  const pendingLink = useRef<{ key: string; base: EditorBase } | null>(null)

  const fail = (err: unknown) => setError(refusalMessage(err) ?? baseRecipeLinkStrings.couldNotLink)

  /** Links an existing Base recipe; asks for the Unit Conversion first when the line's unit does not convert to the Ingredient's Base Unit. */
  const linkExisting = (line: LineDraft, base: EditorBase) => {
    const ingredient = opts.ingredientOf(base.ingredientId)
    if (ingredient && needsConversion(line.unit, ingredient)) {
      pendingLink.current = { key: line.key, base }
      setUnitPrompt({
        field: '',
        lineIndex: null,
        useRef: null,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        unit: line.unit,
        baseUnit: ingredient.baseUnit,
      })
      return
    }
    opts.linkLine(line.key, base)
  }

  /** POST /api/recipes as a new Base recipe from the line: a same-name Ingredient asks first (409 take-over). */
  const createNew = async (line: LineDraft, name: string, takeOver?: boolean) => {
    let created: { id: number; name: string; baseIngredientId?: number }
    try {
      created = await baseRecipesApi.createBase(newBaseRecipeInput(name, parseNumber(line.quantity) ?? 0, line.unit, takeOver))
    } catch (err) {
      const ask = parseTakeOver(err)
      if (ask) {
        pendingNew.current = { line, name }
        setAskName(name)
        setTakeOverAsk(ask)
        return
      }
      fail(err)
      return
    }
    pendingNew.current = null
    setTakeOverAsk(null)
    setAskName('')
    opts.linkLine(line.key, { id: created.id, name: created.name, ingredientId: created.baseIngredientId ?? 0 })
  }

  /** Turns a plannable Recipe into a Base recipe (dry run, the P6 confirm, to-base with the line's Yield), then links the line. */
  const convert = async (line: LineDraft, recipe: { id: number; name: string }) => {
    let plan
    try {
      plan = await baseRecipesApi.toBasePlan(recipe.id)
    } catch (err) {
      fail(err)
      return
    }
    const c = convertConfirm(recipe.name, plan)
    const yes = confirm ? await confirm.confirm({ title: c.title, body: c.body, confirmLabel: c.confirmLabel }) : false
    if (!yes) return
    const y = yieldFromLine(parseNumber(line.quantity) ?? 0, line.unit)
    try {
      const saved = await baseRecipesApi.toBase(recipe.id, { yield: y.yield, yieldUnit: y.yieldUnit })
      opts.linkLine(line.key, { id: recipe.id, name: recipe.name, ingredientId: saved.baseIngredientId ?? 0 })
    } catch (err) {
      fail(err)
    }
  }

  const linkTo = async (line: LineDraft, choice: LinkChoice) => {
    setError(null)
    if (choice.kind === 'convert') return convert(line, choice.recipe)
    if (choice.kind === 'new') return createNew(line, choice.name)
    try {
      const full = await recipesApi.get(choice.baseRecipe.id)
      linkExisting(line, { id: choice.baseRecipe.id, name: choice.baseRecipe.name, ingredientId: full.baseIngredientId ?? 0 })
    } catch (err) {
      fail(err)
    }
  }

  return {
    linkTo,
    takeOverAsk,
    askName,
    answerTakeOver: async (yes) => {
      const pending = pendingNew.current
      if (!pending) return
      await createNew(pending.line, pending.name, yes)
    },
    cancelTakeOver: () => {
      pendingNew.current = null
      setTakeOverAsk(null)
      setAskName('')
    },
    unitPrompt,
    answerUnitPrompt: async (toBase) => {
      const prompt = unitPrompt
      const pending = pendingLink.current
      if (!prompt || !pending) return
      try {
        await baseRecipesApi.saveConversion(prompt.ingredientId, prompt.unit, toBase)
      } catch (err) {
        fail(err)
        return
      }
      setUnitPrompt(null)
      pendingLink.current = null
      opts.linkLine(pending.key, pending.base)
    },
    dismissUnitPrompt: () => {
      pendingLink.current = null
      setUnitPrompt(null)
    },
    pickerKey,
    openPicker: (key) => setPickerKey(key),
    closePicker: () => setPickerKey(null),
    plainKey,
    openPlain: (key) => setPlainKey(key),
    closePlain: () => setPlainKey(null),
    choosePlain: (ingredient) => {
      if (plainKey !== null) opts.unlinkLine(plainKey, ingredient)
      setPlainKey(null)
    },
    asPlain: () => {
      throw new Error('BR-D: not implemented')
    },
    error,
  }
}
