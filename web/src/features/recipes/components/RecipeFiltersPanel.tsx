// hf-recipes-filter: the Filters panel: Course and Tag, then Clear filters and Done (docs/design/recipes-filter.md 4, 5, 8, 9).
// A popover from 768 px and a bottom sheet below it, both from the shared Popover.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import { Button, Popover } from '../../../ui'
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
  tag: string
  colourOf?: (name: string) => string | undefined
  onTag: (name: string) => void
  /** Filters in force: Clear filters is off while there are none. */
  count: number
  onClear: () => void
}

export function RecipeFiltersPanel({ id, open, onClose, anchorRef, bases, courses, course, onCourse, known, tag, colourOf, onTag, count, onClear }: RecipeFiltersPanelProps): ReactNode {
  const clear = useRef<HTMLButtonElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  // Clear filters turns off once it has nothing to clear: its focus moves to Done.
  useEffect(() => {
    if (!open || count > 0) return
    const active = document.activeElement
    if (active === clear.current || active === document.body || active === null) done.current?.focus()
  }, [count, open])

  return (
    <Popover
      id={id}
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      title={recipeStrings.filters.panelTitle}
      className="recipe-filters__panel"
      footer={
        <>
          <Button ref={clear} variant="tertiary" size="sm" disabled={count === 0} onClick={onClear}>
            {recipeStrings.filters.clear}
          </Button>
          <Button ref={done} variant="secondary" size="sm" onClick={onClose}>
            {recipeStrings.filters.close}
          </Button>
        </>
      }
    >
      {bases || courses.length < 2 ? null : (
        <section className="recipe-filters__section">
          <h3 className="recipe-filters__heading">{recipeStrings.filters.courseHeading}</h3>
          <CourseFilter courses={courses} selected={course} onSelect={onCourse} />
        </section>
      )}
      <section className="recipe-filters__section">
        <h3 className="recipe-filters__heading">{recipeStrings.filters.tagHeading}</h3>
        <div className="recipe-filters__tags">
          <TagFilterList known={known} selected={tag} colourOf={colourOf} onSelect={onTag} />
        </div>
      </section>
    </Popover>
  )
}
