// hf-recipes-filter: the Recipes list's filters in the URL: Kind, Course and Tags, with the chips derived from them
// (docs/design/recipes-filter.md 6; b8: several Tags, all needed). Every change replaces the history entry, as the Kind always did.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CourseChoice } from '../../../lib/courses'
import { withKind } from '../lib/baseRecipe'
import {
  activeFilterChips,
  filtersFromParams,
  toggleTag,
  withCourse,
  withoutFilters,
  withoutTag,
  type ActiveFilterChip,
  type ActiveFilterChipKey,
} from '../lib/recipeFilters'
import type { RecipeKind, TagCount } from '../types'

export interface UseRecipeFilters {
  kind: Exclude<RecipeKind, 'all'>
  setKind(kind: Exclude<RecipeKind, 'all'>): void
  /** The Course in force: null on Base recipes, or when the URL names no Course of the household. */
  course: number | null
  setCourse(id: number | null): void
  /** The Tags in force, in the order chosen; [] for none. */
  tags: string[]
  /** Choosing a Tag adds it; choosing one in force again removes just that Tag (matched by key). */
  toggleTag(name: string): void
  chips: ActiveFilterChip[]
  /** The filters in force: the Course and each Tag (the chips). */
  count: number
  /** Removes the one filter its chip stands for: 'course', or 'tag:<key>' for that Tag. */
  remove(key: ActiveFilterChipKey): void
  /** Drops the Course and every Tag; Kind and Sort stay. */
  clear(): void
}

export function useRecipeFilters(courses: readonly CourseChoice[], known: readonly TagCount[], colourOf?: (name: string) => string | undefined): UseRecipeFilters {
  const [params, setParams] = useSearchParams()
  const state = filtersFromParams(params, courses)
  const write = useCallback((edit: (prev: URLSearchParams) => URLSearchParams) => setParams((prev) => edit(prev), { replace: true }), [setParams])
  const chips = activeFilterChips(state, { courses, known, colourOf })
  return {
    kind: state.kind,
    setKind: (kind) => write((prev) => withKind(prev, kind)),
    course: state.kind === 'base' ? null : state.course,
    setCourse: (id) => write((prev) => withCourse(prev, id)),
    tags: state.tags,
    toggleTag: (name) => write((prev) => toggleTag(prev, name)),
    chips,
    count: chips.length,
    remove: (key) => write((prev) => (key === 'course' ? withCourse(prev, null) : withoutTag(prev, key.slice('tag:'.length)))),
    clear: () => write(withoutFilters),
  }
}
