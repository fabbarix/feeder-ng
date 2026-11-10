// The "what is this?" sheet for an unknown barcode: the Ingredient, the pack or the weight, the name and the scope.
import { useMemo, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { NumberField } from '../../../ui/fields/NumberField'
import { RadioCards } from '../../../ui/fields/RadioCards'
import { TextField } from '../../../ui/fields/TextField'
import { Select } from '../../../ui/Select/Select'
import { selectStrings } from '../../../ui/Select/strings'
import { UnitSelect } from '../../../ui/Select/UnitSelect'
import { ingredientPickerOptions } from '../../shop/lib/ingredientOptions'
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
/** The Select value of an Ingredient created in this sheet (it has no id yet). */
const NEW_INGREDIENT = -1

/** The Base Unit a pack unit belongs to (a new Ingredient takes it from the unit chosen). */
function baseOfUnit(unit: string): BaseUnit {
  if (unit === 'ml' || unit === 'l') return 'ml'
  if (unit === 'piece') return 'piece'
  return 'g'
}

/** The text of a NumberField as the form keeps it ("" for empty). */
const toText = (n: number | null) => (n === null ? '' : String(n))

const ERROR_TEXT: Record<keyof FormErrors, string> = {
  ingredient: scanStrings.required,
  productName: scanStrings.required,
  packSize: scanStrings.mustBePositive,
  weight: scanStrings.mustBePositive,
}

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
  const suggested = effective ? suggestedName({ ...values, ingredient: effective }) : ''
  const shownName = nameTouched ? values.productName : suggested

  // The Ingredient picker: the Ingredients, plus the one being created (shown until it is saved).
  const ingredientOptions = useMemo(() => {
    const options = ingredientPickerOptions(ingredients)
    if (effective && effective.id === undefined) {
      options.push({ value: NEW_INGREDIENT, label: effective.name, meta: selectStrings.baseUnitMeta(effective.baseUnit) })
    }
    return options
  }, [ingredients, effective])
  const ingredientValue = values.ingredient ? (values.ingredient.id ?? NEW_INGREDIENT) : null

  const unitChoices = effective && effective.id !== undefined ? { baseUnit: effective.baseUnit, conversions: [], globalUnits: unitOptions(effective.baseUnit) } : { baseUnit: 'g', conversions: [], globalUnits: ALL_UNITS }

  const save = () => {
    const final: UnknownFormValues = { ...values, ingredient: effective, productName: shownName }
    const found = validateUnknownForm(final, mode)
    setErrors(found)
    if (Object.keys(found).length === 0) onSave(final)
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={weighed ? scanStrings.weighedTitle : scanStrings.unknownTitle}>
      <form
        className="scan-sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Select<number>
          label={scanStrings.ingredient}
          entityName={scanStrings.ingredient}
          searchable
          options={ingredientOptions}
          value={ingredientValue}
          onChange={(id) => {
            if (id === NEW_INGREDIENT) return
            const choice = ingredients.find((i) => i.id === id)
            if (choice) pick(choice)
          }}
          onCreate={(query) => pick({ name: query.trim(), baseUnit: 'g' })}
          createLabel={scanStrings.createIngredientRow}
          error={errors.ingredient ? ERROR_TEXT.ingredient : undefined}
        />

        {mode === 'pack' ? (
          <>
            <NumberField
              label={scanStrings.packSize}
              value={values.packSize === '' ? null : Number(values.packSize)}
              onChange={(n) => setValues((v) => ({ ...v, packSize: toText(n) }))}
              min={0}
              error={errors.packSize ? ERROR_TEXT.packSize : undefined}
            />
            <UnitSelect
              label={scanStrings.packUnit}
              units={unitChoices}
              value={values.packUnit === '' ? null : values.packUnit}
              onChange={(unit) => setValues((v) => ({ ...v, packUnit: unit }))}
            />
          </>
        ) : null}

        <TextField
          label={scanStrings.productName}
          value={shownName}
          onChange={(name) => {
            setNameTouched(true)
            setValues((v) => ({ ...v, productName: name }))
          }}
          error={errors.productName ? ERROR_TEXT.productName : undefined}
        />

        {mode === 'pack' ? (
          <RadioCards
            label={scanStrings.scopeLegend}
            value={values.scope}
            onChange={(scope) => setValues((v) => ({ ...v, scope }))}
            options={[
              { value: 'global', title: scanStrings.scopeGlobal, description: scanStrings.scopeGlobalHint },
              { value: 'shop', title: scanStrings.scopeShop, description: scanStrings.scopeShopHint(shopName) },
            ]}
          />
        ) : null}

        {mode === 'weighed_price' ? (
          <>
            <p className="unknown-sheet__hint">{`The label says ${priceText ?? ''}. ${scanStrings.weightHint}`}</p>
            <NumberField
              label={scanStrings.weight}
              value={values.weightText === '' ? null : Number(values.weightText)}
              onChange={(n) => setValues((v) => ({ ...v, weightText: toText(n) }))}
              min={0}
              error={errors.weight ? ERROR_TEXT.weight : undefined}
            />
          </>
        ) : null}

        <Button type="submit">{scanStrings.save}</Button>
      </form>
    </BottomSheet>
  )
}
