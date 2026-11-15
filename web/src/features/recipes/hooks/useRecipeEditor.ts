import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import {
  addLine,
  draftFromRecipe,
  draftToInput,
  emptyDraft,
  pickCreatedIngredient,
  pickIngredient,
  moveLine,
  rekeyDraft,
  removeLine,
  removeLineWithUndo,
  restoreLine,
  sameDraft,
  serverErrorKey,
  updateLine,
  validateDraft,
  type DraftErrors,
  type LineDraft,
  type RecipeDraft,
  type StepDraft,
} from '../lib/draft'
import { parseUnknownUnit, type UnitPrompt } from '../lib/unitPrompt'
import { renameOffer as renameOfferOf, syncReadyMealLine, type RenameOffer } from '../lib/readyMeal'
import { lostSlotRules, reconcileWholeMeal, validateCourses, withDefaultCourse } from '../lib/recipeCourses'
import type { CourseChoice } from '../../../lib/courses'
import type { TakeOverAsk } from '../../../lib/baseRecipes/types'
import { parseTakeOver } from '../../../lib/baseRecipes/takeOver'
import { refusalMessage } from '../../../lib/baseRecipes/refusals'
import { linkDraftLine, unlinkDraftLine } from '../lib/baseRecipe'
import { removeStepWithUndo, restoreStep } from '../lib/steps'
import { removeUseWithUndo, restoreUse } from '../lib/stepUses'
import type { CourseLoss, IngredientRef, Recipe } from '../types'

export interface UseRecipeEditor {
  draft: RecipeDraft
  setDraft: (next: RecipeDraft | ((d: RecipeDraft) => RecipeDraft)) => void
  /** Field path ('name', 'lines.1.quantity', ...) -> error code, from validateDraft or a 422 validation_failed. */
  errors: DraftErrors
  saving: boolean
  isLoading: boolean
  /** Set while the server asked for a Unit Conversion (422 unknown_unit). */
  unitPrompt: UnitPrompt | null
  /**
   * Validates, then POSTs (new) or PUTs (existing). Resolves with the saved Recipe, or null when
   * client validation failed, the server rejected a field (see `errors`) or a Unit Conversion is
   * needed (see `unitPrompt`). Network/other errors reject.
   */
  save: () => Promise<Recipe | null>
  /** Saves the Unit Conversion on the Ingredient, clears the prompt and saves the Recipe again. */
  answerUnitPrompt: (toBase: number) => Promise<Recipe | null>
  dismissUnitPrompt: () => void
  /** Ingredient lines: append a blank one, patch one by key, choose its Ingredient, remove it. */
  addLine: () => void
  updateLine: (key: string, patch: Partial<LineDraft>) => void
  pickIngredient: (key: string, ingredient: IngredientRef) => void
  /** SAFE-10: removes the line and returns its Undo (puts it back at its index); null for an unknown key. */
  removeLine: (key: string) => (() => void) | null
  /** SAFE-10: removes the Step at `index` and returns its Undo ("After step N" references come back too); null out of range. */
  removeStep: (index: number) => (() => void) | null
  /** SAFE-10: removes use `useIndex` of Step `stepIndex` and returns its Undo; null for an unknown use. */
  removeUse: (stepIndex: number, useIndex: number) => (() => void) | null
  /** Drag handles and the line actions menu: move the line at `from` to `to` (lib/draft.moveLine). */
  moveLine: (from: number, to: number) => void
  /** Replaces the Steps (the StepsEditor computes the new list with lib/steps). */
  setSteps: (steps: StepDraft[]) => void
  /** R14: choose an Ingredient made from the picker (keeps the line's unit, see lib/draft.pickCreatedIngredient). */
  pickCreatedIngredient: (key: string, ingredient: IngredientRef) => void
  /** R14: the rename question for a stored Ready Meal whose name changed (lib/readyMeal.renameOffer); null otherwise. Stays set after a successful save so the screen can ask. */
  renameOffer: RenameOffer | null
  /** R14: PATCHes the linked Ingredient to the new name (recipesApi.renameIngredient), refreshes ['ingredients']. Rejects on failure; the Recipe stays saved. */
  renameLinkedIngredient: () => Promise<void>
  /** CRS E2: the Slot Rules a save would remove because the draft takes a Course off (lib/recipeCourses.lostSlotRules); null when none. */
  courseLoss: CourseLoss | null
  /**
   * BR-D: set while a save was answered 409 `base_recipe_take_over` (a new Base recipe, or a rename, named like a plain Ingredient). Nothing is saved until the answer.
   */
  takeOverAsk: TakeOverAsk | null
  /** BR-D: Yes/No: saves again with `takeOver` true/false (lib/draft sends it); resolves like `save`. */
  answerTakeOver: (yes: boolean) => Promise<Recipe | null>
  /** BR-D round 3: the kind the stored Recipe has ('plannable' | 'base'), null for a Recipe not saved yet. The screen compares it with the draft on Save. */
  storedKind: 'plannable' | 'base' | null
  /** BR-D: Escape on the ask: forgets it, saves nothing. */
  cancelTakeOver: () => void
  /**
   * BR-D: the words of a Base recipe refusal that has no field to sit on, or whose words need the server's path: a cycle ("Roux calls for Béchamel, which calls for Roux",
   * with the line also in `errors['lines.1']`), a name taken (also `errors.name`). Null when none. Cleared by the next save.
   */
  refusal: string | null
  /** BR-D: "Link to a Base recipe" on a draft line (lib/baseRecipe.linkDraftLine); the link is saved with the Recipe. */
  linkLine: (key: string, base: { id: number; name: string; ingredientId: number }) => void
  /** BR-D: "Use as a plain Ingredient" on a draft line (lib/baseRecipe.unlinkDraftLine). */
  unlinkLine: (key: string, plain: IngredientRef) => void
  /**
   * SAFE-01: the draft differs from what the editor was opened with (lib/draft.sameDraft): the stored Recipe, or for a new one an
   * empty draft with the main Course. A successful save (also after the Unit Conversion prompt or the take-over answer) makes it clean.
   */
  dirty: boolean
  /** The baseline is known (a stored Recipe loaded; a new Recipe at once). The reload draft is not read or written before it. */
  ready: boolean
  /** The stored Recipe's updatedAt; null for a new Recipe. */
  storedUpdatedAt: string | null
  /** The stored Recipe's name (the leave dialog's "Your changes to <name>"); null for a new Recipe. */
  storedName: string | null
  /** Puts a kept reload draft in the editor (fresh keys); the baseline stays, so it is dirty. */
  restoreDraft: (draft: RecipeDraft) => void
  /** Back to the baseline: the stored Recipe, or the empty new one. */
  resetDraft: () => void
}

/** The value at a draft error path ('name', 'lines.1.quantity'), as text; a path past the draft gives its deepest known part. */
function valueAt(draft: RecipeDraft, path: string): string {
  let at: unknown = draft
  for (const part of path.split('.')) {
    const next = at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[part] : undefined
    if (next === undefined) break
    at = next
  }
  return JSON.stringify(at)
}

const NO_INGREDIENTS: readonly IngredientRef[] = []
const NO_COURSES: readonly CourseChoice[] = []

/**
 * `recipeId` undefined = a new Recipe; otherwise the draft loads from ['recipes', id].
 * R14: `ingredients` (every Ingredient, as the screen's picker has them) feeds the Ready Meal rule: after each change of the name, the Ready Meal flag
 * or the lines the draft goes through lib/readyMeal.syncReadyMealLine. draftToInput sends `lines: []` for a pending auto line (the server creates the Ingredient).
 */
export function useRecipeEditor(
  recipeId?: number,
  ingredients: readonly IngredientRef[] = NO_INGREDIENTS,
  courses: readonly CourseChoice[] = NO_COURSES,
): UseRecipeEditor {
  const client = useQueryClient()
  const existing = useQuery({
    queryKey: ['recipes', recipeId],
    queryFn: () => recipesApi.get(recipeId!),
    enabled: recipeId !== undefined,
  })
  // CRS E2: the Slot Rules and Meal Slot names a save may take away (only for a stored Recipe; a failed read leaves courseLoss null).
  const rulesQuery = useQuery({
    queryKey: ['recipes', 'slot-rules'],
    queryFn: () => recipesApi.slotRules(),
    enabled: recipeId !== undefined,
  })
  const slotsQuery = useQuery({
    queryKey: ['recipes', 'slot-names'],
    queryFn: () => recipesApi.mealSlots(),
    enabled: recipeId !== undefined,
  })
  const defaulted = useRef(false)

  const [draft, setDraftState] = useState<RecipeDraft>(() => emptyDraft())
  // SAFE-01: what "clean" means. A new Recipe's is known at once; a stored one's when it loads.
  const [baseline, setBaseline] = useState<RecipeDraft | null>(() => (recipeId === undefined ? emptyDraft() : null))
  // SAFE-04: errors appear on Save; after a failed Save the fields re-check as they change. A server field error stays until its value changes.
  const [checking, setChecking] = useState(false)
  const [serverError, setServerError] = useState<{ key: string; reason: string; at: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [unitPrompt, setUnitPrompt] = useState<UnitPrompt | null>(null)
  const [keptOffer, setKeptOffer] = useState<RenameOffer | null>(null)
  const [takeOverAsk, setTakeOverAsk] = useState<TakeOverAsk | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const loaded = useRef(false)
  const known = useRef(ingredients)
  known.current = ingredients

  // The stored Recipe fills the draft once; later refetches must not overwrite what the User typed.
  useEffect(() => {
    if (existing.data && !loaded.current) {
      loaded.current = true
      const opened = draftFromRecipe(existing.data)
      setDraftState(opened)
      setBaseline(opened)
    }
  }, [existing.data])

  // A new Recipe starts with the main Course, once the household's Courses are known; a choice the User makes is never overwritten.
  useEffect(() => {
    if (recipeId !== undefined || defaulted.current || courses.length === 0) return
    defaulted.current = true
    setDraftState((d) => withDefaultCourse(d, courses))
    setBaseline((b) => (b ? withDefaultCourse(b, courses) : b))
  }, [recipeId, courses])

  // Every change goes through the Ready Meal rule, which keeps the one pack line in step with the name and the flag,
  // then the Whole meal rule (CRS E2).
  const setDraft = (next: RecipeDraft | ((d: RecipeDraft) => RecipeDraft)) => {
    setDraftState((d) => reconcileWholeMeal(d, syncReadyMealLine(typeof next === 'function' ? next(d) : next, known.current), courses))
  }

  // Ingredients that load (or are created) after the box was ticked can turn the pending line into a selected one.
  useEffect(() => {
    setDraftState((d) => syncReadyMealLine(d, ingredients))
    setBaseline((b) => (b ? syncReadyMealLine(b, ingredients) : b))
  }, [ingredients])

  const latest = useRef(draft)
  latest.current = draft
  const dirty = baseline !== null && !sameDraft(draft, baseline)

  const clientErrorsOf = (d: RecipeDraft): DraftErrors => ({ ...validateDraft(d), ...(courses.length > 0 ? validateCourses(d) : {}) })
  const errors = useMemo<DraftErrors>(() => {
    const out: DraftErrors = checking ? clientErrorsOf(draft) : {}
    if (serverError && valueAt(draft, serverError.key) === serverError.at) out[serverError.key] = serverError.reason
    return out
    // clientErrorsOf reads only `courses`
  }, [checking, serverError, draft, courses])

  const liveOffer = renameOfferOf(existing.data, draft, ingredients)
  // BR-D round 3: the kind the stored Recipe has; the screen compares it with the draft on Save (the switch applies there).
  const storedKind: 'plannable' | 'base' | null = existing.data ? (existing.data.baseRecipe ? 'base' : 'plannable') : null

  const courseLoss = recipeId === undefined || !rulesQuery.data || !slotsQuery.data
    ? null
    : lostSlotRules({
        recipeId,
        storedIds: existing.data?.courses.map((c) => c.id) ?? [],
        draftIds: draft.courseIds,
        rules: rulesQuery.data,
        slots: slotsQuery.data,
        courses,
      })

  const refreshLists = () => {
    void client.invalidateQueries({ queryKey: ['recipes'] })
    void client.invalidateQueries({ queryKey: ['tags'] })
  }

  const submit = async (d: RecipeDraft): Promise<Recipe | null> => {
    // CRS E2: the Courses check waits until the household's Courses are known; the server is the backstop.
    const clientErrors = clientErrorsOf(d)
    setServerError(null)
    setRefusal(null)
    if (Object.keys(clientErrors).length > 0) {
      setChecking(true)
      return null
    }
    const input = draftToInput(d)
    setSaving(true)
    try {
      const saved = recipeId === undefined ? await recipesApi.create(input) : await recipesApi.replace(recipeId, input)
      setChecking(false)
      setBaseline({ ...d, takeOver: undefined })
      setUnitPrompt(null)
      setTakeOverAsk(null)
      setKeptOffer(renameOfferOf(existing.data, d, known.current))
      refreshLists()
      void client.invalidateQueries({ queryKey: ['ingredients'] }) // a Ready Meal may have made its Ingredient
      return saved
    } catch (err) {
      const prompt = parseUnknownUnit(err)
      if (prompt) {
        setUnitPrompt(prompt)
        return null
      }
      // BR-D: a same-name plain Ingredient is asked about, nothing is saved until the answer.
      const ask = parseTakeOver(err)
      if (ask) {
        setTakeOverAsk(ask)
        return null
      }
      if (err instanceof ApiError && err.code === 'validation_failed' && typeof err.details.field === 'string') {
        const reason = typeof err.details.reason === 'string' ? err.details.reason : err.message
        const key = serverErrorKey(err.details.field, reason)
        setChecking(true)
        setServerError({ key, reason, at: valueAt(d, key) })
        setRefusal(refusalMessage(err))
        return null
      }
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    draft,
    setDraft,
    errors,
    saving,
    isLoading: recipeId !== undefined && existing.isLoading,
    storedKind,
    unitPrompt,
    save: () => submit(draft),
    answerUnitPrompt: async (toBase) => {
      const prompt = unitPrompt
      if (!prompt) return null
      await recipesApi.saveConversion(prompt.ingredientId, prompt.unit, toBase)
      void client.invalidateQueries({ queryKey: ['ingredients'] })
      setUnitPrompt(null)
      return submit(draft)
    },
    dismissUnitPrompt: () => setUnitPrompt(null),
    addLine: () => setDraft(addLine),
    updateLine: (key, patch) => setDraft((d) => updateLine(d, key, patch)),
    pickIngredient: (key, ingredient) => setDraft((d) => pickIngredient(d, key, ingredient)),
    removeLine: (key) => {
      const { removed } = removeLineWithUndo(latest.current, key)
      if (!removed) return null
      setDraft((d) => removeLine(d, key))
      return () => setDraft((d) => restoreLine(d, removed))
    },
    removeStep: (index) => {
      const { removed } = removeStepWithUndo(latest.current.steps, index)
      if (!removed) return null
      setDraft((d) => ({ ...d, steps: removeStepWithUndo(d.steps, index).steps }))
      return () => setDraft((d) => ({ ...d, steps: restoreStep(d.steps, removed) }))
    },
    removeUse: (stepIndex, useIndex) => {
      const { removed } = removeUseWithUndo(latest.current.steps, stepIndex, useIndex)
      if (!removed) return null
      setDraft((d) => ({ ...d, steps: removeUseWithUndo(d.steps, stepIndex, useIndex).steps }))
      return () => setDraft((d) => ({ ...d, steps: restoreUse(d.steps, removed) }))
    },
    moveLine: (from, to) => setDraft((d) => moveLine(d, from, to)),
    setSteps: (steps) => setDraft((d) => ({ ...d, steps })),
    pickCreatedIngredient: (key, ingredient) => setDraft((d) => pickCreatedIngredient(d, key, ingredient)),
    courseLoss,
    takeOverAsk,
    answerTakeOver: (yes) => submit({ ...draft, takeOver: yes }),
    cancelTakeOver: () => setTakeOverAsk(null),
    refusal,
    linkLine: (key, base) => setDraft((d) => linkDraftLine(d, key, base)),
    unlinkLine: (key, plain) => setDraft((d) => unlinkDraftLine(d, key, plain)),
    dirty,
    ready: baseline !== null,
    storedUpdatedAt: existing.data?.updatedAt ?? null,
    storedName: existing.data?.name ?? null,
    restoreDraft: (kept) => setDraftState(rekeyDraft(kept)),
    resetDraft: () => {
      if (baseline) setDraftState(baseline)
      setChecking(false)
      setServerError(null)
    },
    renameOffer: keptOffer ?? liveOffer,
    renameLinkedIngredient: async () => {
      const offer = keptOffer ?? liveOffer
      if (!offer) return
      await recipesApi.renameIngredient(offer.ingredientId, offer.to)
      setKeptOffer(null)
      void client.invalidateQueries({ queryKey: ['ingredients'] })
      void client.invalidateQueries({ queryKey: ['recipes'] })
    },
  }
}
