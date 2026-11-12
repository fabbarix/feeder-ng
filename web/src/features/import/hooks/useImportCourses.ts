import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useMe } from '../../../app/useMe'
import { connectEvents } from '../../../lib/sse'
import { useCourses } from '../../../lib/courses/useCourses'
import type { CourseChoice } from '../../../lib/courses'

export interface UseImportCourses {
  /** The active Courses, household order (react-query ['courses'], refetched on a household `courses` event). */
  courses: CourseChoice[]
  isAdmin: boolean
  isPending: boolean
}

/** CRS E2: the Courses an Import Review row can be answered with, and whether the User may add or unarchive one. */
export function useImportCourses(): UseImportCourses {
  const queryClient = useQueryClient()
  const { choices, isPending } = useCourses()
  const me = useMe()

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['courses'] })
    const off = connection.subscribe('household', (data) => {
      if (typeof data === 'object' && data !== null && (data as { changed?: unknown }).changed === 'courses') refresh()
    })
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [queryClient])

  return { courses: choices, isAdmin: me.data?.isAdmin === true, isPending }
}
