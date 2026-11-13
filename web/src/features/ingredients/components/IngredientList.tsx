import { Chip, ListGroup, ListRow, Thumb } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { rowMeta } from '../lib/kind'
import { displayName } from '../lib/names'
import { strings } from '../strings'
import type { Ingredient } from '../types'

export interface IngredientListProps {
  ingredients: readonly Ingredient[]
  system: UnitSystem
  onOpen: (id: number) => void
  /** The group's name (the Supplies list passes its own); the Ingredients title by default. */
  label?: string
}

/** The Ingredients (or Supplies) as a ListGroup of ListRows: the capitalised name and its meta (lib/kind rowMeta: "g · keeps 30 days" for food, "piece · restocks below 6 pieces" for a Supply). A row opens it. */
export function IngredientList({ ingredients, system, onOpen, label = strings.title }: IngredientListProps) {
  return (
    <ListGroup label={label}>
      {ingredients.map((ingredient) => (
        <ListRow
          key={ingredient.id}
          title={displayName(ingredient.name)}
          meta={rowMeta(ingredient, system)}
          leading={<Thumb name={ingredient.name} imageUrl={ingredient.imageUrl} size={40} />}
          chevron
          trailing={ingredient.baseRecipe ? <Chip kind="tag" icon="cook">{strings.baseRecipeBadge}</Chip> : undefined}
          onActivate={() => onOpen(ingredient.id)}
        />
      ))}
    </ListGroup>
  )
}
