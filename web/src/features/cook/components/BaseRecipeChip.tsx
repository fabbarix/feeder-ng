// BR-H: the chip that names the Base recipe a Step comes from. A neutral tag, one line (system.md 6), never accent.
import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { baseChipText } from '../lib/baseSteps'
import { cookStrings } from '../strings'
import type { BaseRecipeLabel } from '../types'

export interface BaseRecipeChipProps {
  recipe: BaseRecipeLabel
}

/** A tag chip reading "Béchamel · Roux", announced as "Béchamel · Roux, Base recipe". Renders only; the text is the lib's. */
export function BaseRecipeChip({ recipe }: BaseRecipeChipProps): ReactNode {
  const text = baseChipText(recipe)
  return (
    <Chip kind="tag" label={cookStrings.baseRecipeChip(text)}>
      {text}
    </Chip>
  )
}
