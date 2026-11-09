import { useState } from 'react'
import { errorText } from '../../products/lib/productForm'
import { toShopBarcodeBody, validateShopBarcodeForm, type ShopBarcodeFormErrors, type ShopBarcodeFormValues } from '../lib/shopBarcodeForm'
import type { ShopRule } from '../types'

type Body = ReturnType<typeof toShopBarcodeBody>

/** State of the "Add Shop Barcode" form: a Product, then a plain code or a rule and item code. */
export function useShopBarcodeForm(rules: ShopRule[], onAdd: (body: Body) => Promise<void>) {
  const [values, setValues] = useState<ShopBarcodeFormValues>({ productId: null, code: '', ruleId: null, itemCode: '' })
  const [errors, setErrors] = useState<ShopBarcodeFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<ShopBarcodeFormValues>) => setValues((v) => ({ ...v, ...patch }))

  const submit = async () => {
    const found = validateShopBarcodeForm(values, rules)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onAdd(toShopBarcodeBody(values))
    } catch (e) {
      setServerError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  return { values, errors, serverError, saving, set, submit }
}
