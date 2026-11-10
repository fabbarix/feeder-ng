import type { ReactNode } from 'react'

export interface SelectOption<V extends string | number = string> {
  value: V
  label: string
  /** Second line, muted. */
  meta?: string
  /** Section subheader. Ungrouped options come first; groups keep first-appearance order. */
  group?: string
  /** Extra search terms. */
  keywords?: string[]
  disabled?: boolean
  /** 40 px thumb, icon, badge or avatar. */
  leading?: ReactNode
}

export interface OptionGroup<V extends string | number = string> {
  group: string | null
  options: SelectOption<V>[]
}

/** Lower-case, accents stripped, trimmed: the comparison form for search and type-ahead. */
export function normalise(_text: string): string {
  throw new Error('not implemented')
}

/** Options whose label, meta or keywords contain every word of the query (normalised). Empty query returns all. */
export function filterOptions<V extends string | number>(_options: SelectOption<V>[], _query: string): SelectOption<V>[] {
  throw new Error('not implemented')
}

export function groupOptions<V extends string | number>(_options: SelectOption<V>[]): OptionGroup<V>[] {
  throw new Error('not implemented')
}

/** Index of the next non-disabled option from `from` in direction `delta`; stays at `from` at the ends (no wrap). from=-1 + delta 1 gives the first. */
export function nextEnabledIndex<V extends string | number>(_options: SelectOption<V>[], _from: number, _delta: 1 | -1): number {
  throw new Error('not implemented')
}

/** Type-ahead: index of the first enabled option whose label starts with the buffer, or -1. A one-letter buffer starts after `activeIndex` (cycling); longer buffers start at it. Wraps. */
export function typeAheadMatch<V extends string | number>(_options: SelectOption<V>[], _buffer: string, _activeIndex: number): number {
  throw new Error('not implemented')
}
