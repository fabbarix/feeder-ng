// hf-recipes-filter: OptionList, an always-open searchable listbox: the panel of Select without its trigger (docs/design/recipes-filter.md
// 7.2). The caller filters and orders the options it passes; OptionList renders them and wires the keys.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { SearchField } from '../fields/SearchField'
import { firstEnabledIndex, nextEnabledIndex, type SelectOption } from './lib'
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
}

/** A search combobox over a listbox of options, always open. Arrows, Home and End move the active option; Enter toggles it. */
export function OptionList<V extends string | number>({ label, searchLabel, query, onQueryChange, options, selected, onToggle, emptyText = null }: OptionListProps<V>): ReactNode {
  const baseId = useId()
  const listId = `${baseId}-listbox`
  const optionId = (index: number) => `${baseId}-option-${index}`
  const [active, setActive] = useState(-1)
  const search = useRef<HTMLInputElement>(null)
  const activeId = active >= 0 && active < options.length ? optionId(active) : undefined

  // The active option scrolls into view whenever it changes (the list is capped and scrolls inside).
  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' })
    // optionId is stable for this list (it depends only on baseId), so only the active index drives the scroll.
  }, [active])

  const pick = (index: number) => {
    const option = options[index]
    if (option && !option.disabled) onToggle(option.value)
  }

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((a) => nextEnabledIndex(options, a, 1))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => nextEnabledIndex(options, a, -1))
        return
      case 'Home':
        e.preventDefault()
        setActive(firstEnabledIndex(options))
        return
      case 'End':
        e.preventDefault()
        setActive(lastEnabledIndex(options))
        return
      case 'Enter':
        if (active >= 0) {
          e.preventDefault()
          pick(active)
        }
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
      <div id={listId} role="listbox" aria-label={label} className="select__list option-list__list" onMouseDown={(e) => e.preventDefault()}>
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
      </div>
      {emptyText ? <p className="select__empty">{emptyText}</p> : null}
    </div>
  )
}

function lastEnabledIndex<V extends string | number>(options: SelectOption<V>[]): number {
  for (let i = options.length - 1; i >= 0; i--) if (!options[i]?.disabled) return i
  return -1
}
