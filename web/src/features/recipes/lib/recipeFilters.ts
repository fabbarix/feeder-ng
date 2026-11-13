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

/** A chip of the Recipes header's chip line (the shared FilterChip, keyed by Course or Tag). */
export type ActiveFilterChip = FilterChip<'course' | 'tag'>

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
    if (course) chips.push({ key: 'course', label: course.name, removeLabel: recipeStrings.filters.removeCourse(course.name) })
  }
  const tag = state.tag.trim()
  if (tag !== '') {
    const key = tagKey(tag)
    const label = ctx.known.find((t) => tagKey(t.name) === key)?.name ?? tag
    const colour = ctx.colourOf?.(label)
    chips.push({ key: 'tag', label, removeLabel: recipeStrings.filters.removeTag(label), ...(colour ? { tagColour: colour } : {}) })
  }
  return chips
}

/** The accessible name of the Filters button: "Filters", or "Filters, 2 active". */
export function filtersButtonLabel(count: number): string {
  return recipeStrings.filters.buttonLabel(count)
}

export { tagFilterRows, type TagFilterRow } from './tagRows'
