import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { recipesApi } from '../api'
import { draftFromRecipe, draftToInput, emptyDraft, serverErrorKey, validateDraft, type DraftErrors, type RecipeDraft } from '../lib/draft'
import { parseUnknownUnit, type UnitPrompt } from '../lib/unitPrompt'
import type { Recipe } from '../types'

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
}

/** `recipeId` undefined = a new Recipe; otherwise the draft loads from ['recipes', id]. */
export function useRecipeEditor(recipeId?: number): UseRecipeEditor {
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
  }
}
