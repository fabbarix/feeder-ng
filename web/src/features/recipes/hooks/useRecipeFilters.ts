// hf-recipes-filter: the Recipes list's filters in the URL: Kind, Course and Tag, with the chips derived from them
// (docs/design/recipes-filter.md 6). Every change replaces the history entry, as the Kind always did.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CourseChoice } from '../../../lib/courses'
import { withKind } from '../lib/baseRecipe'
import { tagKey } from '../lib/keys'
import { activeFilterChips, filtersFromParams, withCourse, withTag, withoutFilters, type ActiveFilterChip } from '../lib/recipeFilters'
import type { RecipeKind, TagCount } from '../types'

export interface UseRecipeFilters {
  kind: Exclude<RecipeKind, 'all'>
  setKind(kind: Exclude<RecipeKind, 'all'>): void
  /** The Course in force: null on Base recipes, or when the URL names no Course of the household. */
  course: number | null
  setCourse(id: number | null): void
  /** The Tag in force, '' for none. */
  tag: string
  /** Choosing the Tag in force again clears it ('' clears too). */
  setTag(name: string): void
  chips: ActiveFilterChip[]
  count: number
  remove(key: 'course' | 'tag'): void
  clear(): void
}

export function useRecipeFilters(courses: readonly CourseChoice[], known: readonly TagCount[], colourOf?: (name: string) => string | undefined): UseRecipeFilters {
  const [params, setParams] = useSearchParams()
  const state = filtersFromParams(params, courses)
  const write = useCallback((edit: (prev: URLSearchParams) => URLSearchParams) => setParams((prev) => edit(prev), { replace: true }), [setParams])
  const chips = activeFilterChips(state, { courses, known, colourOf })
  const setTag = (name: string) => {
    const next = name !== '' && state.tag !== '' && tagKey(state.tag) === tagKey(name) ? '' : name
    write((prev) => withTag(prev, next))
  }
  return {
    kind: state.kind,
    setKind: (kind) => write((prev) => withKind(prev, kind)),
    course: state.kind === 'base' ? null : state.course,
    setCourse: (id) => write((prev) => withCourse(prev, id)),
    tag: state.tag,
    setTag,
    chips,
    count: chips.length,
    remove: (key) => write((prev) => (key === 'course' ? withCourse(prev, null) : withTag(prev, ''))),
    clear: () => write(withoutFilters),
  }
}
