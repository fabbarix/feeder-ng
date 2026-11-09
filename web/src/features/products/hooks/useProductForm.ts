import { useState } from 'react'
import { defaultProductName } from '../lib/names'
import { errorText, parsePackSize, toNewProduct, validateProductForm, type ProductFormErrors, type ProductFormValues } from '../lib/productForm'
import type { BaseUnit, NewProduct } from '../types'

/** State of the Product form: the name follows the pack size until it is edited by hand. */
export function useProductForm(
  ingredientId: number,
  ingredientName: string,
  baseUnit: BaseUnit,
  onSubmit: (body: NewProduct) => Promise<void>,
) {
  const [values, setValues] = useState<ProductFormValues>({ name: '', packSize: '', barcode: '' })
  const [nameEdited, setNameEdited] = useState(false)
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setName = (name: string) => {
    setNameEdited(true)
    setValues((v) => ({ ...v, name }))
  }
  const setPackSize = (packSize: string) => {
    setValues((v) => {
      const size = parsePackSize(packSize)
      const name = !nameEdited && size !== null ? defaultProductName(ingredientName, size, baseUnit) : v.name
      return { ...v, packSize, name }
    })
  }
  const setBarcode = (barcode: string) => setValues((v) => ({ ...v, barcode }))

  const submit = async () => {
    const found = validateProductForm(values)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onSubmit(toNewProduct(values, ingredientId))
    } catch (e) {
      setServerError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return { values, errors, serverError, saving, setName, setPackSize, setBarcode, submit }
}
