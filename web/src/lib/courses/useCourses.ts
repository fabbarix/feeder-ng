// The Courses query and its writes (react-query). Not exported from the pure barrel index.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsKeys } from '../../features/settings/hooks/queryKeys'
import { coursesApi } from './api'
import { courseKeys } from './queryKeys'
import { activeCourses, mainCourse } from './order'
import type { Course, CourseChoice, CourseImpact } from './types'

export interface UseCoursesOptions {
  /** Ask for archived Courses too (`?archived=1`): only Settings > Courses does. Default false. */
  includeArchived?: boolean
}

export interface CoursesState {
  /** As served: household order, archived ones last when asked for. */
  courses: Course[]
  /** Not archived, household order. */
  active: Course[]
  archived: Course[]
  /** The active Courses as picker choices. */
  choices: CourseChoice[]
  main: Course | undefined
  isPending: boolean
  isError: boolean
  add: (name: string) => Promise<Course>
  rename: (id: number, name: string) => Promise<Course>
  makeMain: (id: number) => Promise<Course>
  /** The new order of every active Course. */
  reorder: (ids: number[]) => Promise<Course[]>
  loadImpact: (id: number) => Promise<CourseImpact>
  remove: (id: number, replacement?: number) => Promise<void>
  archive: (id: number, replacementId?: number) => Promise<Course>
  unarchive: (id: number) => Promise<Course>
  /** True while any write is in flight. */
  saving: boolean
}

const NO_COURSES: Course[] = []

export function useCourses({ includeArchived = false }: UseCoursesOptions = {}): CoursesState {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: courseKeys.list(includeArchived),
    queryFn: () => coursesApi.list(includeArchived),
  })
  // The Courses lists are refetched after a write. A Course's impact is read when its dialog opens, and a deleted Course's
  // impact answers 404: it is left out, so the dialog closes at once instead of waiting on retries of that 404.
  const refreshCourses = () =>
    queryClient.invalidateQueries({ queryKey: courseKeys.all, predicate: (query) => query.queryKey[1] !== 'impact' })
  const refreshAll = () =>
    Promise.all([refreshCourses(), queryClient.invalidateQueries({ queryKey: settingsKeys.slots })])

  const add = useMutation({ mutationFn: (name: string) => coursesApi.create(name), onSuccess: refreshCourses })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => coursesApi.update(id, { name }),
    onSuccess: async (renamed) => {
      await refreshCourses()
      // The PATCH answer is the Course as renamed: it is written over the refetched lists, so a list read that raced the
      // write cannot show the old name.
      queryClient.setQueriesData<Course[]>({ queryKey: courseKeys.all }, (old) =>
        Array.isArray(old) ? old.map((c) => (c.id === renamed.id ? renamed : c)) : old,
      )
      await queryClient.invalidateQueries({ queryKey: settingsKeys.slots })
    },
  })
  const makeMain = useMutation({
    mutationFn: (id: number) => coursesApi.update(id, { main: true }),
    onSuccess: refreshCourses,
  })
  const reorder = useMutation({ mutationFn: (ids: number[]) => coursesApi.reorder(ids), onSuccess: refreshCourses })
  const remove = useMutation({
    mutationFn: ({ id, replacement }: { id: number; replacement?: number }) => coursesApi.remove(id, replacement),
    onSuccess: refreshAll,
  })
  const archive = useMutation({
    mutationFn: ({ id, replacementId }: { id: number; replacementId?: number }) => coursesApi.archive(id, replacementId),
    onSuccess: refreshAll,
  })
  const unarchive = useMutation({ mutationFn: (id: number) => coursesApi.unarchive(id), onSuccess: refreshCourses })

  const courses = query.data ?? NO_COURSES
  const active = activeCourses(courses)
  return {
    courses,
    active,
    archived: courses.filter((c) => c.archived),
    choices: active.map(({ id, name, main }) => ({ id, name, main })),
    main: mainCourse(active),
    isPending: query.isPending,
    isError: query.isError,
    add: add.mutateAsync,
    rename: (id, name) => rename.mutateAsync({ id, name }),
    makeMain: (id) => makeMain.mutateAsync(id),
    reorder: reorder.mutateAsync,
    loadImpact: (id) => coursesApi.impact(id),
    remove: (id, replacement) => remove.mutateAsync({ id, replacement }),
    archive: (id, replacementId) => archive.mutateAsync({ id, replacementId }),
    unarchive: unarchive.mutateAsync,
    saving: add.isPending || rename.isPending || makeMain.isPending || reorder.isPending || remove.isPending || archive.isPending || unarchive.isPending,
  }
}
