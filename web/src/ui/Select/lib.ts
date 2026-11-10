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
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Options whose label, meta or keywords contain every word of the query (normalised). Empty query returns all. */
export function filterOptions<V extends string | number>(options: SelectOption<V>[], query: string): SelectOption<V>[] {
  const words = normalise(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return options
  return options.filter((option) => {
    const haystack = normalise([option.label, option.meta ?? '', ...(option.keywords ?? [])].join(' '))
    return words.every((word) => haystack.includes(word))
  })
}

export function groupOptions<V extends string | number>(options: SelectOption<V>[]): OptionGroup<V>[] {
  const ungrouped = options.filter((o) => o.group === undefined)
  const groups = new Map<string, SelectOption<V>[]>()
  for (const option of options) {
    if (option.group === undefined) continue
    const bucket = groups.get(option.group) ?? []
    bucket.push(option)
    groups.set(option.group, bucket)
  }
  const out: OptionGroup<V>[] = []
  if (ungrouped.length > 0) out.push({ group: null, options: ungrouped })
  for (const [group, items] of groups) out.push({ group, options: items })
  return out
}

/** Index of the next non-disabled option from `from` in direction `delta`; stays at `from` at the ends (no wrap). from=-1 + delta 1 gives the first. */
export function nextEnabledIndex<V extends string | number>(options: SelectOption<V>[], from: number, delta: 1 | -1): number {
  let i = from + delta
  while (i >= 0 && i < options.length) {
    if (!options[i]?.disabled) return i
    i += delta
  }
  return from
}

/** Type-ahead: index of the first enabled option whose label starts with the buffer, or -1. A one-letter buffer starts after `activeIndex` (cycling); longer buffers start at it. Wraps. */
export function typeAheadMatch<V extends string | number>(options: SelectOption<V>[], buffer: string, activeIndex: number): number {
  const needle = normalise(buffer)
  const count = options.length
  if (needle === '' || count === 0) return -1
  const start = needle.length === 1 ? activeIndex + 1 : Math.max(activeIndex, 0)
  for (let step = 0; step < count; step++) {
    const i = (((start + step) % count) + count) % count
    const option = options[i]
    if (option && !option.disabled && normalise(option.label).startsWith(needle)) return i
  }
  return -1
}

/** Index of the first enabled option, or -1. */
export function firstEnabledIndex<V extends string | number>(options: SelectOption<V>[]): number {
  return options.findIndex((o) => !o.disabled)
}

export interface TypeAheadBuffer {
  text: string
  /** Time of the last keystroke (ms). */
  at: number
}

export const TYPE_AHEAD_WINDOW_MS = 500

/**
 * One typed character: it extends the buffer while keystrokes arrive within the window, else starts a new one.
 * `needle` is what to match: a repeated letter ("bb") matches the single letter, so it cycles.
 */
export function typeAheadStep(previous: TypeAheadBuffer, char: string, now: number): { buffer: TypeAheadBuffer; needle: string } {
  const text = now - previous.at > TYPE_AHEAD_WINDOW_MS ? char : previous.text + char
  const repeated = text.length > 1 && [...text].every((c) => c === text[0])
  return { buffer: { text, at: now }, needle: repeated ? (text[0] ?? '') : text }
}
