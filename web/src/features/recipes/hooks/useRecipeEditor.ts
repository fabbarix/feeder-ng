import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
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
  removeLine,
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
  removeLine: (key: string) => void
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
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saving, setSaving] = useState(false)
  const [unitPrompt, setUnitPrompt] = useState<UnitPrompt | null>(null)
  const [keptOffer, setKeptOffer] = useState<RenameOffer | null>(null)
  const loaded = useRef(false)
  const known = useRef(ingredients)
  known.current = ingredients

  // The stored Recipe fills the draft once; later refetches must not overwrite what the User typed.
  useEffect(() => {
    if (existing.data && !loaded.current) {
      loaded.current = true
      setDraftState(draftFromRecipe(existing.data))
    }
  }, [existing.data])

  // A new Recipe starts with the main Course, once the household's Courses are known; a choice the User makes is never overwritten.
  useEffect(() => {
    if (recipeId !== undefined || defaulted.current || courses.length === 0) return
    defaulted.current = true
    setDraftState((d) => withDefaultCourse(d, courses))
  }, [recipeId, courses])

  // Every change goes through the Ready Meal rule, which keeps the one pack line in step with the name and the flag,
  // then the Whole meal rule (CRS E2).
  const setDraft = (next: RecipeDraft | ((d: RecipeDraft) => RecipeDraft)) => {
    setDraftState((d) => reconcileWholeMeal(d, syncReadyMealLine(typeof next === 'function' ? next(d) : next, known.current), courses))
  }

  // Ingredients that load (or are created) after the box was ticked can turn the pending line into a selected one.
  useEffect(() => {
    setDraftState((d) => syncReadyMealLine(d, ingredients))
  }, [ingredients])

  const liveOffer = renameOfferOf(existing.data, draft, ingredients)

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
    const clientErrors = { ...validateDraft(d), ...(courses.length > 0 ? validateCourses(d) : {}) }
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return null
    const input = draftToInput(d)
    setSaving(true)
    try {
      const saved = recipeId === undefined ? await recipesApi.create(input) : await recipesApi.replace(recipeId, input)
      setErrors({})
      setUnitPrompt(null)
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
      if (err instanceof ApiError && err.code === 'validation_failed' && typeof err.details.field === 'string') {
        const reason = typeof err.details.reason === 'string' ? err.details.reason : err.message
        setErrors({ [serverErrorKey(err.details.field, reason)]: reason })
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
    removeLine: (key) => setDraft((d) => removeLine(d, key)),
    moveLine: (from, to) => setDraft((d) => moveLine(d, from, to)),
    setSteps: (steps) => setDraft((d) => ({ ...d, steps })),
    pickCreatedIngredient: (key, ingredient) => setDraft((d) => pickCreatedIngredient(d, key, ingredient)),
    courseLoss,
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
