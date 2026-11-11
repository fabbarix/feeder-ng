import { useEffect, useRef, type ReactNode } from 'react'
import { Button, Checkbox, Chip, IconButton, IngredientSelect, TextField, UnitSelect } from '../../../ui'
import type { DraftErrors, LineDraft } from '../lib/draft'
import { needsConversion, unitChoicesOf } from '../lib/lineUnits'
import { codeMessage, recipeStrings } from '../strings'
import type { IngredientRef } from '../types'

export interface IngredientLineRowProps {
  line: LineDraft
  index: number
  errors: DraftErrors
  /** The picked Ingredient (unit choices come from it), once known. */
  ingredient: IngredientRef | undefined
  /** Every Ingredient, for the IngredientSelect options (it searches and filters itself). */
  ingredients?: IngredientRef[]
  onPick: (ingredient: IngredientRef) => void
  onChange: (patch: Partial<LineDraft>) => void
  onRemove: () => void
  /** R14: "Create Ingredient '<query>'" was chosen in the picker. Without it the picker has no create row. */
  onQuickCreate?: (query: string) => void
  /** R14: when set, the create row is shown disabled with this reason (offline). */
  quickCreateDisabledReason?: string
  /** R14: take focus in the Quantity field now (after a quick create); calls onAmountFocused once it has. */
  focusAmount?: boolean
  onAmountFocused?: () => void
}

const fieldError = (errors: DraftErrors, key: string) => (errors[key] ? codeMessage(errors[key]) : undefined)

/**
 * One ingredient line of the editor: Ingredient (IngredientSelect), Quantity (text, so "1 1/2" stays typeable), Unit
 * (UnitSelect with the Ingredient's units and a typed custom unit), optional and Note, with remove. A unit the
 * Ingredient does not know yet says that Feeder will ask for its Unit Conversion on save. Renders and calls back only.
 */
export function IngredientLineRow({
  line,
  index,
  errors,
  ingredient,
  ingredients = [],
  onPick,
  onChange,
  onRemove,
  onQuickCreate,
  quickCreateDisabledReason,
  focusAmount,
  onAmountFocused,
}: IngredientLineRowProps): ReactNode {
  const amountRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusAmount) return
    amountRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    onAmountFocused?.()
  }, [focusAmount, onAmountFocused])

  if (line.auto && line.ingredientId === null) {
    return <PendingLine line={line} onChange={onChange} onRemove={onRemove} />
  }
  const units = ingredient ? unitChoicesOf(ingredient) : { baseUnit: line.unit, conversions: [], globalUnits: [] }
  const asks = needsConversion(line.unit, ingredient)
  return (
    <li className="line-row">
      <div className="line-row__ingredient">
        <IngredientSelect
          label={recipeStrings.lines.ingredient}
          ingredients={ingredients}
          value={line.ingredientId}
          error={fieldError(errors, `lines.${index}.ingredient`)}
          onCreate={onQuickCreate}
          createDisabledReason={onQuickCreate ? quickCreateDisabledReason : undefined}
          onChange={(id) => {
            const picked = ingredients.find((ing) => ing.id === id)
            if (picked) onPick(picked)
          }}
        />
      </div>
      <div ref={amountRef} className="line-row__amount">
        <TextField
          label={recipeStrings.lines.quantity}
          inputMode="decimal"
          value={line.quantity}
          error={fieldError(errors, `lines.${index}.quantity`)}
          onChange={(quantity) => onChange({ quantity })}
        />
        <UnitSelect
          label={recipeStrings.lines.unit}
          units={units}
          value={line.unit || null}
          disabled={!ingredient}
          error={fieldError(errors, `lines.${index}.unit`)}
          onChange={(unit) => onChange({ unit })}
          onCreate={(unit) => onChange({ unit })}
          createLabel={recipeStrings.lines.useUnit}
        />
      </div>
      {line.auto && line.quantity.trim() === '' && line.ingredientId !== null ? <p className="line-row__hint">{recipeStrings.lines.packSizeHint}</p> : null}
      {asks ? <p className="line-row__hint">{recipeStrings.lines.unitNeedsConversion(line.unit)}</p> : null}
      <div className="line-row__extras">
        <Checkbox label={recipeStrings.optional} checked={line.optional} onChange={(optional) => onChange({ optional })} />
        <TextField label={recipeStrings.lines.note} value={line.note} onChange={(note) => onChange({ note })} />
      </div>
      <IconButton icon="delete" label={recipeStrings.lines.remove} onClick={onRemove} />
    </li>
  )
}

/**
 * The Ready Meal's pack when its Ingredient does not exist yet: a read-only summary. Feeder makes the Ingredient when the Recipe is saved.
 * "Choose another Ingredient" turns the line into an ordinary blank one.
 */
function PendingLine({ line, onChange, onRemove }: Pick<IngredientLineRowProps, 'line' | 'onChange' | 'onRemove'>): ReactNode {
  const text = recipeStrings.readyMealIngredient
  return (
    <li className="line-row line-row--pending">
      <div className="line-row__ingredient">
        <p className="line-row__pending-name">
          <strong>{line.ingredientName}</strong> <Chip kind="state">{text.newBadge}</Chip>
        </p>
        <p className="line-row__pending-amount">
          {line.quantity} {line.unit}
        </p>
        <p className="line-row__hint">{text.helper(line.ingredientName)}</p>
        <Button variant="tertiary" onClick={() => onChange({ auto: false, ingredientName: '', quantity: '', unit: '' })}>
          {text.changeIngredient}
        </Button>
      </div>
      <IconButton icon="delete" label={recipeStrings.lines.remove} onClick={onRemove} />
    </li>
  )
}
