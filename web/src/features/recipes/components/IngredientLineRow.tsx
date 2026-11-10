import type { ReactNode } from 'react'
import { Button } from '../../../ui'
import type { DraftErrors, LineDraft } from '../lib/draft'
import { selectableUnits } from '../lib/lineUnits'
import { codeMessage, recipeStrings } from '../strings'
import type { IngredientRef } from '../types'

export interface IngredientLineRowProps {
  line: LineDraft
  index: number
  errors: DraftErrors
  /** The picked Ingredient (unit choices come from it), once known. */
  ingredient: IngredientRef | undefined
  /** Every Ingredient, for the ui/IngredientSelect options (it searches and filters itself). Replaces `results`/`onSearch`. */
  ingredients?: IngredientRef[]
  /** @deprecated the IngredientSelect searches by itself; removed with the native input. */
  results?: IngredientRef[]
  /** @deprecated see `results`. */
  onSearch?: (text: string) => void
  onPick: (ingredient: IngredientRef) => void
  onChange: (patch: Partial<LineDraft>) => void
  onRemove: () => void
}

/**
 * One ingredient line of the editor: Ingredient search (suggestions below it), Quantity, Unit (the
 * Ingredient's units from lib/lineUnits), optional and Note, with remove. Renders and calls back only.
 */
export function IngredientLineRow({
  line,
  index,
  errors,
  ingredient,
  results = [],
  onSearch = () => {},
  onPick,
  onChange,
  onRemove,
}: IngredientLineRowProps): ReactNode {
  const units = ingredient ? selectableUnits(ingredient) : line.unit ? [line.unit] : []
  const fieldErrors = [`lines.${index}.ingredient`, `lines.${index}.quantity`, `lines.${index}.unit`]
    .map((k) => errors[k])
    .filter((c): c is string => c !== undefined)

  return (
    <li>
      <label>
        {recipeStrings.lines.ingredient}
        <input
          value={line.ingredientName}
          placeholder={recipeStrings.lines.find}
          onChange={(e) => {
            onChange({ ingredientId: null, ingredientName: e.target.value })
            onSearch(e.target.value)
          }}
        />
      </label>
      {results.length > 0 && line.ingredientId === null ? (
        <div>
          {results.map((ing) => (
            <Button key={ing.id} variant="tonal" aria-label={recipeStrings.lines.pick(ing.name)} onClick={() => onPick(ing)}>
              {ing.name}
            </Button>
          ))}
        </div>
      ) : null}
      <label>
        {recipeStrings.lines.quantity}
        <input inputMode="decimal" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
      </label>
      <label>
        {recipeStrings.lines.unit}
        <select value={line.unit} disabled={units.length === 0} onChange={(e) => onChange({ unit: e.target.value })}>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={line.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
        {recipeStrings.optional}
      </label>
      <label>
        {recipeStrings.lines.note}
        <input value={line.note} onChange={(e) => onChange({ note: e.target.value })} />
      </label>
      {fieldErrors.map((code) => (
        <p role="alert" key={code}>
          {codeMessage(code)}
        </p>
      ))}
      <Button variant="ghost" aria-label={recipeStrings.lines.remove} onClick={onRemove}>
        {recipeStrings.lines.remove}
      </Button>
    </li>
  )
}
