import { useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { IngredientCombobox } from './IngredientCombobox'
import { emptyForm, suggestedName, unitOptions, validateUnknownForm, type FormErrors, type IngredientChoice, type UnknownFormValues, type UnknownMode } from '../lib/unknownForm'
import { scanStrings } from '../strings'
import type { BaseUnit } from '../types'

export interface UnknownBarcodeSheetProps {
  open: boolean
  onClose: () => void
  mode: UnknownMode
  /** the Shop-only choice names this Shop */
  shopName: string
  /** the Ingredients to search */
  ingredients: IngredientChoice[]
  /** a price-valued weighed code: shown to explain why the weight is asked */
  priceText?: string
  onSave: (values: UnknownFormValues) => void
}

const ALL_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'piece']

/** The Base Unit a pack unit belongs to (a new Ingredient takes it from the unit chosen). */
function baseOfUnit(unit: string): BaseUnit {
  if (unit === 'ml' || unit === 'l') return 'ml'
  if (unit === 'piece') return 'piece'
  return 'g'
}

const ERROR_TEXT: Record<keyof FormErrors, string> = {
  ingredient: scanStrings.required,
  productName: scanStrings.required,
  packSize: scanStrings.mustBePositive,
  weight: scanStrings.mustBePositive,
}

/** The "what is this?" sheet for an unknown barcode: the Ingredient, the pack or the weight, the name and the scope. */
export function UnknownBarcodeSheet({ open, onClose, mode, shopName, ingredients, priceText, onSave }: UnknownBarcodeSheetProps) {
  const [values, setValues] = useState<UnknownFormValues>(() => ({ ...emptyForm(), packUnit: '' }))
  const [nameTouched, setNameTouched] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const weighed = mode !== 'pack'

  const pick = (choice: IngredientChoice | null) => {
    setValues((v) => {
      if (!choice) return { ...v, ingredient: null }
      if (choice.id === undefined) return { ...v, ingredient: choice, packUnit: v.packUnit || choice.baseUnit }
      const packUnit = unitOptions(choice.baseUnit).includes(v.packUnit) ? v.packUnit : choice.baseUnit
      return { ...v, ingredient: choice, packUnit }
    })
  }

  // A new Ingredient takes its Base Unit from the pack unit chosen.
  const effective: IngredientChoice | null =
    values.ingredient && values.ingredient.id === undefined ? { ...values.ingredient, baseUnit: baseOfUnit(values.packUnit) } : values.ingredient
  const units = effective && effective.id !== undefined ? unitOptions(effective.baseUnit) : ALL_UNITS
  const suggested = effective ? suggestedName({ ...values, ingredient: effective }) : ''
  const shownName = nameTouched ? values.productName : suggested

  const save = () => {
    const final: UnknownFormValues = { ...values, ingredient: effective, productName: shownName }
    const found = validateUnknownForm(final, mode)
    setErrors(found)
    if (Object.keys(found).length === 0) onSave(final)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={weighed ? scanStrings.weighedTitle : scanStrings.unknownTitle}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <IngredientCombobox ingredients={ingredients} selected={values.ingredient} onSelect={pick} />
        {errors.ingredient ? <p className="field__error" role="alert">{ERROR_TEXT.ingredient}</p> : null}

        {mode === 'pack' ? (
          <>
            <div className="field">
              <label className="field__label" htmlFor="unknown-pack-size">
                {scanStrings.packSize}
              </label>
              <input
                id="unknown-pack-size"
                className="field__input"
                inputMode="decimal"
                value={values.packSize}
                onChange={(e) => setValues((v) => ({ ...v, packSize: e.target.value }))}
              />
              <label className="field__label" htmlFor="unknown-pack-unit">
                {scanStrings.packUnit}
              </label>
              <select id="unknown-pack-unit" className="field__input" value={values.packUnit} onChange={(e) => setValues((v) => ({ ...v, packUnit: e.target.value }))}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            {errors.packSize ? <p className="field__error" role="alert">{ERROR_TEXT.packSize}</p> : null}
          </>
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="unknown-product-name">
            {scanStrings.productName}
          </label>
          <input
            id="unknown-product-name"
            className="field__input"
            value={shownName}
            onChange={(e) => {
              setNameTouched(true)
              setValues((v) => ({ ...v, productName: e.target.value }))
            }}
          />
        </div>
        {errors.productName ? <p className="field__error" role="alert">{ERROR_TEXT.productName}</p> : null}

        {mode === 'pack' ? (
          <fieldset className="field">
            <legend className="field__label">{scanStrings.scopeGlobal}</legend>
            <label>
              <input type="radio" name="unknown-scope" checked={values.scope === 'global'} onChange={() => setValues((v) => ({ ...v, scope: 'global' }))} />
              {scanStrings.scopeGlobal}
            </label>
            <label>
              <input type="radio" name="unknown-scope" checked={values.scope === 'shop'} onChange={() => setValues((v) => ({ ...v, scope: 'shop' }))} />
              {scanStrings.scopeShop}
            </label>
            <p className="field__hint">{shopName}</p>
          </fieldset>
        ) : null}

        {mode === 'weighed_price' ? (
          <div className="field">
            <p className="field__hint">{`The label says ${priceText ?? ''}. ${scanStrings.weightHint}`}</p>
            <label className="field__label" htmlFor="unknown-weight">
              {scanStrings.weight}
            </label>
            <input id="unknown-weight" className="field__input" inputMode="decimal" value={values.weightText} onChange={(e) => setValues((v) => ({ ...v, weightText: e.target.value }))} />
            {errors.weight ? <p className="field__error" role="alert">{ERROR_TEXT.weight}</p> : null}
          </div>
        ) : null}

        <Button type="submit">{scanStrings.save}</Button>
      </form>
    </BottomSheet>
  )
}

