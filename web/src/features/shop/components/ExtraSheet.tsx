import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { FormActions } from '../../../ui/FormActions'
import { Segmented } from '../../../ui/fields/Segmented'
import { NumberField } from '../../../ui/fields/NumberField'
import { TextField } from '../../../ui/fields/TextField'
import { fieldStrings } from '../../../ui/fields/strings'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { Select } from '../../../ui/Select/Select'
import { ingredientPickerOptions } from '../lib/ingredientOptions'
import { checkExtraDraft, type ExtraDraftError, type ExtraDraftField, type ExtraMode } from '../lib/extraDraft'
import { shopStrings } from '../strings'
import type { ExtraInput } from '../types'

export interface ExtraSheetProps {
  open: boolean
  onClose: () => void
  /** the Ingredients to pick from for an Ingredient extra; baseUnit is the unit the quantity is in */
  ingredients: { id: number; name: string; baseUnit: string }[]
  onSubmit: (input: ExtraInput) => void
  /** B9-43 (SSP-14): "Get something else…" opens the sheet on an Ingredient extra with the Ingredient select open */
  autoOpenIngredient?: boolean
}

interface FieldError {
  field: ExtraDraftField
  error: ExtraDraftError
}

const errorText: Record<ExtraDraftError, string> = {
  required: shopStrings.required,
  chooseIngredient: shopStrings.extraChooseIngredient,
  mustBePositive: shopStrings.mustBePositive,
}

const KIND_OPTIONS = (hasIngredients: boolean) => [
  { value: 'ingredient' as const, label: shopStrings.extraKindIngredient, disabled: !hasIngredients },
  { value: 'note' as const, label: shopStrings.extraKindNote },
]

/**
 * "Add to Shopping List": one choice (an Ingredient with a quantity, or something else), then its fields. Checking is lib/extraDraft's job.
 * SAFE-11: no arbitrary default (the Ingredient reads "Choose an Ingredient", the disabled Quantity says why), Save is always enabled,
 * and a failed Save puts its error on the field and the focus in it.
 */
export function ExtraSheet({ open, onClose, ingredients, onSubmit }: ExtraSheetProps) {
  const formId = useId()
  const hasIngredients = ingredients.length > 0
  // The mode is the User's pick, or else the starting choice, which follows the Ingredients as they load.
  const [chosen, setChosen] = useState<ExtraMode | null>(null)
  const mode: ExtraMode = chosen ?? (hasIngredients ? 'ingredient' : 'note')
  const [text, setText] = useState('')
  const [ingredientId, setIngredientId] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number | null>(null)
  const [error, setError] = useState<FieldError | null>(null)
  // SAFE-11 (R4): after a failed Save, the field with the error takes the focus
  const formRef = useRef<HTMLFormElement>(null)
  const [submitCount, setSubmitCount] = useState(0)
  useFocusFirstInvalid(formRef, error ? [error] : null, submitCount)
  const picked = ingredients.find((i) => i.id === ingredientId) ?? null
  const options = useMemo(() => ingredientPickerOptions(ingredients), [ingredients])
  const kinds = useMemo(() => KIND_OPTIONS(hasIngredients), [hasIngredients])

  // The sheet's state outlives each opening (the screen keeps it mounted), so start clean every time it closes.
  useEffect(() => {
    if (open) return
    setChosen(null)
    setText('')
    setIngredientId(null)
    setQuantity(null)
    setError(null)
  }, [open])

  const chooseMode = (next: ExtraMode) => {
    setChosen(next)
    setError(null)
  }

  const submit = () => {
    const result = checkExtraDraft({ mode, text, ingredientId, quantityText: quantity === null ? '' : String(quantity) })
    if (!result.ok) {
      setError({ field: result.field, error: result.error })
      setSubmitCount((n) => n + 1)
      return
    }
    setError(null)
    onSubmit(result.input)
  }

  const fieldError = (field: ExtraDraftField) => (error?.field === field ? errorText[error.error] : undefined)

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onCancel={onClose}
      cancelLabel={fieldStrings.cancel}
      title={shopStrings.addExtra}
      footer={
        <FormActions
          primary={
            <Button type="submit" form={formId}>
              {shopStrings.save}
            </Button>
          }
        />
      }
    >
      <form
        ref={formRef}
        id={formId}
        className="shop-sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Segmented<ExtraMode>
          size="full"
          label={shopStrings.extraKind}
          helper={shopStrings.extraKindHelper}
          value={mode}
          onChange={chooseMode}
          options={kinds}
        />
        {mode === 'ingredient' ? (
          <>
            <Select<number>
              size="full"
              label={shopStrings.extraIngredient}
              entityName="Ingredient"
              placeholder={shopStrings.extraChooseIngredient}
              options={options}
              value={ingredientId}
              onChange={(id) => {
                setIngredientId(id)
                setError(null)
              }}
              error={fieldError('ingredient')}
            />
            <NumberField
              size="full"
              label={shopStrings.extraQuantity}
              value={quantity}
              onChange={(next) => {
                setQuantity(next)
                setError(null)
              }}
              min={0}
              unit={picked?.baseUnit}
              disabled={!picked}
              helper={picked ? undefined : shopStrings.extraQuantityFirst}
              error={fieldError('quantity')}
            />
          </>
        ) : (
          <TextField
            size="full"
            label={shopStrings.extraText}
            value={text}
            onChange={(next) => {
              setText(next)
              setError(null)
            }}
            error={fieldError('text')}
          />
        )}
      </form>
    </BottomSheet>
  )
}
