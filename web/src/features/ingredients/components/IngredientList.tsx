import { ListGroup, ListRow, Thumb } from '../../../ui'
import { baseUnitLabel, type UnitSystem } from '../../../lib/units'
import { displayName, ingredientMeta } from '../lib/names'
import { strings } from '../strings'
import type { Ingredient } from '../types'

export interface IngredientListProps {
  ingredients: readonly Ingredient[]
  system: UnitSystem
  onOpen: (id: number) => void
}

/** The Ingredients as a ListGroup of ListRows: the capitalised name, meta "g · keeps 30 days" (Base Unit, Shelf Life). A row opens the Ingredient. */
export function IngredientList({ ingredients, system, onOpen }: IngredientListProps) {
  return (
    <ListGroup label={strings.title}>
      {ingredients.map((ingredient) => (
        <ListRow
          key={ingredient.id}
          title={displayName(ingredient.name)}
          meta={ingredientMeta(baseUnitLabel(ingredient.baseUnit, system), ingredient.shelfLifeDays)}
          leading={<Thumb imageUrl={ingredient.imageUrl} size={40} />}
          chevron
          onActivate={() => onOpen(ingredient.id)}
        />
      ))}
    </ListGroup>
  )
}
