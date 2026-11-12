// useCourseRemoval (CRS D2): the Delete / Archive dialog's state machine.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCourses } from '../../../lib/courses/useCourses'
import { allCourses, emptyImpact, mainCourse, sideCourse, sideImpact, starterCourse } from '../components/courseFixtures'
import { mockApi, wrapper } from '../test-utils'
import { useCourseRemoval } from './useCourseRemoval'

afterEach(() => vi.unstubAllGlobals())

const LIST = 'GET /api/courses?archived=1'

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi({ [LIST]: { courses: allCourses }, 'GET /api/courses/2/impact': sideImpact, 'GET /api/courses/3/impact': emptyImpact, ...extra })
  const onDone = vi.fn()
  const view = renderHook(
    () => {
      const courses = useCourses({ includeArchived: true })
      return { courses, removal: useCourseRemoval(courses, onDone) }
    },
    { wrapper },
  )
  return { api, onDone, view }
}

describe('useCourseRemoval', () => {
  it('is closed until a Course is opened', async () => {
    const { view } = setup()
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    expect(view.result.current.removal).toMatchObject({ course: null, mode: 'delete', impact: undefined, loading: false })
  })

  it('open loads the impact; the replacement defaults to the main Course and cannot be the Course itself', async () => {
    const { view, api } = setup()
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    act(() => view.result.current.removal.open(sideCourse))
    expect(view.result.current.removal.loading).toBe(true)
    await waitFor(() => expect(view.result.current.removal.impact).toEqual(sideImpact))
    const r = view.result.current.removal
    expect(r).toMatchObject({ course: sideCourse, mode: 'delete', needsReplacement: true, replacementId: mainCourse.id, loading: false, busy: false, error: undefined })
    expect(r.choices.map((c) => c.name)).toEqual(['Main', 'Starter', 'Dessert'])
    expect(api.callsTo('GET', '/api/courses/2/impact')).toHaveLength(1)
  })

  it('Delete sends the chosen replacement', async () => {
    const { view, api, onDone } = setup({ 'DELETE /api/courses/2?replacement=4': { status: 204 } })
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    act(() => view.result.current.removal.open(sideCourse))
    await waitFor(() => expect(view.result.current.removal.impact).toBeDefined())
    act(() => view.result.current.removal.setReplacementId(4))
    await act(() => view.result.current.removal.confirm())
    expect(api.callsTo('DELETE', '/api/courses/2?replacement=4')).toHaveLength(1)
    expect(onDone).toHaveBeenCalledWith({ mode: 'delete', course: sideCourse })
    expect(view.result.current.removal.course).toBeNull()
  })

  it('sends no replacement when no Recipe or Meal Slot has only this Course', async () => {
    const { view, api, onDone } = setup({ 'DELETE /api/courses/3': { status: 204 } })
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    act(() => view.result.current.removal.open(starterCourse))
    await waitFor(() => expect(view.result.current.removal.impact).toEqual(emptyImpact))
    expect(view.result.current.removal.needsReplacement).toBe(false)
    await act(() => view.result.current.removal.confirm())
    expect(api.callsTo('DELETE', '/api/courses/3')).toHaveLength(1)
    expect(onDone).toHaveBeenCalledWith({ mode: 'delete', course: starterCourse })
  })

  it('a Course that was planned (409 course_planned) turns the dialog into Archive with the same replacement', async () => {
    const { view, api, onDone } = setup({
      'DELETE /api/courses/2?replacement=1': { status: 409, json: { error: { code: 'course_planned', message: 'planned' } } },
      'POST /api/courses/2/archive': { ...sideCourse, archived: true },
    })
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    act(() => view.result.current.removal.open(sideCourse))
    await waitFor(() => expect(view.result.current.removal.impact).toBeDefined())
    await act(() => view.result.current.removal.confirm())
    expect(view.result.current.removal).toMatchObject({ course: sideCourse, mode: 'archive', error: undefined, busy: false, replacementId: 1 })
    expect(onDone).not.toHaveBeenCalled()
    await act(() => view.result.current.removal.confirm())
    expect(api.callsTo('POST', '/api/courses/2/archive')[0]!.body).toEqual({ replacementId: 1 })
    expect(onDone).toHaveBeenCalledWith({ mode: 'archive', course: sideCourse })
    expect(view.result.current.removal.course).toBeNull()
  })

  it('a refusal stays on the dialog with its sentence', async () => {
    const { view, onDone } = setup({
      'DELETE /api/courses/2?replacement=1': { status: 409, json: { error: { code: 'course_main', message: 'main' } } },
    })
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    act(() => view.result.current.removal.open(sideCourse))
    await waitFor(() => expect(view.result.current.removal.impact).toBeDefined())
    await act(() => view.result.current.removal.confirm())
    expect(view.result.current.removal).toMatchObject({ course: sideCourse, mode: 'delete', error: 'Make another Course main first.', busy: false })
    expect(onDone).not.toHaveBeenCalled()
  })

  it('cannot confirm when the impact could not be loaded', async () => {
    const { view, api } = setup({ 'GET /api/courses/2/impact': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    act(() => view.result.current.removal.open(sideCourse))
    await waitFor(() => expect(view.result.current.removal.loadFailed).toBe(true))
    expect(view.result.current.removal.loading).toBe(false)
    await act(() => view.result.current.removal.confirm())
    expect(api.calls.some((c) => c.method === 'DELETE' || c.method === 'POST')).toBe(false)
  })

  it('close forgets the Course, the impact and the error', async () => {
    const { view } = setup()
    await waitFor(() => expect(view.result.current.courses.isPending).toBe(false))
    act(() => view.result.current.removal.open(sideCourse))
    await waitFor(() => expect(view.result.current.removal.impact).toBeDefined())
    act(() => view.result.current.removal.close())
    expect(view.result.current.removal).toMatchObject({ course: null, impact: undefined, error: undefined, mode: 'delete' })
  })
})
