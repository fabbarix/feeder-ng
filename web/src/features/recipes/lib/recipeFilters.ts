// hf-recipes-filter: the pure filter state of the Recipes list header (docs/design/recipes-filter.md 6). Plain TypeScript, no React.
import type { CourseChoice } from '../../../lib/courses'
import { kindFromParams } from './baseRecipe'
import { tagKey } from './keys'
import type { RecipeKind, TagCount } from '../types'

export interface RecipeFilterState {
  kind: Exclude<RecipeKind, 'all'>
  /** The Course id in the URL, when it is one of the household's Courses (and there are at least two); else null. */
  course: number | null
  /** The Tag name in the URL, trimmed; '' when there is none. */
  tag: string
}

/** Reads Kind, Course and Tag from the URL. A Course is a positive whole id of one of `courses`, and only while there are two or more. */
export function filtersFromParams(params: URLSearchParams, courses: readonly CourseChoice[]): RecipeFilterState {
  const raw = (params.get('course') ?? '').trim()
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : null
  const known = courses.length >= 2 && id !== null && courses.some((c) => c.id === id)
  return { kind: kindFromParams(params), course: known ? id : null, tag: (params.get('tag') ?? '').trim() }
}

/** A copy with `course` set to the id, or removed for null. Other parameters are kept. */
export function withCourse(params: URLSearchParams, id: number | null): URLSearchParams {
  const next = new URLSearchParams(params)
  if (id === null) next.delete('course')
  else next.set('course', String(id))
  return next
}

/** A copy with `tag` set to the name, or removed for ''. The name is escaped by URLSearchParams. */
export function withTag(params: URLSearchParams, name: string): URLSearchParams {
  const next = new URLSearchParams(params)
  if (name === '') next.delete('tag')
  else next.set('tag', name)
  return next
}

/** A copy without `course` and `tag`; Kind, Sort and every other parameter are kept. */
export function withoutFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('course')
  next.delete('tag')
  return next
}

export interface ActiveFilterChip {
  key: 'course' | 'tag'
  label: string
  removeLabel: string
  /** A Tag's colour id, when it has one. */
  tagColour?: string
}

export interface ActiveFilterChipContext {
  courses: readonly CourseChoice[]
  known: readonly TagCount[]
  colourOf?: (name: string) => string | undefined
}

/** The chips of the filters in force: the Course (not on Base recipes, nor an unknown one) first, then the Tag, named as it is spelt in the household. */
export function activeFilterChips(state: RecipeFilterState, ctx: ActiveFilterChipContext): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
  if (state.kind === 'plannable' && state.course !== null) {
    const course = ctx.courses.find((c) => c.id === state.course)
    if (course) chips.push({ key: 'course', label: course.name, removeLabel: `Remove Course: ${course.name}` })
  }
  const tag = state.tag.trim()
  if (tag !== '') {
    const key = tagKey(tag)
    const label = ctx.known.find((t) => tagKey(t.name) === key)?.name ?? tag
    const colour = ctx.colourOf?.(label)
    chips.push({ key: 'tag', label, removeLabel: `Remove Tag: ${label}`, ...(colour ? { tagColour: colour } : {}) })
  }
  return chips
}

/** The accessible name of the Filters button: "Filters", or "Filters, 2 active". */
export function filtersButtonLabel(count: number): string {
  return count === 0 ? 'Filters' : `Filters, ${count} active`
}

export interface TagFilterRow {
  name: string
  recipes: number
  colour?: string
  selected: boolean
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/** Lower case, accents stripped, collapsed spaces: the form search compares. */
function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * The rows of the Tag list: the Tags whose name holds every word of `query` (accents and case ignored), the selected Tag
 * first (matched by key, and listed even when it is not a known Tag), then the others by name.
 */
export function tagFilterRows(known: readonly TagCount[], selected: string, query: string, colourOf?: (name: string) => string | undefined): TagFilterRow[] {
  const words = normalise(query).split(' ').filter(Boolean)
  const matches = (name: string) => {
    const haystack = normalise(name)
    return words.every((w) => haystack.includes(w))
  }
  const selectedKey = selected.trim() === '' ? '' : tagKey(selected)
  const rows: TagFilterRow[] = []
  if (selectedKey !== '') {
    const found = known.find((t) => tagKey(t.name) === selectedKey)
    const name = found?.name ?? selected.trim()
    if (matches(name)) rows.push({ name, recipes: found?.recipes ?? 0, colour: colourOf?.(name), selected: true })
  }
  const others = known.filter((t) => selectedKey === '' || tagKey(t.name) !== selectedKey)
  for (const t of [...others].sort((a, b) => collator.compare(a.name, b.name))) {
    if (matches(t.name)) rows.push({ name: t.name, recipes: t.recipes, colour: colourOf?.(t.name), selected: false })
  }
  return rows
}

/**
 * How many chips of a line show: all of them when they fit with their gaps, else as many as fit with a gap and the "+N" chip
 * (`plusWidth`) after them. At least one chip shows, and an unmeasured line (0 px) shows every chip.
 */
export function fitChips(widths: readonly number[], available: number, gap: number, plusWidth: number): { visible: number; hidden: number } {
  const n = widths.length
  if (n === 0) return { visible: 0, hidden: 0 }
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (n - 1)
  if (total <= available) return { visible: n, hidden: 0 }
  let visible = 1
  for (let k = n - 1; k >= 1; k--) {
    const used = widths.slice(0, k).reduce((sum, w) => sum + w, 0) + gap * (k - 1) + gap + plusWidth
    if (used <= available) {
      visible = k
      break
    }
  }
  return { visible, hidden: n - visible }
}
