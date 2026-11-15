// hf-recipes-filter: OptionList, an always-open searchable listbox: the panel of Select without its trigger (docs/design/recipes-filter.md
// 7.2). The caller filters and orders the options it passes; OptionList renders them and wires the keys.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { SearchField } from '../fields/SearchField'
import { firstEnabledIndex, nextEnabledIndex, normalise, optionsPerPage, pageIndex, type SelectOption } from './lib'
import { selectStrings } from './strings'
import './Select.css'

export interface OptionListProps<V extends string | number> {
  /** The name of the listbox. */
  label: string
  /** The name of the search field (a combobox over the listbox). */
  searchLabel: string
  query: string
  onQueryChange: (query: string) => void
  options: SelectOption<V>[]
  selected: V[]
  /** A click or Enter on an option; the list stays open. */
  onToggle: (value: V) => void
  /** Shown in place of the options (e.g. nothing matches). */
  emptyText?: string | null
  /** Several options may be selected at once (pantry-filter: Storage Places): the listbox says so (aria-multiselectable). */
  multiple?: boolean
  /**
   * RX-09: adds a create row (last) while the trimmed query matches no option exactly (case, accents and spaces aside). Choosing it, or
   * Enter or a comma with no active option and no exact match, calls this with the trimmed query and clears the query.
   */
  onCreate?: (query: string) => void
  /** The create row's label: "Add Tag "spic"". Default: Create "spic". */
  createLabel?: (query: string) => string
  /** The create row's second line: "New Tag, gets the next Tag colour". */
  createMeta?: string
}

/** The option whose label is the query, case, accents and spaces aside. */
function exactMatch<V extends string | number>(options: SelectOption<V>[], query: string): SelectOption<V> | undefined {
  const q = normalise(query).replace(/\s+/g, '')
  return q === '' ? undefined : options.find((o) => !o.disabled && normalise(o.label).replace(/\s+/g, '') === q)
}

/** A search combobox over a listbox of options, always open. Arrows, Home, End, PageUp and PageDown move the active option; Enter toggles it. */
export function OptionList<V extends string | number>({
  label,
  searchLabel,
  query,
  onQueryChange,
  options,
  selected,
  onToggle,
  emptyText = null,
  multiple = false,
  onCreate,
  createLabel = selectStrings.createDefault,
  createMeta,
}: OptionListProps<V>): ReactNode {
  const baseId = useId()
  const listId = `${baseId}-listbox`
  const optionId = (index: number) => `${baseId}-option-${index}`
  const [active, setActive] = useState(-1)
  const search = useRef<HTMLInputElement>(null)
  const trimmed = query.trim()
  const exact = exactMatch(options, trimmed)
  // The create row is navigated as one more option, after the last one.
  const createAt = onCreate && trimmed !== '' && !exact ? options.length : -1
  const nav: SelectOption<V | '__create'>[] = createAt >= 0 ? [...options, { value: '__create', label: trimmed }] : options
  const activeId = active >= 0 && active < nav.length ? optionId(active) : undefined

  // The active option scrolls into view whenever it changes (the list is capped and scrolls inside).
  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' })
    // optionId is stable for this list (it depends only on baseId), so only the active index drives the scroll.
  }, [active])

  const create = () => {
    if (!onCreate || trimmed === '') return
    onCreate(trimmed)
    onQueryChange('')
    setActive(-1)
  }

  const pick = (index: number) => {
    if (index === createAt) return create()
    const option = options[index]
    if (option && !option.disabled) onToggle(option.value)
  }

  /** Enter or a comma with no active option: the exact match is toggled, else the query is added. */
  const commit = () => {
    if (exact) {
      onToggle(exact.value)
      onQueryChange('')
      setActive(-1)
    } else create()
  }

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((a) => nextEnabledIndex(nav, a, 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => nextEnabledIndex(nav, a, -1))
        return
      case 'Home':
        e.preventDefault()
        setActive(firstEnabledIndex(nav))
        return
      case 'End':
        e.preventDefault()
        setActive(lastEnabledIndex(nav))
        return
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault()
        const size = optionsPerPage(document.getElementById(listId))
        const delta = e.key === 'PageDown' ? 1 : -1
        setActive((a) => pageIndex(nav, a, delta, size))
        return
      }
      case 'Enter':
        if (active >= 0 && active < nav.length) {
          e.preventDefault()
          pick(active)
        } else if (onCreate && trimmed !== '') {
          e.preventDefault()
          commit()
        }
        return
      case ',':
        // RX-09: a comma commits the text before it, so "quick, family" types fast. Without onCreate it is just a character.
        if (!onCreate) return
        e.preventDefault()
        commit()
    }
  }

  return (
    <div className="option-list">
      <SearchField
        ref={search}
        role="combobox"
        label={searchLabel}
        placeholder={searchLabel}
        value={query}
        onChange={(next) => {
          onQueryChange(next)
          setActive(-1)
        }}
        onKeyDown={onKey}
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
      />
      <div id={listId} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} className="select__list option-list__list" onMouseDown={(e) => e.preventDefault()}>
        {options.map((option, i) => {
          const isSelected = selected.includes(option.value)
          const labelId = `${optionId(i)}-label`
          const metaId = `${optionId(i)}-meta`
          return (
            <div
              key={`${i}-${option.label}`}
              id={optionId(i)}
              role="option"
              aria-selected={isSelected}
              aria-disabled={option.disabled || undefined}
              aria-labelledby={labelId}
              aria-describedby={option.meta ? metaId : undefined}
              data-active={i === active || undefined}
              className="select__option"
              onClick={() => pick(i)}
            >
              <span className="select__text">
                <span id={labelId} className="select__label">
                  {option.label}
                </span>
                {option.meta ? (
                  <span id={metaId} className="select__meta">
                    {option.meta}
                  </span>
                ) : null}
              </span>
              {option.leading ? (
                <span className="select__leading" aria-hidden="true">
                  {option.leading}
                </span>
              ) : null}
              {isSelected ? <Icon name="tick" size={20} weight="fill" /> : null}
            </div>
          )
        })}
        {createAt >= 0 ? (
          <div
            id={optionId(createAt)}
            role="option"
            aria-selected={false}
            aria-labelledby={`${optionId(createAt)}-label`}
            aria-describedby={createMeta ? `${optionId(createAt)}-meta` : undefined}
            data-active={createAt === active || undefined}
            className="select__option select__option--create"
            onClick={create}
          >
            <span className="select__leading" aria-hidden="true">
              <Icon name="add" size={20} />
            </span>
            <span className="select__text">
              <span id={`${optionId(createAt)}-label`} className="select__label">
                {createLabel(trimmed)}
              </span>
              {createMeta ? (
                <span id={`${optionId(createAt)}-meta`} className="select__meta">
                  {createMeta}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
      {emptyText && createAt < 0 ? <p className="select__empty">{emptyText}</p> : null}
    </div>
  )
}

function lastEnabledIndex<V extends string | number>(options: SelectOption<V>[]): number {
  for (let i = options.length - 1; i >= 0; i--) if (!options[i]?.disabled) return i
  return -1
}
