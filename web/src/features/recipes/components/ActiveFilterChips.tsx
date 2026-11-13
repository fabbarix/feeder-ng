// hf-recipes-filter: the line of active filter chips under the header rows: removable chips, and "+N" for those that do not fit
// (docs/design/recipes-filter.md 4, 5.4, 8, 13.1). While some chips are hidden, a copy of the line holds every real removable chip,
// inert and hidden, laid out at its natural width, so each chip is measured at its natural width whether it shows or not.
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Chip } from '../../../ui'
import { measureChipLine, useFittingChips, type ChipLineMetrics } from '../hooks/useFittingChips'
import type { ActiveFilterChip } from '../lib/recipeFilters'
import { recipeStrings } from '../strings'

/**
 * The natural width of each chip of a line, in order: its box, plus any part of its label the ellipsis cut (a shrunk chip's label
 * is narrower than its text, so the difference is measured back in).
 */
function naturalWidth(chip: HTMLElement): number {
  const label = chip.querySelector<HTMLElement>('.chip__label')
  const cut = label ? label.scrollWidth - label.clientWidth : 0
  return chip.getBoundingClientRect().width + Math.max(0, cut)
}

/** The line's metrics: the copy's chips while some are hidden (every chip is in it), else the shown chips, which are all there. */
function measureChips(line: HTMLElement): ChipLineMetrics {
  if (line.clientWidth === 0) return measureChipLine(line)
  const copy = line.querySelector<HTMLElement>(':scope > .recipe-filters__measure')
  const source = copy ?? line
  const chips = [...source.querySelectorAll<HTMLElement>(':scope > .chip')]
  const more = source.querySelector<HTMLElement>(':scope > .recipe-filters__more')
  return {
    available: line.clientWidth,
    widths: chips.map(naturalWidth),
    gap: parseFloat(getComputedStyle(line).columnGap) || 0,
    plusWidth: more ? more.getBoundingClientRect().width : 0,
  }
}

const noop = () => {}

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
  const { visible, hidden } = useFittingChips(line, chips.length, measureChips)
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
      {hidden > 0 ? (
        <div className="recipe-filters__measure" aria-hidden="true" inert>
          {chips.map((chip) => (
            <Chip key={chip.key} kind="tag" tagColour={chip.tagColour} removeLabel={chip.removeLabel} onRemove={noop}>
              {chip.label}
            </Chip>
          ))}
          <span className="recipe-filters__more">
            <Chip kind="count">+{chips.length}</Chip>
          </span>
        </div>
      ) : null}
    </div>
  )
}
