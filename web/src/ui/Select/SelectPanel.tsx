import type { KeyboardEvent, RefObject } from 'react'
import { Icon } from '../Icon'
import { SearchField } from '../fields/SearchField'
import type { BuiltList, SelectFilter, SelectSort } from './buildList'
import { SelectTools } from './SelectTools'
import type { SelectOption } from './lib'

export interface SelectPanelProps<V extends string | number> {
  listboxId: string
  /** The field's label: the listbox's name. Given as text, not by id, because in a modal sheet the field's own label is outside the
   *  dialog (inert), and a name taken from an inert element is dropped from the accessibility tree. */
  label: string
  multi: boolean
  showSearch: boolean
  searchLabel: string
  query: string
  onQuery: (query: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  listRef: RefObject<HTMLDivElement | null>
  onKey: (e: KeyboardEvent<HTMLElement>) => void
  /** Escape from a control the search and the list do not handle (a filter chip, "+N", the sort button) closes the list. */
  onEscape: () => void
  filters: SelectFilter<V>[]
  activeFilters: string[]
  onToggleFilter: (id: string) => void
  sorts: SelectSort<V>[]
  sortIndex: number
  onCycleSort: () => void
  /** SET-06: "+N" has expanded the filter line. */
  toolsExpanded: boolean
  onToggleTools: () => void
  list: BuiltList<V>
  createDisabledReason?: string
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
        aria-describedby={
          // Round 4: described by its badge and then its meta, in that order (only the ones it shows).
          [option.badge ? `${p.optionId(i)}-badge` : '', option.meta ? `${p.optionId(i)}-meta` : ''].filter(Boolean).join(' ') || undefined
        }
        data-active={i === p.active || undefined}
        className="select__option"
        onClick={() => p.onPick(i)}
        onMouseEnter={() => p.onHover(i)}
      >
        <span className="select__text">
          <span id={`${p.optionId(i)}-label`} className="select__label">
            {option.label}
          </span>
          {option.badge ? (
            <span id={`${p.optionId(i)}-badge`} className="select__badge">
              {option.badge}
            </span>
          ) : null}
          {option.meta ? (
            <span id={`${p.optionId(i)}-meta`} className="select__meta">
              {option.meta}
            </span>
          ) : null}
        </span>
        {/* Decorative (aria-hidden), after the text in the DOM so the option's text starts with its name (a Thumb's monogram letter
            would otherwise lead it); `.select__option > .select__leading` draws it first. */}
        {option.leading ? (
          <span className="select__leading" aria-hidden="true">
            {option.leading}
          </span>
        ) : null}
        {isSelected ? <Icon name="tick" size={20} weight="fill" /> : null}
      </div>
    )
  }
  const createIndex = p.list.flat.length
  const hasTools = p.filters.length > 0 || p.sorts.length > 0
  return (
    <div
      className="select__panel"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        p.onEscape()
      }}
    >
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
        <SelectTools<V>
          filters={p.filters}
          activeFilters={p.activeFilters}
          onToggleFilter={p.onToggleFilter}
          sort={sort}
          onCycleSort={p.onCycleSort}
          expanded={p.toolsExpanded}
          onToggleExpanded={p.onToggleTools}
        />
      ) : null}
      <div
        ref={p.listRef}
        id={p.listboxId}
        role="listbox"
        aria-label={p.label}
        aria-multiselectable={p.multi || undefined}
        aria-activedescendant={p.activeId}
        // A Tab stop after the search and the tools, so the list is reached by Tab as well as by the arrows from the search.
        tabIndex={0}
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
            aria-disabled={p.createDisabledReason ? true : undefined}
            aria-labelledby={`${p.optionId(createIndex)}-label`}
            aria-describedby={p.createDisabledReason ? `${p.optionId(createIndex)}-meta` : undefined}
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
              {p.createDisabledReason ? (
                <span id={`${p.optionId(createIndex)}-meta`} className="select__meta">
                  {p.createDisabledReason}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
      {p.emptyText ? <p className="select__empty">{p.emptyText}</p> : null}
    </div>
  )
}

