import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { BottomSheet } from '../BottomSheet'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Icon } from '../Icon'
import type { FieldSizeProps } from '../fields/Field'
import { FieldFrame, useFieldIds } from '../fields/FieldFrame'
import { buildList, type SelectFilter, type SelectSort } from './buildList'
import { SelectPanel } from './SelectPanel'
import { typeAheadMatch, typeAheadStep, nextEnabledIndex, firstEnabledIndex, type SelectOption, type TypeAheadBuffer } from './lib'
import { selectStrings } from './strings'
import './Select.css'

export type { SelectFilter, SelectSort } from './buildList'

export interface SelectFieldProps extends FieldSizeProps {
  label: string
  helper?: string
  error?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}

interface SelectBaseProps<V extends string | number> extends SelectFieldProps {
  options: SelectOption<V>[]
  /** Singular entity for copy: "No Recipe matches 'xyz'", search label "Search Recipe". Default: the label. */
  entityName?: string
  /** Default: shown when there are more than 8 options, or whenever `onCreate` is given. */
  searchable?: boolean
  filters?: SelectFilter<V>[]
  /** The first is the default. A sort IconButton "Sort: <label>" cycles through them. */
  sorts?: SelectSort<V>[]
  /** Adds a trailing "create" row when the query is non-empty and matches no label exactly. */
  onCreate?: (query: string) => void
  createLabel?: (query: string) => string
}

export interface SelectProps<V extends string | number = string> extends SelectBaseProps<V> {
  value: V | null
  onChange: (value: V) => void
  /**
   * WP3b: e.g. "Any Shop". The list starts with a clear row (selected while `value` is null); picking it calls
   * `onClear` (not `onChange`), closes the list, and the trigger shows this label while nothing is chosen.
   */
  clearLabel?: string
  onClear?: () => void
}

export interface MultiSelectProps<V extends string | number = string> extends SelectBaseProps<V> {
  values: V[]
  onChange: (values: V[]) => void
}

const SEARCH_THRESHOLD = 8
const OPEN_KEYS = ['Enter', ' ', 'ArrowDown', 'ArrowUp']
const KEY_CLICK_WINDOW_MS = 500

/** Single select: a combobox trigger, a popover from 768 px and a bottom sheet below. Picking closes it. */
export function Select<V extends string | number = string>({ value, onChange, clearLabel, onClear, ...rest }: SelectProps<V>): ReactNode {
  return (
    <SelectCore<V>
      {...rest}
      clearLabel={clearLabel}
      onClear={onClear}
      multi={false}
      selected={value === null ? [] : [value]}
      onPick={(picked) => onChange(picked)}
      closeOnPick
    />
  )
}

/** Multi select: picking toggles and the list stays open; the trigger summarises the selection. */
export function MultiSelect<V extends string | number = string>({ values, onChange, ...rest }: MultiSelectProps<V>): ReactNode {
  return (
    <SelectCore<V>
      {...rest}
      multi
      selected={values}
      onPick={(picked) => onChange(values.includes(picked) ? values.filter((v) => v !== picked) : [...values, picked])}
      closeOnPick={false}
    />
  )
}

interface CoreProps<V extends string | number> extends SelectBaseProps<V> {
  multi: boolean
  selected: V[]
  onPick: (value: V) => void
  closeOnPick: boolean
  clearLabel?: string
  onClear?: () => void
}

function SelectCore<V extends string | number>({
  label,
  helper,
  error,
  placeholder,
  disabled,
  required,
  options,
  entityName,
  searchable,
  filters = [],
  sorts = [],
  onCreate,
  createLabel,
  multi,
  selected,
  onPick,
  closeOnPick,
  clearLabel,
  onClear,
}: CoreProps<V>) {
  const ids = useFieldIds()
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const optionId = (index: number) => `${baseId}-option-${index}`
  const phone = !useMediaQuery('(min-width: 768px)')
  const entity = entityName ?? label
  // A create row needs a query to be typed, so a Select that can create is searchable whatever its size.
  const showSearch = searchable ?? (Boolean(onCreate) || options.length > SEARCH_THRESHOLD)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [sortIndex, setSortIndex] = useState(0)
  const [active, setActive] = useState(-1)
  const typed = useRef<TypeAheadBuffer>({ text: '', at: 0 })
  const keyHandledAt = useRef(0)
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const build = (q: string, filterIds: string[], sort: number) =>
    buildList<V>({ options, query: q, activeFilters: filterIds, filters, sorts, sortIndex: sort, createLabel, canCreate: Boolean(onCreate), clearLabel })
  const current = build(query, activeFilters, sortIndex)

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  const openList = () => {
    if (disabled) return
    const fresh = build('', [], sortIndex)
    setQuery('')
    setActiveFilters([])
    const selectedAt = fresh.flat.findIndex((o) => isChosen(o, selected))
    setActive(selectedAt >= 0 ? selectedAt : fresh.firstEnabled)
    setOpen(true)
  }

  const pickIndex = (index: number) => {
    const option = current.nav[index]
    if (!option || option.disabled) return
    if (current.createText !== null && index === current.flat.length) {
      onCreate?.(query.trim())
      close(true)
      return
    }
    if (option.clear) {
      onClear?.()
      close(true)
      return
    }
    onPick(option.value)
    if (closeOnPick) close(true)
  }

  const changeQuery = (next: string) => {
    setQuery(next)
    setActive(build(next, activeFilters, sortIndex).firstEnabled)
  }

  const toggleFilter = (id: string) => {
    const next = activeFilters.includes(id) ? activeFilters.filter((f) => f !== id) : [...activeFilters, id]
    setActiveFilters(next)
    setActive(build(query, next, sortIndex).firstEnabled)
    if (showSearch) search.current?.focus()
  }

  const cycleSort = () => {
    const next = (sortIndex + 1) % sorts.length
    setSortIndex(next)
    setActive(build(query, activeFilters, next).firstEnabled)
  }

  const step = (delta: 1 | -1) => setActive((a) => nextEnabledIndex(current.nav, a, delta))

  const typeAhead = (char: string) => {
    const step = typeAheadStep(typed.current, char, Date.now())
    typed.current = step.buffer
    const found = typeAheadMatch(current.flat, step.needle, active)
    if (found >= 0) setActive(found)
  }

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (disabled) return
    keyHandledAt.current = Date.now()
    if (!open) {
      if (OPEN_KEYS.includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    const typing = showSearch && e.target === search.current
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        return step(1)
      case 'ArrowUp':
        e.preventDefault()
        return step(-1)
      case 'Home':
        e.preventDefault()
        return setActive(firstEnabledIndex(current.nav))
      case 'End':
        e.preventDefault()
        return setActive(lastEnabledIndex(current.nav))
      case 'Enter':
        e.preventDefault()
        return pickIndex(active)
      case ' ':
        if (typing) return
        e.preventDefault()
        return pickIndex(active)
      case 'Escape':
        e.preventDefault()
        return close(true)
      case 'Tab':
        return close(false)
      default:
        if (!showSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault()
          typeAhead(e.key)
        }
    }
  }

  // Focus: the search field when there is one (popover); the sheet focuses its search or list itself.
  useEffect(() => {
    if (open && !phone && showSearch) search.current?.focus()
  }, [open, phone, showSearch])

  // Outside click closes the popover (the sheet is modal and closes on its backdrop).
  useEffect(() => {
    if (!open || phone) return
    const onDown = (e: MouseEvent) => {
      if (!anchor.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  const selectedOption = options.find((o) => selected.includes(o.value))
  const triggerText = multi
    ? options
        .filter((o) => selected.includes(o.value))
        .map((o) => o.label)
        .join(', ')
    : (selectedOption?.triggerLabel ?? selectedOption?.label ?? clearLabel ?? '')
  const activeId = open && active >= 0 ? optionId(active) : undefined
  const panel = (
    <SelectPanel<V>
      listboxId={listboxId}
      labelId={ids.labelId}
      multi={multi}
      showSearch={showSearch}
      searchLabel={selectStrings.searchFor(entity)}
      query={query}
      onQuery={changeQuery}
      searchRef={search}
      listRef={list}
      onKey={onKey}
      filters={filters}
      activeFilters={activeFilters}
      onToggleFilter={toggleFilter}
      sorts={sorts}
      sortIndex={sortIndex}
      onCycleSort={cycleSort}
      list={current}
      selected={selected}
      active={active}
      optionId={optionId}
      activeId={activeId}
      emptyText={current.flat.length === 0 && current.createText === null ? (query.trim() ? selectStrings.noMatch(entity, query.trim()) : selectStrings.noneToChoose(entity)) : null}
      onPick={pickIndex}
      onHover={setActive}
    />
  )

  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <div ref={anchor} className="select">
        <button
          ref={trigger}
          type="button"
          role="combobox"
          className="select__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={activeId}
          aria-labelledby={ids.labelId}
          aria-describedby={helper || error ? [helper ? ids.helperId : '', error ? ids.errorId : ''].filter(Boolean).join(' ') : undefined}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          disabled={disabled}
          data-placeholder={triggerText === '' ? '' : undefined}
          onClick={(e) => {
            // A click that follows a key the keydown handler already acted on (Space fires click on keyup) is ignored.
            if (e.detail === 0 && Date.now() - keyHandledAt.current < KEY_CLICK_WINDOW_MS) return
            if (open) close(true)
            else openList()
          }}
          onKeyDown={onKey}
        >
          {!multi && selectedOption?.leading ? <span className="select__leading">{selectedOption.leading}</span> : null}
          <span className="select__value">{triggerText === '' ? (placeholder ?? '') : triggerText}</span>
          <Icon name="expand" size={20} />
        </button>
        {open && !phone ? <div className="select__popover">{panel}</div> : null}
        <BottomSheet open={open && phone} onClose={() => close(true)} title={label} initialFocusRef={showSearch ? search : list}>
          {open && phone ? panel : null}
        </BottomSheet>
      </div>
    </FieldFrame>
  )
}

/** Whether an option is the current choice; the clear row is chosen while nothing is. */
function isChosen<V extends string | number>(option: SelectOption<V>, selected: V[]): boolean {
  return option.clear ? selected.length === 0 : selected.includes(option.value)
}

function lastEnabledIndex<V extends string | number>(options: SelectOption<V>[]): number {
  for (let i = options.length - 1; i >= 0; i--) if (!options[i]?.disabled) return i
  return -1
}
