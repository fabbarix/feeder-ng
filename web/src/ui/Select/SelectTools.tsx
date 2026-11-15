// B9-15 (SET-06): the filter line of an open Select. One line: active filters first, then as many others as fit, then "+N"
// (aria-expanded), then the sort IconButton, which keeps its place at the end and never shrinks. "+N" expands the line in place and,
// expanded, reads "Fewer" (the same button, so focus stays on it). While some chips are hidden, an inert hidden copy holds every chip
// at its natural width, so the fit (useFittingChips) measures the same widths whether a chip shows or not.
import { useRef } from 'react'
import { Chip } from '../Chip'
import { IconButton } from '../IconButton'
import { useFittingChips, type ChipLineMetrics } from '../lib/useFittingChips'
import type { SelectFilter, SelectSort } from './buildList'
import { selectStrings } from './strings'

/** The line's room for chips (its inner width less the sort button and its gap), and each chip's natural width (from the copy). */
function measureTools(line: HTMLElement): ChipLineMetrics {
  if (line.clientWidth === 0) return { available: 0, widths: [], gap: 0, plusWidth: 0 }
  const cs = getComputedStyle(line)
  const gap = parseFloat(cs.columnGap) || 0
  const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
  const source = line.querySelector<HTMLElement>(':scope > .select__tools-measure') ?? line
  const sort = line.querySelector<HTMLElement>(':scope > .select__sort')
  const more = source.querySelector<HTMLElement>(':scope > .filter-chips__more')
  return {
    available: line.clientWidth - padding - (sort ? sort.getBoundingClientRect().width + gap : 0),
    widths: [...source.querySelectorAll<HTMLElement>(':scope > .chip')].map((c) => c.getBoundingClientRect().width),
    gap,
    plusWidth: more ? more.getBoundingClientRect().width : 0,
  }
}

export interface SelectToolsProps<V extends string | number> {
  filters: SelectFilter<V>[]
  activeFilters: string[]
  onToggleFilter: (id: string) => void
  sort: SelectSort<V> | undefined
  onCycleSort: () => void
  expanded: boolean
  onToggleExpanded: () => void
}

export function SelectTools<V extends string | number>({ filters, activeFilters, onToggleFilter, sort, onCycleSort, expanded, onToggleExpanded }: SelectToolsProps<V>) {
  const line = useRef<HTMLDivElement>(null)
  const ordered = [...filters.filter((f) => activeFilters.includes(f.id)), ...filters.filter((f) => !activeFilters.includes(f.id))]
  const { visible, hidden } = useFittingChips(line, ordered.length, measureTools)
  const shown = expanded ? ordered : ordered.slice(0, visible)
  const chip = (f: SelectFilter<V>) => (
    <Chip key={f.id} kind="filter" selected={activeFilters.includes(f.id)} title={f.label} onClick={() => onToggleFilter(f.id)}>
      {f.label}
    </Chip>
  )
  return (
    <div ref={line} className="select__tools" data-expanded={expanded ? 'true' : undefined}>
      {shown.map(chip)}
      {/* "+N" has no tooltip: its name ("+3 more filters") says it, and a title repeating the name is read a second time as its
          description. */}
      {hidden > 0 ? (
        <span className="filter-chips__more">
          <Chip kind="filter" aria-expanded={expanded} label={expanded ? undefined : selectStrings.moreFilters(hidden)} title={expanded ? selectStrings.fewerFilters : ''} onClick={onToggleExpanded}>
            {expanded ? selectStrings.fewerFilters : `+${hidden}`}
          </Chip>
        </span>
      ) : null}
      {sort ? <IconButton icon="sort" label={selectStrings.sort(sort.label)} onClick={onCycleSort} className="select__sort" /> : null}
      {hidden > 0 ? (
        <div className="select__tools-measure" aria-hidden="true" inert>
          {ordered.map((f) => (
            <Chip key={f.id} kind="filter" selected={activeFilters.includes(f.id)}>
              {f.label}
            </Chip>
          ))}
          <span className="filter-chips__more">
            <Chip kind="filter">{`+${ordered.length}`}</Chip>
          </span>
        </div>
      ) : null}
    </div>
  )
}
