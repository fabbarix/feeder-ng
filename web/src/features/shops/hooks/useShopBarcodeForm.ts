import { useRef, useState } from 'react'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { errorText } from '../../products/lib/productForm'
import { toShopBarcodeBody, validateShopBarcodeForm, type ShopBarcodeFormErrors, type ShopBarcodeFormValues } from '../lib/shopBarcodeForm'
import type { ShopRule } from '../types'

type Body = ReturnType<typeof toShopBarcodeBody>

/**
 * State of the "Add Shop Barcode" form: a Product, then a plain code or a rule and item code. Errors are at the field (SAFE-04): a
 * refusal from the server is the code field's error, and after a failed Save the first invalid field takes focus.
 */
export function useShopBarcodeForm(rules: ShopRule[], onAdd: (body: Body) => Promise<void>) {
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<ShopBarcodeFormValues>({ productId: null, code: '', ruleId: null, itemCode: '' })
  const [errors, setErrors] = useState<ShopBarcodeFormErrors>({})
  const [saving, setSaving] = useState(false)
  const [submits, setSubmits] = useState(0)
  useFocusFirstInvalid(formRef, errors, submits)

  const set = (patch: Partial<ShopBarcodeFormValues>) => {
    setValues((v) => ({ ...v, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const key of Object.keys(patch) as (keyof ShopBarcodeFormValues)[]) delete next[key === 'ruleId' ? 'itemCode' : (key as keyof ShopBarcodeFormErrors)]
      return next
    })
  }

  const submit = async () => {
    const found = validateShopBarcodeForm(values, rules)
    setErrors(found)
    setSubmits((n) => n + 1)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onAdd(toShopBarcodeBody(values))
    } catch (e) {
      setErrors({ [values.ruleId === null ? 'code' : 'itemCode']: errorText(e) })
      setSubmits((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }
  return { formRef, values, errors, saving, set, submit }
}
