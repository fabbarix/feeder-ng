import { useRef, useState } from 'react'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { defaultProductName } from '../lib/names'
import { parsePackSize, saveErrors, toNewProduct, validateProductForm, type ProductFormErrors, type ProductFormValues } from '../lib/productForm'
import { strings } from '../strings'
import type { BaseUnit, NewProduct } from '../types'

/** The Ingredient a new Product belongs to. */
export interface ProductIngredient {
  id: number
  name: string
  baseUnit: BaseUnit
}

/**
 * State of the Product form: the name follows the Ingredient and the pack size until it is edited by hand. `ingredient` null means the
 * form chooses it (the Products list). Errors are at the field and the first invalid one takes focus (SAFE-04); a failed save is the
 * Barcode field's error for a refused code, else the form's.
 */
export function useProductForm(ingredient: ProductIngredient | null, onSubmit: (body: NewProduct) => Promise<void>) {
  const formRef = useRef<HTMLFormElement>(null)
  const [chosen, setChosen] = useState<ProductIngredient | null>(null)
  const current = ingredient ?? chosen
  const [values, setValues] = useState<ProductFormValues>({ name: '', packSize: '', barcode: '' })
  const [nameEdited, setNameEdited] = useState(false)
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submits, setSubmits] = useState(0)
  // PE: Save waits for a Picture that is still uploading.
  const [pictureBusy, setPictureBusy] = useState(false)
  useFocusFirstInvalid(formRef, errors, submits)

  const prefill = (v: ProductFormValues, ing: ProductIngredient | null): ProductFormValues => {
    const size = parsePackSize(v.packSize)
    return !nameEdited && ing && size !== null ? { ...v, name: defaultProductName(ing.name, size, ing.baseUnit) } : v
  }
  const clear = (field: keyof ProductFormErrors) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))

  const chooseIngredient = (ing: ProductIngredient) => {
    setChosen(ing)
    setValues((v) => prefill(v, ing))
    clear('ingredient')
  }
  const setName = (name: string) => {
    setNameEdited(true)
    setValues((v) => ({ ...v, name }))
    clear('name')
  }
  const setPackSize = (packSize: string) => {
    setValues((v) => prefill({ ...v, packSize }, current))
    clear('packSize')
  }
  const setBarcode = (barcode: string) => {
    setValues((v) => ({ ...v, barcode }))
    clear('barcode')
  }
  const setImage = (image: string) => setValues((v) => ({ ...v, image }))

  const submit = async () => {
    const found: ProductFormErrors = { ...(current ? {} : { ingredient: strings.errIngredient }), ...validateProductForm(values) }
    setErrors(found)
    setServerError(null)
    setSubmits((n) => n + 1)
    if (Object.keys(found).length > 0 || !current) return
    setSaving(true)
    try {
      await onSubmit(toNewProduct(values, current.id))
    } catch (e) {
      const failed = saveErrors(e)
      setErrors(failed.errors)
      setServerError(failed.formError)
      setSubmits((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  return { formRef, ingredient: current, values, errors, serverError, saving, pictureBusy, setPictureBusy, chooseIngredient, setName, setPackSize, setBarcode, setImage, submit }
}
