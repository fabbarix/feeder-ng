// B9-48 (SET-05, SAFE-04): the Rename sheet's form: the typed name, its error at the field, a refusal as the form's FormError.
import { useState } from 'react'
import { ApiError } from '../../../lib/http'
import { errorMessage } from '../lib/errorMessage'
import { wordsFor } from '../lib/kind'
import { tidyName } from '../lib/names'
import { strings } from '../strings'
import type { IngredientKind } from '../types'

export interface UseRenameForm {
  text: string
  setText: (text: string) => void
  /** The Name field's error: blank, or the name is taken. */
  error: string | undefined
  /** A refusal with no field of its own. */
  failure: string | null
  saving: boolean
  /** Grows when a submit leaves a field error (useFocusFirstInvalid's trigger). */
  submitCount: number
  /** Blank: error. Unchanged: only closes. Otherwise saves the tidied name and closes; a refusal keeps the sheet open. */
  submit: () => Promise<void>
}

export function useRenameForm(kind: IngredientKind, name: string, onSave: (name: string) => Promise<unknown>, onClose: () => void): UseRenameForm {
  const [text, setTextState] = useState(name)
  const [error, setError] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)

  const submit = async () => {
    const next = tidyName(text)
    setFailure(null)
    if (next === '') {
      setError(wordsFor(kind).nameRequired)
      setSubmitCount((n) => n + 1)
      return
    }
    if (next === name) {
      onClose()
      return
    }
    setError(undefined)
    setSaving(true)
    try {
      await onSave(next)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'name_taken') {
        setError(strings.nameTaken)
        setSubmitCount((n) => n + 1) // the field error is known now: focus goes to it
      } else setFailure(errorMessage(e))
      return
    } finally {
      setSaving(false)
    }
    onClose()
  }

  return {
    text,
    setText: (value) => {
      setTextState(value)
      setError(undefined)
      setFailure(null)
    },
    error,
    failure,
    saving,
    submitCount,
    submit,
  }
}
