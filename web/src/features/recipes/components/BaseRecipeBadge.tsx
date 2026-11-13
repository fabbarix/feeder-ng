import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { recipeStrings } from '../strings'

/** BR-D: the "Base recipe" tag Chip (Phosphor cooking-pot through the shared Icon). Used on tiles, the detail, the Ingredients page. */
export function BaseRecipeBadge(): ReactNode {
  return (
    <Chip kind="tag" icon="cook">
      {recipeStrings.baseRecipe.badge}
    </Chip>
  )
}
