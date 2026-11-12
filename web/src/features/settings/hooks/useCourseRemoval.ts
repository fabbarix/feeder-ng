// The state of the Delete / Archive dialog of a Course.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Course, CourseChoice, CourseImpact } from '../../../lib/courses'
import { ApiError } from '../../../lib/http'
import { courseKeys } from '../../../lib/courses/queryKeys'
import type { CoursesState } from '../../../lib/courses/useCourses'
import { defaultReplacement, isPlannedRefusal, needsReplacement as needsReplacementOf, removalErrorMessage, replacementChoices, type RemovalMode } from '../lib/courseRemoval'

export interface CourseRemovalState {
  /** The Course the dialog is about; null while it is closed. */
  course: Course | null
  mode: RemovalMode
  impact: CourseImpact | undefined
  /** The impact is being fetched. */
  loading: boolean
  loadFailed: boolean
  /** The Courses a replacement can be (active, not the Course itself). */
  choices: CourseChoice[]
  replacementId: number | null
  setReplacementId: (id: number) => void
  /** Some Recipe or Meal Slot has only this Course: the replacement is shown and sent. */
  needsReplacement: boolean
  busy: boolean
  error: string | undefined
  open: (course: Course) => void
  close: () => void
  /** Delete (mode delete) or Archive (mode archive); success closes and calls the hook's `onDone`. */
  confirm: () => Promise<void>
}

export function useCourseRemoval(
  courses: CoursesState,
  onDone?: (done: { mode: RemovalMode; course: Course }) => void,
): CourseRemovalState {
  const [course, setCourse] = useState<Course | null>(null)
  const [mode, setMode] = useState<RemovalMode>('delete')
  const [replacementId, setReplacementId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const queryClient = useQueryClient()
  const impactQuery = useQuery({
    queryKey: courseKeys.impact(course?.id ?? 0),
    queryFn: () => courses.loadImpact(course!.id),
    enabled: course !== null,
    // A 404 means the Course is gone: no retries, so the dialog does not wait on it.
    retry: (count, err) => {
      if (err instanceof ApiError && err.status === 404) return false
      const dflt = queryClient.getDefaultOptions().queries?.retry ?? 3
      return typeof dflt === 'function' ? dflt(count, err) : dflt === true || (typeof dflt === 'number' && count < dflt)
    },
  })
  const impact = course === null ? undefined : impactQuery.data
  const choices = course === null ? [] : replacementChoices(courses.choices, course)
  const needs = impact !== undefined && needsReplacementOf(impact)

  const open = (next: Course) => {
    setCourse(next)
    setMode('delete')
    setError(undefined)
    setReplacementId(defaultReplacement(replacementChoices(courses.choices, next)))
  }

  const close = () => {
    setCourse(null)
    setMode('delete')
    setError(undefined)
    setReplacementId(null)
  }

  const confirm = async () => {
    if (course === null || impact === undefined || busy) return
    const replacement = needs && replacementId !== null ? replacementId : undefined
    const current = mode
    setBusy(true)
    setError(undefined)
    try {
      if (current === 'delete') await courses.remove(course.id, replacement)
      else await courses.archive(course.id, replacement)
      close()
      onDone?.({ mode: current, course })
    } catch (err) {
      if (current === 'delete' && isPlannedRefusal(err)) setMode('archive')
      else setError(removalErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return {
    course,
    mode,
    impact,
    loading: course !== null && impactQuery.isLoading,
    loadFailed: course !== null && impactQuery.isError,
    choices,
    replacementId,
    setReplacementId,
    needsReplacement: needs,
    busy,
    error,
    open,
    close,
    confirm,
  }
}
