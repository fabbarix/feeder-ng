// CRS E2: Course answers, the 403 for a non-Admin and the cache refresh in the Import Review hook (docs/dev/design/crs-e2.md 4.2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { courseRow, plan } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ open: vi.fn(), plan: vi.fn(), confirm: vi.fn(), discard: vi.fn(), agentPrompt: vi.fn(), recipes: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useImportReview } from './useImportReview'

const withCourses = plan({
  courses: [courseRow({ key: 'soup', name: 'Soup' }), courseRow({ key: 'brunch', name: 'Brunch', status: 'archived' })],
})
const result = { recipes: [{ index: 0, id: 1, name: 'A', action: 'created' as const }], ingredientsCreated: 0, conversionsAdded: 0 }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useImportReview(), { wrapper }), spy }
}
const keys = (spy: ReturnType<typeof setup>['spy']) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)

beforeEach(() => {
  vi.clearAllMocks()
  api.open.mockResolvedValue({ id: 'r1', plan: withCourses })
  api.plan.mockResolvedValue({ id: 'r1', plan: withCourses })
  api.confirm.mockResolvedValue(result)
  api.discard.mockResolvedValue(undefined)
})

describe('useImportReview Course answers', () => {
  it('use sends the Course id with the other answers and shows the new plan', async () => {
    const { result: r } = setup()
    await act(() => r.current.open('{}'))
    act(() => r.current.chooseCourseUse('soup', 3))
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(1))
    expect(api.plan).toHaveBeenLastCalledWith('r1', { ingredients: [], conversions: [], recipes: [], courses: [{ key: 'soup', action: 'use', courseId: 3 }] })
    expect(r.current.decisions.courses).toEqual([{ key: 'soup', action: 'use', courseId: 3 }])
  })
  it('skip, add and unarchive each re-plan', async () => {
    const { result: r } = setup()
    await act(() => r.current.open('{}'))
    act(() => r.current.chooseCourseSkip('soup'))
    act(() => r.current.chooseCourseUnarchive('brunch'))
    act(() => r.current.chooseCourseAdd('soup'))
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(3))
    expect(api.plan).toHaveBeenLastCalledWith('r1', expect.objectContaining({
      courses: [{ key: 'soup', action: 'add' }, { key: 'brunch', action: 'unarchive' }],
    }))
  })
  it('keeps Ingredient answers when a Course is answered', async () => {
    const { result: r } = setup()
    await act(() => r.current.open('{}'))
    act(() => r.current.chooseExisting('onion', 5))
    act(() => r.current.chooseCourseSkip('soup'))
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(2))
    expect(api.plan).toHaveBeenLastCalledWith('r1', expect.objectContaining({ ingredients: [{ key: 'onion', action: 'use', ingredientId: 5 }], courses: [{ key: 'soup', action: 'skip' }] }))
  })
  it('sends the Course answers in Confirm', async () => {
    const { result: r } = setup()
    await act(() => r.current.open('{}'))
    act(() => r.current.chooseCourseUse('soup', 2))
    await act(() => r.current.confirm())
    expect(api.confirm).toHaveBeenCalledWith('r1', expect.objectContaining({ courses: [{ key: 'soup', action: 'use', courseId: 2 }] }))
  })
})

describe('useImportReview Confirm and Courses', () => {
  it('refreshes the Courses (and the Recipes) after a Confirm that added a Course', async () => {
    api.confirm.mockResolvedValue({ ...result, coursesCreated: 1 })
    const { result: r, spy } = setup()
    await act(() => r.current.open('{}'))
    await act(() => r.current.confirm())
    expect(keys(spy)).toEqual(expect.arrayContaining([['courses'], ['recipes']]))
    expect(r.current.result?.coursesCreated).toBe(1)
  })
  it('refreshes the Courses after a Confirm that brought one back', async () => {
    api.confirm.mockResolvedValue({ ...result, coursesUnarchived: 1 })
    const { result: r, spy } = setup()
    await act(() => r.current.open('{}'))
    await act(() => r.current.confirm())
    expect(keys(spy)).toEqual(expect.arrayContaining([['courses']]))
  })
  it('leaves the Courses alone after a Confirm that only used them', async () => {
    const { result: r, spy } = setup()
    await act(() => r.current.open('{}'))
    await act(() => r.current.confirm())
    expect(keys(spy)).not.toContainEqual(['courses'])
  })
})

describe('useImportReview: 403 forbidden for a non-Admin', () => {
  const forbid = () => api.confirm.mockRejectedValueOnce(new ApiError(403, 'forbidden', 'Only an Admin can do that'))
  async function refused() {
    forbid()
    const h = setup()
    await act(() => h.result.current.open('{}'))
    act(() => h.result.current.chooseExisting('onion', 5))
    act(() => h.result.current.chooseCourseAdd('soup'))
    act(() => h.result.current.chooseCourseUnarchive('brunch'))
    act(() => h.result.current.chooseCourseUse('dip', 2))
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(4))
    await act(() => h.result.current.confirm())
    return h
  }

  it('keeps the Review open and says so, without a file error', async () => {
    const { result: r } = await refused()
    expect(r.current.phase).toBe('reviewing')
    expect(r.current.courseForbidden).toBe(true)
    expect(r.current.error).toBeUndefined()
    expect(r.current.stale).toBe(false)
    expect(r.current.result).toBeUndefined()
  })
  it('drops the add and unarchive answers and keeps every other answer', async () => {
    const { result: r } = await refused()
    expect(r.current.decisions.courses).toEqual([{ key: 'dip', action: 'use', courseId: 2 }])
    expect(r.current.decisions.ingredients).toEqual([{ key: 'onion', action: 'use', ingredientId: 5 }])
  })
  it('asks the server for the plan without them, so the rows show their defaults again', async () => {
    const { result: r } = await refused()
    await waitFor(() => expect(api.plan).toHaveBeenCalledTimes(5))
    expect(api.plan).toHaveBeenLastCalledWith('r1', expect.objectContaining({ courses: [{ key: 'dip', action: 'use', courseId: 2 }] }))
    expect(r.current.phase).toBe('reviewing')
  })
  it('lets the User confirm again after answering with use or skip', async () => {
    const { result: r } = await refused()
    act(() => r.current.chooseCourseSkip('soup'))
    expect(r.current.courseForbidden).toBe(false)
    await act(() => r.current.confirm())
    expect(r.current.phase).toBe('done')
  })
  it('clears the notice when the Review is started over', async () => {
    const { result: r } = await refused()
    await act(() => r.current.reset())
    expect(r.current.courseForbidden).toBe(false)
  })
  it('a 403 that has nothing to do with Courses still shows as an error', async () => {
    forbid()
    const { result: r } = setup()
    await act(() => r.current.open('{}'))
    await act(() => r.current.confirm())
    expect(r.current.courseForbidden).toBe(false)
    expect(r.current.error).toEqual({ kind: 'other', message: 'Only an Admin can do that' })
  })
})

describe('useImportReview: too_many_courses', () => {
  it('an import_not_ready answer replaces the plan, Problem included', async () => {
    const full = plan({ ready: false, courses: [courseRow({ key: 'soup', effective: { key: 'soup', action: 'add' } })], problems: [{ path: '$.recipes[0].courses[0]', code: 'too_many_courses', message: 'x' }] })
    api.confirm.mockRejectedValueOnce(new ApiError(422, 'import_not_ready', 'not ready', { plan: full }))
    const { result: r } = setup()
    await act(() => r.current.open('{}'))
    await act(() => r.current.confirm())
    expect(r.current.plan).toEqual(full)
    expect(r.current.phase).toBe('reviewing')
    expect(r.current.courseForbidden).toBe(false)
  })
})
