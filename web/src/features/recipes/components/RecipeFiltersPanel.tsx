// hf-recipes-filter: the Filters panel: Course and Tag, then Clear filters and Show Recipes (docs/design/recipes-filter.md 4, 5, 8, 9).
// The shared FiltersPanel: a popover from 768 px and a bottom sheet below it.
import type { ReactNode, RefObject } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import { FilterSection, FiltersPanel } from '../../../ui'
import { CourseFilter } from './CourseFilter'
import { TagFilterList } from './TagFilterList'
import { recipeStrings } from '../strings'
import type { TagCount } from '../types'

export interface RecipeFiltersPanelProps {
  id?: string
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** Base recipes have no Course filter. */
  bases: boolean
  courses: readonly CourseChoice[]
  course: number | null
  onCourse: (id: number | null) => void
  known: TagCount[]
  /** The Tags in force, in the order chosen. */
  tags: string[]
  colourOf?: (name: string) => string | undefined
  /** Adds the Tag, or removes it when it is in force. */
  onToggleTag: (name: string) => void
  /** Filters in force: Clear filters is off while there are none. */
  count: number
  onClear: () => void
}

export function RecipeFiltersPanel({ id, open, onClose, anchorRef, bases, courses, course, onCourse, known, tags, colourOf, onToggleTag, count, onClear }: RecipeFiltersPanelProps): ReactNode {
  return (
    <FiltersPanel id={id} open={open} onClose={onClose} anchorRef={anchorRef} count={count} onClear={onClear} showLabel={recipeStrings.filters.showRecipes}>
      {bases || courses.length < 2 ? null : (
        <FilterSection heading={recipeStrings.filters.courseHeading}>
          <CourseFilter courses={courses} selected={course} onSelect={onCourse} />
        </FilterSection>
      )}
      <FilterSection heading={recipeStrings.filters.tagHeading} list>
        <TagFilterList known={known} selected={tags} colourOf={colourOf} onToggle={onToggleTag} />
      </FilterSection>
    </FiltersPanel>
  )
}
