// B5-F1 (ADR 0014): the per-date choices end to end at hook level: dry run, confirm, write, toast with Undo, the time dialog, offline.
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, slot, wrapper } from '../test-utils'
import type { PlanSlot } from '../types'
import { useSlotDate } from './useSlotDate'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Thursday 12 Nov, Meal Slot 4.
const thu: PlanSlot = slot({ date: '2026-11-12', mealSlotId: 4, time: '20:15', usualTime: '19:30' })
const key = { date: '2026-11-12', mealSlotId: 4 }
const PATH = '/api/meal-slots/4/dates/2026-11-12'
const info = { date: '2026-11-12', notServed: false, time: null, usualTime: '19:30', guests: 0 }
const nothingGoes = { removes: { plannedMeals: [] } }
const something = { removes: { plannedMeals: [{ courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', pinned: true, bought: [] }] } }
const setup = () => renderHook(() => useSlotDate([thu]), { wrapper })

describe('useSlotDate: Not served', () => {
  it('applies at once when nothing is planned there, and toasts "Thu Dinner is not served" with Undo', async () => {
    const api = mockApi({ [`PATCH ${PATH}?dryRun=1`]: nothingGoes, [`PATCH ${PATH}`]: { ...info, notServed: true } })
    const { result } = setup()
    await act(async () => result.current.actions.onNotServed(key))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ notServed: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Thu Dinner is not served')).toBeInTheDocument()
  })

  it('Undo serves it again', async () => {
    const api = mockApi({ [`PATCH ${PATH}?dryRun=1`]: nothingGoes, [`PATCH ${PATH}`]: info })
    const { result } = setup()
    await act(async () => result.current.actions.onNotServed(key))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(2))
    expect(api.callsTo('PATCH', PATH)[1]?.body).toEqual({ notServed: false })
  })

  it('asks first when Planned Meals go, naming them; Cancel writes nothing', async () => {
    const api = mockApi({ [`PATCH ${PATH}?dryRun=1`]: something, [`PATCH ${PATH}`]: info })
    const { result } = setup()
    await act(async () => result.current.actions.onNotServed(key))
    const dialog = await screen.findByRole('dialog', { name: 'Not serving Thu Dinner?' })
    expect(dialog).toHaveTextContent('Roast chicken (Pinned)')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('PATCH', PATH)).toHaveLength(0)
  })

  it('writes after the confirm', async () => {
    const api = mockApi({ [`PATCH ${PATH}?dryRun=1`]: something, [`PATCH ${PATH}`]: { ...info, notServed: true } })
    const { result } = setup()
    await act(async () => result.current.actions.onNotServed(key))
    await userEvent.click(await screen.findByRole('button', { name: 'Not served' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ notServed: true })
  })

  it('a refused dry run (a Course is already Cooked) says so in a toast and writes nothing', async () => {
    const api = mockApi({
      [`PATCH ${PATH}?dryRun=1`]: { status: 422, json: { error: { code: 'validation_failed', message: 'no', field: 'notServed', reason: 'slot_started' } } },
    })
    const { result } = setup()
    await act(async () => result.current.actions.onNotServed(key))
    expect(await screen.findByText('Part of Dinner is already Cooked or Not cooked, so it cannot be left out.')).toBeInTheDocument()
    expect(api.callsTo('PATCH', PATH)).toHaveLength(0)
  })

  it('Plan Dinner again serves the date again', async () => {
    const api = mockApi({ [`PATCH ${PATH}`]: info })
    const { result } = setup()
    await act(async () => result.current.actions.onPlanAgain(key))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ notServed: false })
  })
})

describe('useSlotDate: the time dialog', () => {
  it('Time opens the dialog for the slot; Save PATCHes the time and closes it', async () => {
    const api = mockApi({ [`PATCH ${PATH}`]: { ...info, time: '21:00' } })
    const { result } = setup()
    act(() => result.current.actions.onTime(key))
    expect(result.current.timeSlot?.mealSlotId).toBe(4)
    await act(async () => {
      await result.current.saveTime('21:00')
    })
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ time: '21:00' })
    expect(result.current.timeSlot).toBeNull()
  })

  it('Back to the usual time PATCHes time null', async () => {
    const api = mockApi({ [`PATCH ${PATH}`]: info })
    const { result } = setup()
    act(() => result.current.actions.onTime(key))
    await act(async () => {
      await result.current.backToUsual()
    })
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ time: null })
    expect(result.current.timeSlot).toBeNull()
  })

  it('a refused time keeps the dialog open and says why', async () => {
    mockApi({ [`PATCH ${PATH}`]: { status: 422, json: { error: { code: 'validation_failed', message: 'no', field: 'time', reason: 'time_invalid' } } } })
    const { result } = setup()
    act(() => result.current.actions.onTime(key))
    let ok = true
    await act(async () => {
      ok = await result.current.saveTime('25:99')
    })
    expect(ok).toBe(false)
    expect(result.current.timeSlot).not.toBeNull()
    expect(await screen.findByText('Enter a time such as 19:30.')).toBeInTheDocument()
  })

  it('Cancel closes without a request', () => {
    const api = mockApi({})
    const { result } = setup()
    act(() => result.current.actions.onTime(key))
    act(() => result.current.closeTime())
    expect(result.current.timeSlot).toBeNull()
    expect(api.calls).toHaveLength(0)
  })
})

describe('useSlotDate: Who\'s eating', () => {
  it('opens and closes the sheet for the slot and date', () => {
    const { result } = setup()
    act(() => result.current.actions.onWhosEating(key))
    expect(result.current.whosEating.target).toEqual(key)
    act(() => result.current.whosEating.close())
    expect(result.current.whosEating.target).toBeNull()
  })

  it('U1: before an emptied date is saved it runs the Not served dry run; nothing planned lets the save go on without a dialog', async () => {
    const api = mockApi({ [`PATCH ${PATH}?dryRun=1`]: nothingGoes })
    const { result } = setup()
    let go = false
    await act(async () => {
      go = await result.current.whosEating.beforeEmptying(key)
    })
    expect(go).toBe(true)
    expect(api.callsTo('PATCH', `${PATH}?dryRun=1`)).toHaveLength(1)
    expect(api.callsTo('PATCH', PATH)).toHaveLength(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('U1: with Planned Meals it asks the same confirm; Cancel stops the save', async () => {
    mockApi({ [`PATCH ${PATH}?dryRun=1`]: something })
    const { result } = setup()
    let pending!: Promise<boolean>
    act(() => {
      pending = result.current.whosEating.beforeEmptying(key)
    })
    await screen.findByRole('dialog', { name: 'Not serving Thu Dinner?' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(pending).resolves.toBe(false)
  })

  it('a started slot (dry run refused with slot_started) stops the save and says why', async () => {
    mockApi({ [`PATCH ${PATH}?dryRun=1`]: { status: 422, json: { error: { code: 'validation_failed', message: 'no', field: 'notServed', reason: 'slot_started' } } } })
    const { result } = setup()
    let go = true
    await act(async () => {
      go = await result.current.whosEating.beforeEmptying(key)
    })
    expect(go).toBe(false)
    expect(await screen.findByText('Part of Dinner is already Cooked or Not cooked, so it cannot be left out.')).toBeInTheDocument()
  })

  it('after an emptied date is saved the toast says "Thu Dinner is not served" with Undo, which serves it again', async () => {
    const api = mockApi({ [`PATCH ${PATH}`]: info })
    const { result } = setup()
    act(() => result.current.whosEating.onEmptied(key))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ notServed: false })
    await waitFor(() => expect(screen.queryByText('Thu Dinner is not served')).not.toBeInTheDocument())
  })
})

describe('useSlotDate: offline', () => {
  it('follows the connection', () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get')
    online.mockReturnValue(false)
    const { result, unmount } = setup()
    expect(result.current.actions.offline).toBe(true)
    unmount()
    online.mockReturnValue(true)
    expect(setup().result.current.actions.offline).toBe(false)
  })

  it('makes no request while offline', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    const api = mockApi({})
    const { result } = setup()
    await act(async () => result.current.actions.onNotServed(key))
    await act(async () => result.current.actions.onPlanAgain(key))
    expect(api.calls).toHaveLength(0)
  })
})
