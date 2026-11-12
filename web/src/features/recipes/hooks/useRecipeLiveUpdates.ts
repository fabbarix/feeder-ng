import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'

/** Refreshes Recipe, Tag and preference data when another User changes them (SSE topic "recipes"). */
export function useRecipeLiveUpdates(): void {
  const client = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => {
      for (const key of [['recipes'], ['tags'], ['recipe-preferences']]) void client.invalidateQueries({ queryKey: key })
    }
    // CRS E2: a household Courses change (another User's rename, add or archive) names the Courses on the chips and in the editor.
    const refreshCourses = () => {
      for (const key of [['courses'], ['recipes']]) void client.invalidateQueries({ queryKey: key })
    }
    const off = connection.subscribe('recipes', (data) => {
      refresh()
      // C1 sends {"changed":"courses"} on this topic after an archive or delete of a Course.
      if (isCoursesChange(data)) void client.invalidateQueries({ queryKey: ['courses'] })
    })
    const offHousehold = connection.subscribe('household', (data) => {
      if (isCoursesChange(data)) refreshCourses()
    })
    const offReconnect = connection.onReconnect(() => {
      refresh()
      void client.invalidateQueries({ queryKey: ['courses'] })
    })
    return () => {
      off()
      offHousehold()
      offReconnect()
      connection.close()
    }
  }, [client])
}

function isCoursesChange(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { changed?: unknown }).changed === 'courses'
}
