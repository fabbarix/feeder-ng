import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import {
  addLine,
  draftFromRecipe,
  draftToInput,
  emptyDraft,
  pickIngredient,
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
import type { RenameOffer } from '../lib/readyMeal'
import type { IngredientRef, Recipe } from '../types'

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
  /** Replaces the Steps (the StepsEditor computes the new list with lib/steps). */
  setSteps: (steps: StepDraft[]) => void
  /** R14: choose an Ingredient made from the picker (keeps the line's unit, see lib/draft.pickCreatedIngredient). */
  pickCreatedIngredient: (key: string, ingredient: IngredientRef) => void
  /** R14: the rename question for a stored Ready Meal whose name changed (lib/readyMeal.renameOffer); null otherwise. Stays set after a successful save so the screen can ask. */
  renameOffer: RenameOffer | null
  /** R14: PATCHes the linked Ingredient to the new name (recipesApi.renameIngredient), refreshes ['ingredients']. Rejects on failure; the Recipe stays saved. */
  renameLinkedIngredient: () => Promise<void>
}

/**
 * `recipeId` undefined = a new Recipe; otherwise the draft loads from ['recipes', id].
 * R14: `ingredients` (every Ingredient, as the screen's picker has them) feeds the Ready Meal rule: after each change of the name, the Ready Meal flag
 * or the lines the draft goes through lib/readyMeal.syncReadyMealLine. draftToInput sends `lines: []` for a pending auto line (the server creates the Ingredient).
 */
export function useRecipeEditor(recipeId?: number, ingredients: readonly IngredientRef[] = []): UseRecipeEditor {
  void ingredients
  const client = useQueryClient()
  const existing = useQuery({
    queryKey: ['recipes', recipeId],
    queryFn: () => recipesApi.get(recipeId!),
    enabled: recipeId !== undefined,
  })

  const [draft, setDraftState] = useState<RecipeDraft>(() => emptyDraft())
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saving, setSaving] = useState(false)
  const [unitPrompt, setUnitPrompt] = useState<UnitPrompt | null>(null)
  const loaded = useRef(false)

  // The stored Recipe fills the draft once; later refetches must not overwrite what the User typed.
  useEffect(() => {
    if (existing.data && !loaded.current) {
      loaded.current = true
      setDraftState(draftFromRecipe(existing.data))
    }
  }, [existing.data])

  const setDraft = (next: RecipeDraft | ((d: RecipeDraft) => RecipeDraft)) => {
    setDraftState((d) => (typeof next === 'function' ? next(d) : next))
  }

  const refreshLists = () => {
    void client.invalidateQueries({ queryKey: ['recipes'] })
    void client.invalidateQueries({ queryKey: ['tags'] })
  }

  const submit = async (d: RecipeDraft): Promise<Recipe | null> => {
    const clientErrors = validateDraft(d)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return null
    const input = draftToInput(d)
    setSaving(true)
    try {
      const saved = recipeId === undefined ? await recipesApi.create(input) : await recipesApi.replace(recipeId, input)
      setErrors({})
      setUnitPrompt(null)
      refreshLists()
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
    setSteps: (steps) => setDraft((d) => ({ ...d, steps })),
    pickCreatedIngredient: (key, ingredient) => setDraft((d) => pickIngredient(d, key, ingredient)),
    renameOffer: null,
    renameLinkedIngredient: async () => {},
  }
}
