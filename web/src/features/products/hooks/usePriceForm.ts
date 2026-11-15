import { useRef, useState } from 'react'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { prefillPrice, toPriceBody, validatePriceForm, type PriceFormErrors, type PriceFormValues } from '../lib/priceForm'
import { errorText } from '../lib/productForm'
import type { Price, PriceBody } from '../types'

export interface PriceFormOptions {
  latestByShop: Record<number, Price | undefined>
  currency: string
  today: string
  initialShopId?: number
  /** A recorded Price to show (the Price sheet of a row); without it the Shop's latest Price prefills. */
  initialPrice?: Price
  onSave: (body: PriceBody) => Promise<void>
}

/** State of the Price form: choosing a Shop prefills the amounts from the latest Price there. */
export function usePriceForm({ latestByShop, currency, today, initialShopId, initialPrice, onSave }: PriceFormOptions) {
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<PriceFormValues>(() =>
    initialPrice
      ? prefillPrice(initialPrice, initialPrice.shopId, initialPrice.date, currency)
      : prefillPrice(initialShopId ? (latestByShop[initialShopId] ?? null) : null, initialShopId ?? null, today, currency),
  )
  const [submits, setSubmits] = useState(0)
  const [errors, setErrors] = useState<PriceFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useFocusFirstInvalid(formRef, errors, submits)

  const chooseShop = (shopId: number | null) =>
    setValues((v) => ({
      ...prefillPrice(shopId === null ? null : (latestByShop[shopId] ?? null), shopId, v.date, currency),
    }))
  const setField = (field: 'date' | 'price' | 'perKg', value: string) => setValues((v) => ({ ...v, [field]: value }))

  const submit = async () => {
    const found = validatePriceForm(values, currency)
    setErrors(found)
    setServerError(null)
    setSubmits((n) => n + 1)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onSave(toPriceBody(values, currency))
    } catch (e) {
      setServerError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return { formRef, values, errors, serverError, saving, chooseShop, setField, submit }
}
