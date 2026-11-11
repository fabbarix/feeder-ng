// Settings > Courses: the list, add, rename, Make main, reorder, Unarchive and the Delete / Archive dialog.
import { useState } from 'react'
import { useMe } from '../../../app/useMe'
import { ApiError } from '../../../lib/http'
import { validateCourseName, type Course } from '../../../lib/courses'
import { useCourses } from '../../../lib/courses/useCourses'
import { useToast } from '../../../ui'
import { coursesStrings as s } from '../coursesStrings'
import { canAddCourse, reorderedIds } from '../lib/courseList'
import { useCourseRemoval } from './useCourseRemoval'
import { useHouseholdLiveUpdates } from './useHouseholdLiveUpdates'
import type { RenameState } from '../components/CourseRow'

interface Renaming extends RenameState {
  id: number
}

/** The sentence for a refused add, rename or Unarchive: the server's own for a taken name, the 20 limit, else the usual one. */
function refusalMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'course_name_taken') return err.message
    if (err.code === 'too_many_courses') return s.atLimit
  }
  return s.actionFailed
}

export function useCoursesPage() {
  useHouseholdLiveUpdates()
  const toast = useToast()
  const isAdmin = Boolean(useMe().data?.isAdmin)
  const courses = useCourses({ includeArchived: true })
  const [newName, setNewName] = useState('')
  const [addError, setAddError] = useState<string>()
  const [renaming, setRenaming] = useState<Renaming | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)

  const removal = useCourseRemoval(courses, ({ mode, course }) =>
    toast.show(mode === 'delete' ? s.deleted(course.name) : s.archived(course.name), { status: 'success' }),
  )

  const active = courses.active
  const canAdd = canAddCourse(active.length)

  const add = async () => {
    const checked = validateCourseName(newName, courses.courses)
    if (!checked.ok) return setAddError(checked.message)
    setAddError(undefined)
    try {
      await courses.add(checked.name)
      setNewName('')
      toast.show(s.added(checked.name), { status: 'success' })
    } catch (err) {
      setAddError(refusalMessage(err))
    }
  }

  const startRename = (course: Course) => setRenaming({ id: course.id, value: course.name })

  const saveRename = async () => {
    if (!renaming) return
    const course = courses.courses.find((c) => c.id === renaming.id)
    if (!course) return setRenaming(null)
    const checked = validateCourseName(renaming.value, courses.courses, course.id)
    if (!checked.ok) return setRenaming({ ...renaming, error: checked.message })
    if (checked.name === course.name) return setRenaming(null)
    setRenaming({ ...renaming, value: checked.name, busy: true, error: undefined })
    try {
      await courses.rename(course.id, checked.name)
      setRenaming(null)
      toast.show(s.renamed(checked.name), { status: 'success' })
    } catch (err) {
      setRenaming({ ...renaming, busy: false, error: refusalMessage(err) })
    }
  }

  const makeMain = async (course: Course) => {
    try {
      await courses.makeMain(course.id)
      toast.show(s.nowMain(course.name), { status: 'success' })
    } catch {
      toast.show(s.actionFailed, { status: 'error' })
    }
  }

  const reorder = async (from: number, to: number) => {
    const ids = active.map((c) => c.id)
    const next = reorderedIds(ids, from, to)
    if (next.every((id, i) => id === ids[i])) return
    try {
      await courses.reorder(next)
    } catch {
      toast.show(s.actionFailed, { status: 'error' })
    }
  }

  const unarchive = async (course: Course) => {
    try {
      await courses.unarchive(course.id)
      toast.show(s.unarchived(course.name), { status: 'success' })
    } catch (err) {
      toast.show(refusalMessage(err), { status: 'error' })
    }
  }

  const onAction = (course: Course, action: 'rename' | 'makeMain' | 'delete') => {
    if (action === 'rename') startRename(course)
    else if (action === 'makeMain') void makeMain(course)
    else removal.open(course)
  }

  return {
    isAdmin,
    courses,
    active,
    archived: courses.archived,
    canAdd,
    newName,
    setNewName: (value: string) => {
      setNewName(value)
      setAddError(undefined)
    },
    addError,
    add,
    renaming,
    renameChange: (value: string) => setRenaming((r) => (r ? { ...r, value, error: undefined } : r)),
    saveRename,
    cancelRename: () => setRenaming(null),
    startRename,
    onAction,
    reorder,
    unarchive,
    archivedOpen,
    toggleArchived: () => setArchivedOpen((o) => !o),
    removal,
  }
}
