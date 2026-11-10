import { filterOptions, firstEnabledIndex, groupOptions, normalise, type OptionGroup, type SelectOption } from './lib'

export interface SelectSort<V extends string | number = string> {
  id: string
  label: string
  compare: (a: SelectOption<V>, b: SelectOption<V>) => number
}

export interface SelectFilter<V extends string | number = string> {
  id: string
  label: string
  predicate: (option: SelectOption<V>) => boolean
}

export interface ListInput<V extends string | number> {
  options: SelectOption<V>[]
  query: string
  /** Ids of the filter chips that are on (AND). */
  activeFilters: string[]
  filters: SelectFilter<V>[]
  sorts: SelectSort<V>[]
  sortIndex: number
  createLabel?: (query: string) => string
  canCreate: boolean
  /** WP3b: label of the clear row (e.g. "Any Shop"); it leads the list and is filtered by the query like an option. */
  clearLabel?: string
}

export interface BuiltList<V extends string | number> {
  groups: OptionGroup<V>[]
  /** What is shown, in display order. */
  flat: SelectOption<V>[]
  /** flat, plus the trailing "create" row when there is one. */
  nav: SelectOption<V>[]
  /** Label of the create row, if shown. */
  createText: string | null
  /** The first enabled index in nav, or -1. */
  firstEnabled: number
}

/** The visible, filtered, sorted and grouped list for a query. Pure: the Select component and its handlers both use it. */
export function buildList<V extends string | number>(input: ListInput<V>): BuiltList<V> {
  const chosen = input.filters.filter((f) => input.activeFilters.includes(f.id))
  const filtered = filterOptions(input.options, input.query).filter((o) => chosen.every((f) => f.predicate(o)))
  const sort = input.sorts[input.sortIndex]
  const sorted = sort ? [...filtered].sort(sort.compare) : filtered
  const clearRow: SelectOption<V>[] =
    input.clearLabel !== undefined && filterOptions([{ value: '' as V, label: input.clearLabel, clear: true }], input.query).length > 0
      ? [{ value: '' as V, label: input.clearLabel, clear: true }]
      : []
  const groups = [...(clearRow.length > 0 ? [{ group: null, options: clearRow }] : []), ...groupOptions(sorted)]
  const flat = groups.flatMap((g) => g.options)
  const trimmed = input.query.trim()
  const duplicate = input.options.some((o) => normalise(o.label) === normalise(trimmed))
  const createText = input.canCreate && trimmed !== '' && !duplicate ? (input.createLabel ?? defaultCreate)(trimmed) : null
  const nav: SelectOption<V>[] = createText ? [...flat, { value: '' as V, label: createText }] : flat
  return { groups, flat, nav, createText, firstEnabled: firstEnabledIndex(nav) }
}

const defaultCreate = (query: string) => `Create "${query}"`
