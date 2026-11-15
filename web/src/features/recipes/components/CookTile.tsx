import { useId, type ReactNode } from 'react'
import { Tile } from '../../../ui'
import { recipeStrings } from '../strings'
import { CookEntry, type CookEntryProps } from './CookEntry'

/**
 * RX-04: the Cook tile of Recipe detail from 1024 px of viewport, right under the hero: a section named by its "Cook" heading, the Batches
 * Stepper with its hint and a full-width primary "Start Cook Mode". Below 1024 px the same entry is the StickyActionBar instead.
 */
export function CookTile(props: Omit<CookEntryProps, 'placement'>): ReactNode {
  const titleId = useId()
  return (
    <Tile as="section" className="recipe-cook" aria-labelledby={titleId}>
      <h2 id={titleId} className="recipe-cook__title">
        {recipeStrings.cook.barLabel}
      </h2>
      <CookEntry {...props} placement="tile" />
    </Tile>
  )
}
