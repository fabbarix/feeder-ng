import { Chip, Tile } from '../../../ui'
import { baseUnitLabel, type UnitSystem } from '../../../lib/units'
import { strings } from '../strings'
import type { Ingredient } from '../types'

export interface IngredientListProps {
  ingredients: readonly Ingredient[]
  system: UnitSystem
  onOpen: (id: number) => void
}

/** One tile-row per Ingredient: name, a Base Unit chip (g/oz, ml/fl oz, piece), a Shelf Life chip when set. The row is a button named by the Ingredient. */
export function IngredientList({ ingredients, system, onOpen }: IngredientListProps) {
  return (
    <ul className="ingredient-list">
      {ingredients.map((ingredient) => (
        <li key={ingredient.id}>
          <Tile as="div" size="wide" onClick={() => onOpen(ingredient.id)}>
            <span>{ingredient.name}</span>
            <Chip>{baseUnitLabel(ingredient.baseUnit, system)}</Chip>
            {ingredient.shelfLifeDays !== null ? <Chip>{strings.shelfLife(ingredient.shelfLifeDays)}</Chip> : null}
          </Tile>
        </li>
      ))}
    </ul>
  )
}
