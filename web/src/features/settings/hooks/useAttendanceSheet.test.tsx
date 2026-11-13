// B5-F1 (ADR 0014): the Who's eating sheet's data and save, for Plan and Today: Guests, the emptied-date hooks, toasts.
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { members, thursdayDinner } from '../components/fixtures'
import { mockApi, routerWrapper } from '../test-utils'
import type { DateAttendance } from '../types'
import { useAttendanceSheet } from './useAttendanceSheet'

afterEach(() => vi.unstubAllGlobals())

const target = { mealSlotId: 11, date: '2026-11-12' }
const PATH = '/api/meal-slots/11/attendance?date=2026-11-12'
const att: DateAttendance = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5, guests: 0, courses: [] }
const routes = (extra: Record<string, unknown> = {}) =>
  mockApi({ 'GET /api/members': members, 'GET /api/meal-slots': [thursdayDinner], [`GET ${PATH}`]: att, ...extra })

function setup(over: { beforeEmptying?: (t: typeof target) => Promise<boolean>; onEmptied?: (t: typeof target) => void } = {}) {
  const onClose = vi.fn()
  const view = renderHook(() => useAttendanceSheet(target, { onClose, ...over }), { wrapper: routerWrapper })
  return { ...view, onClose }
}

describe('useAttendanceSheet', () => {
  it('makes no request while closed', () => {
    const api = routes()
    const { result } = renderHook(() => useAttendanceSheet(null, { onClose: vi.fn() }), { wrapper: routerWrapper })
    expect(result.current.ready).toBe(false)
    expect(api.calls).toHaveLength(0)
  })

  it('loads the Meal Slot, the Members and the date\'s Attendance', async () => {
    routes()
    const { result } = setup()
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.slot?.id).toBe(11)
    expect(result.current.members.map((m) => m.name)).toEqual(['Anna', 'Marco', 'Sam'])
    expect(result.current.attendance?.guests).toBe(0)
  })

  it('save PUTs the Attendance with its Guests, toasts and closes', async () => {
    const api = routes({ [`PUT ${PATH}`]: { ...att, guests: 2 } })
    const { result, onClose } = setup()
    await waitFor(() => expect(result.current.ready).toBe(true))
    let ok = false
    await act(async () => {
      ok = await result.current.save(thursdayDinner.attendance, undefined, 2)
    })
    expect(ok).toBe(true)
    expect(api.callsTo('PUT', PATH)[0]?.body).toEqual({ attendance: thursdayDinner.attendance, guests: 2 })
    expect(await screen.findByText('Attendance saved for this date.')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('U1: an emptied date asks beforeEmptying first; a no stops the save', async () => {
    const api = routes({ [`PUT ${PATH}`]: att })
    const beforeEmptying = vi.fn(async () => false)
    const { result, onClose } = setup({ beforeEmptying })
    await waitFor(() => expect(result.current.ready).toBe(true))
    let ok = true
    await act(async () => {
      ok = await result.current.save([], undefined, undefined)
    })
    expect(beforeEmptying).toHaveBeenCalledWith(target)
    expect(ok).toBe(false)
    expect(api.callsTo('PUT', PATH)).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('U1: after a yes it saves, calls onEmptied instead of the "saved" toast, and closes', async () => {
    const api = routes({ [`PUT ${PATH}`]: { ...att, attendance: [] } })
    const onEmptied = vi.fn()
    const { result, onClose } = setup({ beforeEmptying: async () => true, onEmptied })
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => {
      await result.current.save([], undefined, undefined)
    })
    expect(api.callsTo('PUT', PATH)[0]?.body).toEqual({ attendance: [] })
    expect(onEmptied).toHaveBeenCalledWith(target)
    expect(screen.queryByText('Attendance saved for this date.')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('an emptied date with Guests is not emptied: no question, the usual toast', async () => {
    routes({ [`PUT ${PATH}`]: { ...att, attendance: [], guests: 2 } })
    const beforeEmptying = vi.fn(async () => true)
    const onEmptied = vi.fn()
    const { result } = setup({ beforeEmptying, onEmptied })
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => {
      await result.current.save([], undefined, 2)
    })
    expect(beforeEmptying).not.toHaveBeenCalled()
    expect(onEmptied).not.toHaveBeenCalled()
    expect(await screen.findByText('Attendance saved for this date.')).toBeInTheDocument()
  })

  it('a Courses-only save never counts as emptying', async () => {
    routes({ [`PUT ${PATH}`]: att })
    const beforeEmptying = vi.fn(async () => false)
    const { result } = setup({ beforeEmptying })
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => {
      await result.current.save(undefined, [{ courseId: 1, optOutMemberIds: [3] }])
    })
    expect(beforeEmptying).not.toHaveBeenCalled()
  })

  it('a refused save says why in a toast, resolves false and stays open', async () => {
    routes({ [`PUT ${PATH}`]: { status: 422, json: { error: { code: 'validation_failed', message: 'guests: must be between 0 and 20', field: 'guests', reason: 'guests_invalid' } } } })
    const { result, onClose } = setup()
    await waitFor(() => expect(result.current.ready).toBe(true))
    let ok = true
    await act(async () => {
      ok = await result.current.save(undefined, undefined, 25)
    })
    expect(ok).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('a started slot (409 slot_started) toasts the Plan sentence in GLOSSARY words, resolves false and stays open', async () => {
    routes({ [`PUT ${PATH}`]: { status: 409, json: { error: { code: 'slot_started', message: 'raw server text' } } } })
    const { result, onClose } = setup({ beforeEmptying: async () => true })
    await waitFor(() => expect(result.current.ready).toBe(true))
    let ok = true
    await act(async () => {
      ok = await result.current.save([], undefined, undefined)
    })
    expect(ok).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByText('Part of Dinner is already Cooked or Not cooked, so it cannot be left out.')).toBeInTheDocument()
  })

  it('reset DELETEs the date\'s Attendance (Guests too), toasts and closes', async () => {
    const api = routes({ [`DELETE ${PATH}`]: undefined })
    const { result, onClose } = setup()
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => {
      await result.current.reset()
    })
    expect(api.callsTo('DELETE', PATH)).toHaveLength(1)
    expect(await screen.findByText('Back to the usual Attendance.')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })
})
