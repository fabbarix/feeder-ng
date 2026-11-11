// CoursePicker (CRS D1): toggle chips in household order and, in the ordered form, the chosen Courses in the slot's order.
// It renders and wires events; the rules are in lib/courses (toggle, move, household order, validation).
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { moveItem, sortableStrings } from '../Sortable'
import {
  dropUnknownCourses,
  moveCourse,
  toggleOrdered,
  toggleUnordered,
  validateCourseIds,
  type CourseChoice,
} from '../../lib/courses'
import { CourseChips } from './CourseChips'
import { CourseList } from './CourseList'
import './CoursePicker.css'

/** What a row of the ordered picker gets to render its extra controls (D2: optional, attendance). */
export interface CoursePickerRowContext {
  course: CourseChoice
  /** Position in the chosen list, 0-based. */
  index: number
  /** How many Courses are chosen. */
  count: number
}

export interface CoursePickerProps {
  /** The visible group label ("Courses"); also the group's accessible name. */
  label: string
  /** The household's active Courses in household order. */
  courses: readonly CourseChoice[]
  /** Chosen Course ids. Ordered form: the Meal Slot's order. Unordered form: any order in, household order out. */
  value: readonly number[]
  onChange: (ids: number[]) => void
  /** Default true: the chosen Courses are also listed in their own order, with drag, Move up, Move down and Remove. */
  ordered?: boolean
  /** Default true: an empty choice shows "Choose at least one Course". */
  required?: boolean
  disabled?: boolean
  helper?: string
  /** Replaces the built-in "Choose at least one Course" message. */
  error?: string
  /**
   * Ordered form only: extra controls on each chosen row, after the name and before Move up (D2 adds "Optional" and the
   * attendance default here). Called once per row; never called by the unordered form.
   */
  renderRowExtras?: (row: CoursePickerRowContext) => ReactNode
}

/** Focus target after an update: a `data-focus-key` button inside the picker, or a finder for the chip. */
type FocusTarget = (root: HTMLElement) => HTMLElement | null | undefined

export function CoursePicker({
  label,
  courses,
  value,
  onChange,
  ordered = true,
  required = true,
  disabled,
  helper,
  error,
  renderRowExtras,
}: CoursePickerProps): ReactNode {
  const baseId = useId()
  const labelId = `${baseId}-label`
  const helperId = `${baseId}-helper`
  const errorId = `${baseId}-error`
  const mainId = `${baseId}-main`

  const rootRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<FocusTarget | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Ids the household does not list (archived, unknown) are not shown; the next change drops them.
  const shown = dropUnknownCourses(value, courses)
  const rows = shown.map((id) => courses.find((c) => c.id === id)).filter((c): c is CourseChoice => c !== undefined)
  const message = error ?? (required ? validateCourseIds(shown) : null)
  const describedBy = [helper ? helperId : null, message ? errorId : null].filter(Boolean).join(' ') || undefined

  // A button that moved or disappeared loses focus; put it back on the one the user used (or its opposite, at an edge).
  useLayoutEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    const root = rootRef.current
    if (!root) return
    const el = target(root)
    if (el && !el.hasAttribute('disabled')) el.focus()
  })

  const focusKey = (key: string): FocusTarget => (root) => root.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)

  const toggle = (id: number) => onChange(ordered ? toggleOrdered(shown, id) : toggleUnordered(shown, id, courses))

  const remove = (id: number) => {
    const name = courses.find((c) => c.id === id)?.name ?? ''
    pendingFocus.current = (root) => [...root.querySelectorAll<HTMLElement>('.chip')].find((el) => el.textContent === name)
    onChange(toggleOrdered(shown, id))
  }

  const move = (index: number, delta: -1 | 1) => {
    const next = moveCourse(shown, index, delta)
    if (next === shown) return
    const row = rows[index]
    if (!row) return
    const up = delta < 0 ? 'up' : 'down'
    const opposite = delta < 0 ? 'down' : 'up'
    const primary = focusKey(`${row.id}:${up}`)
    const fallback = focusKey(`${row.id}:${opposite}`)
    pendingFocus.current = (root) => primary(root) ?? fallback(root)
    setAnnouncement(sortableStrings.moved(row.name, index + delta + 1, shown.length))
    onChange([...next])
  }

  const reorder = (from: number, to: number) => onChange(moveItem(shown, from, to))

  return (
    <div ref={rootRef} className="course-picker" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      <span id={labelId} className="course-picker__label">
        {label}
      </span>
      <CourseChips courses={courses} chosen={shown} disabled={disabled} mainId={mainId} onToggle={toggle} />
      {ordered && (
        <CourseList
          label={label}
          rows={rows}
          disabled={disabled}
          renderRowExtras={renderRowExtras}
          onReorder={reorder}
          onMove={move}
          onRemove={remove}
        />
      )}
      {helper && (
        <p id={helperId} className="course-picker__helper">
          {helper}
        </p>
      )}
      {message && (
        <p id={errorId} role="alert" className="course-picker__error">
          {message}
        </p>
      )}
      <div role="status" aria-live="polite" aria-atomic="true" className="course-picker__live">
        {announcement}
      </div>
    </div>
  )
}
