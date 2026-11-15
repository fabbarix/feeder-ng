// B9-32 (PC-07, FLOW-18): the state of the "Mark Recipes as Dessert" sheet. The Recipes not marked with the Course, the ticks
// and the search; Mark is one POST that replans, and its toast's Undo unmarks the Recipes it newly marked (ruling 2).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useUndoToast, useToast } from '../../../ui'
import { http } from '../../../lib/http'
import { coursesApi } from '../../../lib/courses/api'
import { courseKeys } from '../../../lib/courses/queryKeys'
import { planApi } from '../api'
import { markedToast, markRows, needsCourseNames, tickedIds, type MarkableRecipe, type MarkRow } from '../lib/markRecipes'
import { planStrings as s } from '../strings'
import { invalidatePlan } from './planCache'

export interface MarkCourse {
  id: number
  name: string
}

export interface MarkCourseRecipes {
  /** 'loading' until the list is in; 'error' when it could not be read. */
  status: 'loading' | 'error' | 'ready'
  /** Every Recipe not yet marked with the Course (before the search). */
  total: number
  rows: MarkRow[]
  search: string
  setSearch: (q: string) => void
  toggle: (id: number) => void
  /** How many are ticked (the ticks are kept while the search narrows the list). */
  count: number
  saving: boolean
  /** The server's refusal, shown in the sheet as its form error. */
  error: string | null
  /** Marks the ticked Recipes; resolves true when it was done (the sheet then closes). */
  mark: () => Promise<boolean>
}

const NO_RECIPES: MarkableRecipe[] = []

export function useMarkCourseRecipes(course: MarkCourse): MarkCourseRecipes {
  const client = useQueryClient()
  const toast = useToast()
  const undoToast = useUndoToast()
  const list = useQuery({
    queryKey: ['recipes', 'notCourse', course.id],
    queryFn: () => http.get<MarkableRecipe[]>(`/api/recipes?notCourse=${course.id}`),
  })
  // A malformed answer (not a list) reads as a failed load rather than breaking the sheet.
  const malformed = list.data !== undefined && !Array.isArray(list.data)
  const recipes = Array.isArray(list.data) ? list.data : NO_RECIPES
  const courses = useQuery({ queryKey: courseKeys.list(false), queryFn: () => coursesApi.list(false), enabled: needsCourseNames(recipes) })
  const names = useMemo(() => new Map((courses.data ?? []).map((c) => [c.id, c.name] as const)), [courses.data])
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = useCallback((id: number) => {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const mark = useCallback(async () => {
    const ids = tickedIds(recipes, ticked)
    if (ids.length === 0) return false
    setSaving(true)
    setError(null)
    try {
      const res = await planApi.markRecipes(course.id, ids)
      const words = markedToast(res.marked, course.name, res.changes ?? [])
      const markedIds = res.markedIds ?? []
      if (markedIds.length > 0) {
        undoToast.show({
          headline: words.headline,
          subline: words.subline,
          restored: s.markSheet.unmarked(markedIds.length, course.name),
          undo: async () => {
            try {
              await planApi.unmarkRecipes(course.id, markedIds)
            } finally {
              await Promise.all([invalidatePlan(client), client.invalidateQueries({ queryKey: ['recipes'] })])
            }
          },
        })
      } else {
        toast.show({ status: 'success', title: words.headline, subline: words.subline })
      }
      await Promise.all([invalidatePlan(client), client.invalidateQueries({ queryKey: ['recipes'] })])
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }, [recipes, ticked, course.id, course.name, client, toast, undoToast])

  return {
    status: list.isPending ? 'loading' : list.isError || malformed ? 'error' : 'ready',
    total: recipes.length,
    rows: markRows(recipes, names, search, ticked),
    search,
    setSearch,
    toggle,
    count: ticked.size,
    saving,
    error,
    mark,
  }
}
