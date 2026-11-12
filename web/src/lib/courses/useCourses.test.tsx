// useCourses (CRS D2): the Courses query, the derived lists and the writes.
import { useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeCourses, allCourses, brunchCourse, mainCourse, sideCourse, sideImpact } from '../../features/settings/components/courseFixtures'
import { settingsKeys } from '../../features/settings/hooks/queryKeys'
import { mockApi, wrapper } from '../../features/settings/test-utils'
import { useCourses } from './useCourses'

afterEach(() => vi.unstubAllGlobals())

describe('useCourses', () => {
  it('loads the active Courses in household order and derives choices and the main Course', async () => {
    mockApi({ 'GET /api/courses': { courses: activeCourses } })
    const { result } = renderHook(() => useCourses(), { wrapper })
    expect(result.current.isPending).toBe(true)
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.courses).toEqual(activeCourses)
    expect(result.current.active).toEqual(activeCourses)
    expect(result.current.archived).toEqual([])
    expect(result.current.choices).toEqual([
      { id: 1, name: 'Main', main: true },
      { id: 2, name: 'Side', main: false },
      { id: 3, name: 'Starter', main: false },
      { id: 4, name: 'Dessert', main: false },
    ])
    expect(result.current.main).toEqual(mainCourse)
  })

  it('includeArchived asks for ?archived=1; archived Courses are not choices', async () => {
    const api = mockApi({ 'GET /api/courses?archived=1': { courses: allCourses } })
    const { result } = renderHook(() => useCourses({ includeArchived: true }), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(api.calls.map((c) => c.path)).toEqual(['/api/courses?archived=1'])
    expect(result.current.archived).toEqual([brunchCourse])
    expect(result.current.active).toHaveLength(4)
    expect(result.current.choices.map((c) => c.name)).toEqual(['Main', 'Side', 'Starter', 'Dessert'])
  })

  it('is in error when the list cannot be loaded', async () => {
    mockApi({ 'GET /api/courses': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    const { result } = renderHook(() => useCourses(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.courses).toEqual([])
  })

  it('add POSTs the name and shows the new Course after a refetch', async () => {
    let list = activeCourses
    const api = mockApi({
      'GET /api/courses': () => ({ courses: list }),
      'POST /api/courses': (c: { body: { name: string } }) => {
        const created = { id: 9, name: c.body.name, position: 4, main: false, archived: false, recipeCount: 0, mealSlotCount: 0, planned: false }
        list = [...list, created]
        return { status: 201, json: created }
      },
    })
    const { result } = renderHook(() => useCourses(), { wrapper })
    await waitFor(() => expect(result.current.active).toHaveLength(4))
    await act(() => result.current.add('Cheese'))
    expect(api.callsTo('POST', '/api/courses')[0]!.body).toEqual({ name: 'Cheese' })
    await waitFor(() => expect(result.current.active.map((c) => c.name)).toEqual(['Main', 'Side', 'Starter', 'Dessert', 'Cheese']))
  })

  it('rename, makeMain, reorder and unarchive call their routes and refetch', async () => {
    const api = mockApi({
      'GET /api/courses?archived=1': { courses: allCourses },
      'PATCH /api/courses/2': sideCourse,
      'PUT /api/courses/order': { courses: activeCourses },
      'POST /api/courses/5/unarchive': brunchCourse,
    })
    const { result } = renderHook(() => useCourses({ includeArchived: true }), { wrapper })
    await waitFor(() => expect(result.current.active).toHaveLength(4))
    await act(() => result.current.rename(2, 'Sides'))
    await act(() => result.current.makeMain(2))
    await act(() => result.current.reorder([2, 1, 3, 4]))
    await act(() => result.current.unarchive(5))
    expect(api.callsTo('PATCH', '/api/courses/2').map((c) => c.body)).toEqual([{ name: 'Sides' }, { main: true }])
    expect(api.callsTo('PUT', '/api/courses/order')[0]!.body).toEqual({ ids: [2, 1, 3, 4] })
    expect(api.callsTo('POST', '/api/courses/5/unarchive')).toHaveLength(1)
    await waitFor(() => expect(api.callsTo('GET', '/api/courses?archived=1').length).toBeGreaterThanOrEqual(5))
  })

  it('loadImpact answers the impact of a Course', async () => {
    mockApi({ 'GET /api/courses': { courses: activeCourses }, 'GET /api/courses/2/impact': sideImpact })
    const { result } = renderHook(() => useCourses(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(await result.current.loadImpact(2)).toEqual(sideImpact)
  })

  it('remove and archive send the replacement and refresh the Courses and the Meal Slots they were on', async () => {
    const api = mockApi({
      'GET /api/courses': { courses: activeCourses },
      'GET /api/meal-slots': [],
      'DELETE /api/courses/3?replacement=1': { status: 204 },
      'POST /api/courses/2/archive': { ...sideCourse, archived: true },
    })
    const { result } = renderHook(
      () => ({ courses: useCourses(), slots: useQueryProbe() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.courses.isPending).toBe(false))
    await waitFor(() => expect(api.callsTo('GET', '/api/meal-slots')).toHaveLength(1))
    await act(() => result.current.courses.remove(3, 1))
    await act(() => result.current.courses.archive(2, 1))
    expect(api.callsTo('POST', '/api/courses/2/archive')[0]!.body).toEqual({ replacementId: 1 })
    await waitFor(() => expect(api.callsTo('GET', '/api/meal-slots').length).toBeGreaterThanOrEqual(3))
  })

  it('a refused write rejects with the server error and leaves the list alone', async () => {
    mockApi({
      'GET /api/courses': { courses: activeCourses },
      'POST /api/courses': { status: 409, json: { error: { code: 'course_name_taken', message: 'There is already a Course with that name' } } },
    })
    const { result } = renderHook(() => useCourses(), { wrapper })
    await waitFor(() => expect(result.current.active).toHaveLength(4))
    await expect(result.current.add('Side')).rejects.toMatchObject({ status: 409, code: 'course_name_taken' })
    expect(result.current.active).toHaveLength(4)
  })
})

// A mounted Meal Slots query, standing in for the Meal Slots page.
function useQueryProbe() {
  return useQuery({ queryKey: settingsKeys.slots, queryFn: () => fetch('/api/meal-slots').then((r) => r.json()) })
}
