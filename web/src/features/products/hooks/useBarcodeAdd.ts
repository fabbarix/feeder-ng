import { useRef, useState } from 'react'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { barcodeErrorFor, errorText, typedBarcodeError } from '../lib/productForm'
import { strings } from '../strings'

/**
 * The Barcode field of the Product page (SET-04, SAFE-04): an empty or mistyped code, and any refusal from the server, are the field's
 * error, which takes focus; a code that is added empties the field.
 */
export function useBarcodeAdd(onAdd: (raw: string) => Promise<void>) {
  const formRef = useRef<HTMLFormElement>(null)
  const [text, setTextState] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submits, setSubmits] = useState(0)
  useFocusFirstInvalid(formRef, { barcode: error }, submits)

  const setText = (value: string) => {
    setTextState(value)
    setError(null)
  }
  const submit = async () => {
    const t = text.trim()
    const invalid = t === '' ? strings.errBarcodeLength : typedBarcodeError(t)
    if (invalid) {
      setError(invalid)
      setSubmits((n) => n + 1)
      return
    }
    try {
      await onAdd(t)
      setTextState('')
      setError(null)
    } catch (e) {
      setError(barcodeErrorFor(e) ?? errorText(e))
      setSubmits((n) => n + 1)
    }
  }
  return { formRef, text, setText, error, submit }
}
