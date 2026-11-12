import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { visibleTags } from '../lib/tags'
import { recipeStrings } from '../strings'

export interface RecipeTagsProps {
  tags: readonly string[]
  /** Tag spelling => colour id (undefined renders a neutral chip). */
  colourOf?: (name: string) => string | undefined
  /** Show only this many, then a "+N" chip. All when absent. */
  limit?: number
  /** Makes each chip a button; absent = plain chips. */
  onOpen?: (name: string) => void
}

/** TG-RW: a list named "Tags" of Tag chips in their colours; shared by the Recipe tile and the Recipe detail. Nothing for no Tags. */
export function RecipeTags({ tags, colourOf, limit, onOpen }: RecipeTagsProps): ReactNode {
  if (tags.length === 0) return null
  const { shown, more } = limit === undefined ? { shown: [...tags], more: 0 } : visibleTags(tags, limit)
  return (
    <ul className="recipe-tags" aria-label={recipeStrings.tagsLabel}>
      {shown.map((name, i) => {
        const colour = colourOf?.(name)
        return (
          <li key={`${i}-${name}`}>
            {onOpen ? (
              <Chip kind="tag" tagColour={colour} onClick={() => onOpen(name)}>
                {name}
              </Chip>
            ) : (
              <Chip kind="tag" tagColour={colour}>
                {name}
              </Chip>
            )}
          </li>
        )
      })}
      {more > 0 ? (
        <li>
          <Chip kind="tag">{`+${more}`}</Chip>
        </li>
      ) : null}
    </ul>
  )
}
