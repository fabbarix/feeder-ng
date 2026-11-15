// B9-48 (SET-05): the one draft behind the "Keeping" tile: Base Unit, Shelf Life, Frozen Shelf Life and Restock level, one Save.
import { useEffect, useRef, useState } from 'react'
import type { BaseUnit } from '../../../lib/units'
import { errorMessage } from '../lib/errorMessage'
import { isKeepingDirty, keepingDraft, keepingPatch, validateKeeping, type KeepingDraft, type KeepingErrors } from '../lib/keeping'
import { kindOf } from '../lib/kind'
import type { Ingredient, IngredientPatch } from '../types'

export interface UseKeepingForm {
  draft: KeepingDraft
  /** What the draft is compared with: the saved Ingredient (or, just after a save, what was sent). The row hints read it. */
  saved: Ingredient
  dirty: boolean
  /** From the last submit; each key clears when its field changes. */
  errors: KeepingErrors
  /** A server refusal in words (no field of its own): the form's FormError. */
  failure: string | null
  saving: boolean
  /** Grows on every submit that finds errors or runs (useFocusFirstInvalid's trigger). */
  submitCount: number
  setBaseUnit: (unit: BaseUnit) => void
  setShelfLife: (days: number | null) => void
  setFrozenShelfLife: (days: number | null) => void
  setRestockText: (text: string) => void
  /** Invalid: errors, nothing sent, false. Valid and dirty: ONE save, true. Clean: true. A refusal: failure, draft kept, false. */
  submit: () => Promise<boolean>
  /** The draft goes back to what is saved. */
  cancel: () => void
}

export function useKeepingForm(savedProp: Ingredient, save: (patch: IngredientPatch) => Promise<unknown>): UseKeepingForm {
  const savedKey = JSON.stringify(keepingDraft(savedProp))
  // Right after a save, what was sent counts as saved until the refreshed Ingredient arrives (a new savedKey drops it).
  const [justSaved, setJustSaved] = useState<{ forKey: string; base: Ingredient } | null>(null)
  const saved = justSaved && justSaved.forKey === savedKey ? justSaved.base : savedProp
  const [draft, setDraft] = useState<KeepingDraft>(() => keepingDraft(savedProp))
  const [errors, setErrors] = useState<KeepingErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)
  const dirty = isKeepingDirty(saved, draft)

  // While clean the draft follows what is saved (after a save, or another edit); while dirty the person's edits are kept.
  // "Clean" is judged against what was saved before this change, so it is remembered across renders.
  const followed = useRef<{ key: string; base: Ingredient; draft: KeepingDraft }>({ key: savedKey, base: saved, draft })
  useEffect(() => {
    const before = followed.current
    if (before.key !== savedKey && !isKeepingDirty(before.base, before.draft)) setDraft(keepingDraft(saved))
    followed.current = { key: savedKey, base: saved, draft }
  })

  const edit = (patch: Partial<KeepingDraft>, field?: keyof KeepingErrors) => {
    setDraft((d) => ({ ...d, ...patch }))
    setFailure(null)
    if (field) setErrors((e) => (e[field] === undefined ? e : { ...e, [field]: undefined }))
  }

  const submit = async (): Promise<boolean> => {
    const found = validateKeeping(draft, kindOf(saved))
    setErrors(found)
    setFailure(null)
    if (Object.values(found).some(Boolean)) {
      setSubmitCount((n) => n + 1)
      return false
    }
    if (!dirty) return true
    setSubmitCount((n) => n + 1)
    setSaving(true)
    const patch = keepingPatch(saved, draft)
    try {
      await save(patch)
    } catch (e) {
      setFailure(errorMessage(e))
      return false
    } finally {
      setSaving(false)
    }
    // Saved: the draft is what the server now has, so the form is clean even before the refreshed Ingredient arrives.
    setJustSaved({ forKey: savedKey, base: { ...saved, ...(patch as Partial<Ingredient>) } })
    return true
  }

  return {
    draft,
    saved,
    dirty,
    errors,
    failure,
    saving,
    submitCount,
    setBaseUnit: (baseUnit) => edit({ baseUnit }),
    setShelfLife: (shelfLifeDays) => edit({ shelfLifeDays }, 'shelfLife'),
    setFrozenShelfLife: (frozenShelfLifeDays) => edit({ frozenShelfLifeDays }, 'frozenShelfLife'),
    setRestockText: (restockText) => edit({ restockText }, 'restock'),
    submit,
    cancel: () => {
      setDraft(keepingDraft(saved))
      setErrors({})
      setFailure(null)
    },
  }
}
