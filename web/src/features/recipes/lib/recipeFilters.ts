// hf-recipes-filter: the pure filter state of the Recipes list header (docs/design/recipes-filter.md 6). Plain TypeScript, no React.
import type { CourseChoice } from '../../../lib/courses'
import type { FilterChip } from '../../../ui/FilterBar/types'
import { kindFromParams } from './baseRecipe'
import { tagKey } from './keys'
import { recipeStrings } from '../strings'
import type { RecipeKind, TagCount } from '../types'

export interface RecipeFilterState {
  kind: Exclude<RecipeKind, 'all'>
  /** The Course id in the URL, when it is one of the household's Courses (and there are at least two); else null. */
  course: number | null
  /** The Tag names in the URL (every ?tag=), in URL order; none = []. Cleaned by cleanTagNames. */
  tags: string[]
}

/** Trimmed names in order: blanks dropped, a repeat by key dropped (the first spelling stays). */
export function cleanTagNames(names: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of names) {
    const name = raw.trim()
    const key = tagKey(name)
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** Reads Kind, Course and Tag from the URL. A Course is a positive whole id of one of `courses`, and only while there are two or more. */
export function filtersFromParams(params: URLSearchParams, courses: readonly CourseChoice[]): RecipeFilterState {
  const raw = (params.get('course') ?? '').trim()
  const id = /^[1-9]\d*$/.test(raw) ? Number(raw) : null
  const known = courses.length >= 2 && id !== null && courses.some((c) => c.id === id)
  return { kind: kindFromParams(params), course: known ? id : null, tags: cleanTagNames(params.getAll('tag')) }
}

/** A copy with `course` set to the id, or removed for null. Other parameters are kept. */
export function withCourse(params: URLSearchParams, id: number | null): URLSearchParams {
  const next = new URLSearchParams(params)
  if (id === null) next.delete('course')
  else next.set('course', String(id))
  return next
}

/** A copy whose Tags are exactly `names` (cleaned; repeated ?tag=, escaped). Other parameters are kept; none removes them all. */
export function withTags(params: URLSearchParams, names: readonly string[]): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('tag')
  for (const name of cleanTagNames(names)) next.append('tag', name)
  return next
}

/** A copy where the Tag is added at the end, or removed when it is in force (matched by key). A blank name changes nothing. */
export function toggleTag(params: URLSearchParams, name: string): URLSearchParams {
  const key = tagKey(name)
  if (key === '') return new URLSearchParams(params)
  const names = cleanTagNames(params.getAll('tag'))
  const inForce = names.some((n) => tagKey(n) === key)
  return withTags(params, inForce ? names.filter((n) => tagKey(n) !== key) : [...names, name])
}

/** A copy without the Tag whose key is `key` (the other Tags stay, in order). */
export function withoutTag(params: URLSearchParams, key: string): URLSearchParams {
  return withTags(params, cleanTagNames(params.getAll('tag')).filter((n) => tagKey(n) !== key))
}

/** A copy without `course` and every `tag`; Kind, Sort and every other parameter are kept. */
export function withoutFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('course')
  next.delete('tag')
  return next
}

/** The key of a chip: 'course', or `tag:` + the Tag's key (one chip per Tag). */
export type ActiveFilterChipKey = 'course' | `tag:${string}`

/** A chip of the Recipes header's chip line (the shared FilterChip, keyed by Course or Tag). */
export type ActiveFilterChip = FilterChip<ActiveFilterChipKey>

export interface ActiveFilterChipContext {
  courses: readonly CourseChoice[]
  known: readonly TagCount[]
  colourOf?: (name: string) => string | undefined
}

/** The chips of the filters in force: the Course (not on Base recipes, nor an unknown one) first, then one chip per Tag in URL order, named as it is spelt in the household. */
export function activeFilterChips(state: RecipeFilterState, ctx: ActiveFilterChipContext): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
  if (state.kind === 'plannable' && state.course !== null) {
    const course = ctx.courses.find((c) => c.id === state.course)
    if (course) chips.push({ key: 'course', label: course.name, removeLabel: recipeStrings.filters.removeCourse(course.name) })
  }
  for (const name of state.tags) {
    const key = tagKey(name)
    if (key === '') continue
    const label = ctx.known.find((t) => tagKey(t.name) === key)?.name ?? name.trim()
    const colour = ctx.colourOf?.(label)
    chips.push({ key: `tag:${key}`, label, removeLabel: recipeStrings.filters.removeTag(label), ...(colour ? { tagColour: colour } : {}) })
  }
  return chips
}

/** The accessible name of the Filters button: "Filters", or "Filters, 2 active". */
export function filtersButtonLabel(count: number): string {
  return recipeStrings.filters.buttonLabel(count)
}

export { tagFilterRows, type TagFilterRow } from './tagRows'
