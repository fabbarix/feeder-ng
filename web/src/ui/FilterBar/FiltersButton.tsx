// The Filters button of a filter header; its count chip shows while filters are on (docs/design/recipes-filter.md 4, 8; pantry-filter.md 5).
import type { ReactNode, Ref } from 'react'
import { Button } from '../Button'
import { Chip } from '../Chip'
import { filterBarStrings } from './strings'

export interface FiltersButtonProps {
  /** Filters in force. */
  count: number
  /** Whether the panel is open. */
  expanded: boolean
  /** The id of the panel this button opens. */
  controls?: string
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}

export function FiltersButton({ count, expanded, controls, onClick, ref }: FiltersButtonProps): ReactNode {
  return (
    <Button
      ref={ref}
      variant="secondary"
      size="sm"
      icon="filter"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={filterBarStrings.buttonLabel(count)}
      onClick={onClick}
    >
      {filterBarStrings.button}
      {count > 0 ? (
        <span aria-hidden="true">
          <Chip kind="count">{count}</Chip>
        </span>
      ) : null}
    </Button>
  )
}
