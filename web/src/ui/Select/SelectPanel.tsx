import type { KeyboardEvent, RefObject } from 'react'
import { Chip } from '../Chip'
import { Icon } from '../Icon'
import { IconButton } from '../IconButton'
import { SearchField } from '../fields/SearchField'
import type { BuiltList, SelectFilter, SelectSort } from './buildList'
import { selectStrings } from './strings'
import type { SelectOption } from './lib'

export interface SelectPanelProps<V extends string | number> {
  listboxId: string
  labelId: string
  multi: boolean
  showSearch: boolean
  searchLabel: string
  query: string
  onQuery: (query: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  listRef: RefObject<HTMLDivElement | null>
  onKey: (e: KeyboardEvent<HTMLElement>) => void
  filters: SelectFilter<V>[]
  activeFilters: string[]
  onToggleFilter: (id: string) => void
  sorts: SelectSort<V>[]
  sortIndex: number
  onCycleSort: () => void
  list: BuiltList<V>
  selected: V[]
  active: number
  optionId: (index: number) => string
  activeId: string | undefined
  emptyText: string | null
  onPick: (index: number) => void
  onHover: (index: number) => void
}

/** The popover or sheet content: search, filter chips and sort, then the grouped listbox. Presentational. */
export function SelectPanel<V extends string | number>(p: SelectPanelProps<V>) {
  const sort = p.sorts[p.sortIndex]
  let index = 0
  const rows = p.list.groups.map((group) => ({
    group: group.group,
    items: group.options.map((option) => ({ option, index: index++ })),
  }))
  const renderOption = (option: SelectOption<V>, i: number) => {
    const isSelected = option.clear ? p.selected.length === 0 : p.selected.includes(option.value)
    return (
      <div
        key={`${i}-${option.label}`}
        id={p.optionId(i)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        aria-labelledby={`${p.optionId(i)}-label`}
        aria-describedby={option.meta ? `${p.optionId(i)}-meta` : undefined}
        data-active={i === p.active || undefined}
        className="select__option"
        onClick={() => p.onPick(i)}
        onMouseEnter={() => p.onHover(i)}
      >
        {option.leading ? <span className="select__leading" aria-hidden="true">
            {option.leading}
          </span> : null}
        <span className="select__text">
          <span id={`${p.optionId(i)}-label`} className="select__label">
            {option.label}
          </span>
          {option.meta ? (
            <span id={`${p.optionId(i)}-meta`} className="select__meta">
              {option.meta}
            </span>
          ) : null}
        </span>
        {isSelected ? <Icon name="tick" size={20} weight="fill" /> : null}
      </div>
    )
  }
  const createIndex = p.list.flat.length
  const hasTools = p.filters.length > 0 || p.sorts.length > 0
  return (
    <div className="select__panel">
      {p.showSearch ? (
        <SearchField
          ref={p.searchRef}
          label={p.searchLabel}
          value={p.query}
          onChange={p.onQuery}
          onKeyDown={p.onKey}
          aria-controls={p.listboxId}
          aria-activedescendant={p.activeId}
          aria-autocomplete="list"
        />
      ) : null}
      {hasTools ? (
        <div className="select__tools">
          {p.filters.map((f) => (
            <Chip key={f.id} kind="filter" selected={p.activeFilters.includes(f.id)} onClick={() => p.onToggleFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
          {sort ? <IconButton icon="sort" label={selectStrings.sort(sort.label)} onClick={p.onCycleSort} className="select__sort" /> : null}
        </div>
      ) : null}
      <div
        ref={p.listRef}
        id={p.listboxId}
        role="listbox"
        aria-labelledby={p.labelId}
        aria-multiselectable={p.multi || undefined}
        aria-activedescendant={p.activeId}
        tabIndex={-1}
        className="select__list"
        onKeyDown={p.onKey}
        onMouseDown={(e) => e.preventDefault()}
      >
        {rows.map((row, gi) => {
          const items = row.items.map(({ option, index: i }) => renderOption(option, i))
          if (row.group === null) return <div key={`ungrouped-${gi}`}>{items}</div>
          const titleId = `${p.listboxId}-group-${gi}`
          return (
            <div key={`group-${row.group}`} role="group" aria-labelledby={titleId} className="select__group">
              <div id={titleId} className="select__group-title">
                {row.group}
              </div>
              {items}
            </div>
          )
        })}
        {p.list.createText !== null ? (
          <div
            id={p.optionId(createIndex)}
            role="option"
            aria-selected={false}
            aria-labelledby={`${p.optionId(createIndex)}-label`}
            data-active={createIndex === p.active || undefined}
            className="select__option select__option--create"
            onClick={() => p.onPick(createIndex)}
            onMouseEnter={() => p.onHover(createIndex)}
          >
            <span className="select__leading" aria-hidden="true">
              <Icon name="add" size={20} />
            </span>
            <span className="select__text">
              <span id={`${p.optionId(createIndex)}-label`} className="select__label">
                {p.list.createText}
              </span>
            </span>
          </div>
        ) : null}
      </div>
      {p.emptyText ? <p className="select__empty">{p.emptyText}</p> : null}
    </div>
  )
}

