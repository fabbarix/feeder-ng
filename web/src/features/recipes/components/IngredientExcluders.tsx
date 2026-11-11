import type { ReactNode } from 'react'
import { Avatar, IconButton } from '../../../ui'
import type { PreferenceMember } from '../lib/preferenceRows'
import { recipeStrings } from '../strings'

/** Avatars shown on an Ingredient line before the "+N" (rx-pt.md section 5.4). */
const SHOWN = 3

export interface IngredientExcludersProps {
  /** The ingredient's name as the button says it: "Exclusions for garlic". */
  ingredient: string
  /** The Members who exclude it, in Members order. */
  members: PreferenceMember[]
  onOpen: () => void
}

/** The Avatars of the Members who exclude an Ingredient, and the button that opens who excludes it. */
export function IngredientExcluders({ ingredient, members, onOpen }: IngredientExcludersProps): ReactNode {
  const shown = members.slice(0, SHOWN)
  const more = members.length - shown.length
  return (
    <span className="ingredient-lines__excluders">
      {shown.map((m) => (
        <Avatar key={m.id} name={m.name} imageUrl={m.photoUrl} colour={m.colour} glyph={m.avatar} size="sm" />
      ))}
      {more > 0 ? <span className="ingredient-lines__more">{`+${more}`}</span> : null}
      <IconButton icon="exclusion" label={recipeStrings.excludersFor(ingredient)} aria-haspopup="dialog" onClick={onOpen} />
    </span>
  )
}
