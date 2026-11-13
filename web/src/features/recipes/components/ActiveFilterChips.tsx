// hf-recipes-filter: the line of active filter chips under the header rows: removable chips, and "+N" for those that do not fit
// (docs/design/recipes-filter.md 4, 5.4, 8). The chips are measured in a hidden copy of the line, so every chip has a width
// whether it shows or not.
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Chip } from '../../../ui'
import { measureChipLine, useFittingChips, type ChipLineMetrics } from '../hooks/useFittingChips'
import type { ActiveFilterChip } from '../lib/recipeFilters'
import { recipeStrings } from '../strings'

/** A removable chip is measured without its close icon: its 14 px icon and the 6 px gap before it. */
const REMOVE_ALLOWANCE = 20

function measureRemovable(el: HTMLElement): ChipLineMetrics {
  const m = measureChipLine(el)
  return { ...m, widths: m.widths.map((w) => (w > 0 ? w + REMOVE_ALLOWANCE : 0)) }
}

export interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[]
  onRemove: (key: 'course' | 'tag') => void
  /** The "+N" chip opens the panel. */
  onMore: () => void
  /** Where focus goes when the last chip is removed: the Filters button. */
  fallbackFocus?: RefObject<HTMLElement | null>
}

export function ActiveFilterChips({ chips, onRemove, onMore, fallbackFocus }: ActiveFilterChipsProps): ReactNode {
  const line = useRef<HTMLDivElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const { visible, hidden } = useFittingChips(measure, chips.length, measureRemovable)
  // Removing a chip moves focus to the chip that takes its place (or the "+N", or the Filters button when none is left).
  const focusIndex = useRef<number | null>(null)
  useLayoutEffect(() => {
    const index = focusIndex.current
    if (index === null) return
    focusIndex.current = null
    const buttons = [...(line.current?.querySelectorAll<HTMLButtonElement>(':scope > button.chip') ?? [])]
    const target = buttons[index] ?? line.current?.querySelector<HTMLElement>('.recipe-filters__more .chip') ?? buttons.at(-1) ?? fallbackFocus?.current
    target?.focus()
  })

  if (chips.length === 0) return null
  return (
    <div ref={line} role="group" aria-label={recipeStrings.filters.activeLabel} className="recipe-filters__chips">
      {chips.slice(0, visible).map((chip, i) => (
        <Chip
          key={chip.key}
          kind="tag"
          tagColour={chip.tagColour}
          removeLabel={chip.removeLabel}
          onRemove={() => {
            focusIndex.current = i
            onRemove(chip.key)
          }}
        >
          {chip.label}
        </Chip>
      ))}
      {hidden > 0 ? (
        <span className="recipe-filters__more">
          <Chip kind="count" label={recipeStrings.filters.moreLabel(hidden)} onClick={onMore}>
            +{hidden}
          </Chip>
        </span>
      ) : null}
      <div ref={measure} className="recipe-filters__measure" aria-hidden="true">
        {chips.map((chip) => (
          <Chip key={chip.key} kind="tag" tagColour={chip.tagColour}>
            {chip.label}
          </Chip>
        ))}
        <span className="recipe-filters__more">
          <Chip kind="count">+{chips.length}</Chip>
        </span>
      </div>
    </div>
  )
}
