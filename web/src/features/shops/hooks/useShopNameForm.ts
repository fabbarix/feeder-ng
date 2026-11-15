import { useRef, useState } from 'react'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { errorText } from '../../products/lib/productForm'
import { strings } from '../strings'

/** The message for a Shop name, or null when it can be saved (SAFE-04: the button is never disabled for want of a name). */
export function shopNameError(name: string): string | null {
  return name.trim() === '' ? strings.errShopName : null
}

/**
 * A Shop name form (Add Shop, Rename): the name's error is at the field and takes focus after Save; a failure of the save itself is
 * the form's error (FormError).
 */
export function useShopNameForm(initial: string, save: (name: string) => Promise<unknown>) {
  const formRef = useRef<HTMLFormElement>(null)
  const [name, setNameState] = useState(initial)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submits, setSubmits] = useState(0)
  useFocusFirstInvalid(formRef, { name: nameError }, submits)

  const setName = (value: string) => {
    setNameState(value)
    setNameError(null)
  }
  const submit = async () => {
    const invalid = shopNameError(name)
    setNameError(invalid)
    setFormError(null)
    setSubmits((n) => n + 1)
    if (invalid) return
    setSaving(true)
    try {
      await save(name.trim())
    } catch (e) {
      setFormError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  return { formRef, name, setName, nameError, formError, saving, submit }
}
