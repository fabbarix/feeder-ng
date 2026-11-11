// The "what is this?" sheet for an unknown barcode: the Ingredient, the pack or the weight, the name and the scope.
import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { FormActions } from '../../../ui/FormActions'
import { NumberField } from '../../../ui/fields/NumberField'
import { RadioCards } from '../../../ui/fields/RadioCards'
import { TextField } from '../../../ui/fields/TextField'
import { Select } from '../../../ui/Select/Select'
import { selectStrings } from '../../../ui/Select/strings'
import { UnitSelect } from '../../../ui/Select/UnitSelect'
import { duplicateGuard, type DuplicateGuard } from '../../ingredients/lib/newIngredient'
import type { SearchResult } from '../../ingredients/types'
import { ingredientPickerOptions } from '../../shop/lib/ingredientOptions'
import { emptyForm, suggestedName, unitOptions, validateUnknownForm, newIngredientBaseUnit, type FormErrors, type IngredientChoice, type UnknownFormValues, type UnknownMode } from '../lib/unknownForm'
import { scanStrings } from '../strings'

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
  /** R2-4: near-duplicate lookup for an Ingredient created here (the matcher of Import Review). Absent offline: no guard. A rejection is ignored. */
  findSimilar?: (name: string) => Promise<SearchResult>
}

const ALL_UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'piece']
/** The Select value of an Ingredient created in this sheet (it has no id yet). */
const NEW_INGREDIENT = -1

/** The text of a NumberField as the form keeps it ("" for empty). */
const toText = (n: number | null) => (n === null ? '' : String(n))

const ERROR_TEXT: Record<keyof FormErrors, string> = {
  ingredient: scanStrings.required,
  productName: scanStrings.required,
  packSize: scanStrings.mustBePositive,
  weight: scanStrings.mustBePositive,
}

export function UnknownBarcodeSheet({ open, onClose, mode, shopName, ingredients, priceText, onSave, findSimilar }: UnknownBarcodeSheetProps) {
  const [values, setValues] = useState<UnknownFormValues>(() => ({ ...emptyForm(), packUnit: '' }))
  const [nameTouched, setNameTouched] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [guard, setGuard] = useState<DuplicateGuard>({ kind: 'clear' })
  // Which lookup is current: an answer for an Ingredient the User has since replaced is dropped.
  const lookup = useRef(0)
  useEffect(() => () => void (lookup.current += 1), [])
  const weighed = mode !== 'pack'

  const pick = (choice: IngredientChoice | null) => {
    lookup.current += 1
    setGuard({ kind: 'clear' })
    setValues((v) => {
      if (!choice) return { ...v, ingredient: null }
      if (choice.id === undefined) return { ...v, ingredient: choice, packUnit: v.packUnit || choice.baseUnit }
      const packUnit = unitOptions(choice.baseUnit).includes(v.packUnit) ? v.packUnit : choice.baseUnit
      return { ...v, ingredient: choice, packUnit }
    })
  }

  // A new Ingredient takes its Base Unit from the pack unit chosen.
  const effective: IngredientChoice | null =
    values.ingredient && values.ingredient.id === undefined ? { ...values.ingredient, baseUnit: newIngredientBaseUnit(values.packUnit) } : values.ingredient
  const suggested = effective ? suggestedName({ ...values, ingredient: effective }) : ''
  const shownName = nameTouched ? values.productName : suggested

  // The Ingredient picker: the Ingredients, plus the one being created (shown until it is saved).
  const ingredientOptions = useMemo(() => {
    const options = ingredientPickerOptions(ingredients)
    // An existing Ingredient chosen through the guard that the picker's list does not hold.
    if (effective && effective.id !== undefined && !ingredients.some((i) => i.id === effective.id)) {
      options.push({ value: effective.id, label: effective.name, meta: selectStrings.baseUnitMeta(effective.baseUnit) })
    }
    if (effective && effective.id === undefined) {
      options.push({ value: NEW_INGREDIENT, label: effective.name, meta: selectStrings.baseUnitMeta(effective.baseUnit) })
    }
    return options
  }, [ingredients, effective])
  const ingredientValue = values.ingredient ? (values.ingredient.id ?? NEW_INGREDIENT) : null

  const unitChoices = effective && effective.id !== undefined ? { baseUnit: effective.baseUnit, conversions: [], globalUnits: unitOptions(effective.baseUnit) } : { baseUnit: 'g', conversions: [], globalUnits: ALL_UNITS }

  /** A new Ingredient was created in the picker: ask the matcher whether it already exists (a failure never blocks). */
  const check = async (name: string) => {
    if (!findSimilar) return
    const mine = ++lookup.current
    let found: DuplicateGuard = { kind: 'clear' }
    try {
      found = duplicateGuard(await findSimilar(name))
    } catch {
      // The lookup only advises.
    }
    if (mine === lookup.current) setGuard(found)
  }

  const adopt = (existing: { id: number; name: string; baseUnit: IngredientChoice['baseUnit'] }) =>
    pick({ id: existing.id, name: existing.name, baseUnit: existing.baseUnit })

  const save = () => {
    if (guard.kind !== 'clear') return
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
          onCreate={(query) => {
            const name = query.trim()
            pick({ name, baseUnit: 'g' })
            void check(name)
          }}
          createLabel={scanStrings.createIngredientRow}
          error={errors.ingredient ? ERROR_TEXT.ingredient : undefined}
        />

        {guard.kind === 'exists' ? (
          <div className="unknown-sheet__guard" role="status">
            <p>{scanStrings.guard.alreadyExists(guard.ingredient.name)}</p>
            <Button variant="tertiary" onClick={() => adopt(guard.ingredient)}>
              {scanStrings.guard.useExisting(guard.ingredient.name)}
            </Button>
          </div>
        ) : null}
        {guard.kind === 'similar' ? (
          <div className="unknown-sheet__guard" role="status">
            <p>{scanStrings.guard.didYouMean(guard.suggestions.map((s) => s.ingredient.name).join(', '))}</p>
            <div className="unknown-sheet__guard-actions">
              {guard.suggestions.map((s) => (
                <Button key={s.ingredient.id} variant="tertiary" onClick={() => adopt(s.ingredient)}>
                  {scanStrings.guard.useExisting(s.ingredient.name)}
                </Button>
              ))}
              <Button variant="tertiary" onClick={() => setGuard({ kind: 'clear' })}>
                {scanStrings.guard.createAnyway(values.ingredient?.name ?? '')}
              </Button>
            </div>
          </div>
        ) : null}

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

        <FormActions primary={<Button type="submit">{scanStrings.save}</Button>} />
      </form>
    </BottomSheet>
  )
}
