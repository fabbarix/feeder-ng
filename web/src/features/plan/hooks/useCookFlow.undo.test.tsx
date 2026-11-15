// B9-26 (SAFE-03): Cooked and Not cooked can be taken back from the toast: a rich Cooked toast (R-D, no icon) with an outline Undo,
// a one-line Not cooked toast, and Undo is POST .../reopen once. 2026-11-14 is a Saturday.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, mockApi, planCourse } from '../test-utils'
import { findToastWith, noToast, pressInToast, seededClient, toastWith, wrapperFor } from '../test-utils.undo'
import type { CookedResult, CookPreview } from '../types'
import { useCookFlow, useNotCooked } from './useCookFlow'

afterEach(() => vi.unstubAllGlobals())

const key = { date: '2026-11-14', mealSlotId: 1, courseId: 1 }
const base = '/api/plan/2026-11-14/1/1'
const stew = 'Slow cooker beef and barley stew'
const preview: CookPreview = {
  meal: courseMeal(1, 'Main', { date: '2026-11-14', mealSlotId: 1, recipeName: stew }), fresh: true, batches: 1, yield: 6, portionsNeeded: 4.75, proposedLeftover: 1.25,
  maxLeftover: 6, leftoverUseBy: '2026-11-17', needs: [],
}
const cooked: CookedResult = {
  meal: courseMeal(1, 'Main', { state: 'cooked', recipeName: stew }),
  leftover: { id: 3, recipeId: 7, recipeName: stew, portions: 1.25, cookedOn: '2026-11-14', useBy: '2026-11-17', fromDate: '2026-11-14', fromMealSlotId: 1 },
  warnings: [{ ingredientId: 11, name: 'barley', baseUnit: 'g', have: 0, need: 250, shortfall: 250, message: 'Stock shows no barley, the recipe uses 250 g' }],
  plannedFor: [],
}
const reopened = { meals: [courseMeal(1, 'Main', { state: 'planned' })], stockGone: 0 }

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi({ [`GET ${base}/cook`]: preview, [`POST ${base}/cooked`]: cooked, [`POST ${base}/reopen`]: reopened, [`POST ${base}/not-cooked`]: courseMeal(1, 'Main', { state: 'skipped' }), ...extra })
  const view = renderHook(() => ({ flow: useCookFlow(), notCooked: useNotCooked() }), { wrapper: wrapperFor(seededClient()) })
  return { api, ...view }
}
const buttons = (toast: HTMLElement) => [...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)

describe('Cooked in one tap (quickCook)', () => {
  it('shows the rich toast: "Cooked, nice one!", the meal and Recipe, where the Leftover went, an outline Undo and Dismiss; no icon', async () => {
    const { result } = setup()
    await act(async () => void (await result.current.flow.quickCook(key)))
    const toast = await findToastWith('Cooked, nice one!')
    expect(toast.querySelector('.toast__title')).toHaveTextContent('Cooked, nice one!')
    expect(toast.querySelector('.toast__subline')).toHaveTextContent(`Sat Breakfast · ${stew}`)
    expect(toast.querySelector('.toast__body')).toHaveTextContent('1.25 portions kept as a Leftover, good until Tue.')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    expect(buttons(toast)).toEqual(['Undo Cooked for Sat Breakfast', 'Dismiss'])
  })

  it('Undo is POST .../reopen, says "Sat Breakfast is back in To confirm", and takes the Stock shortfall notice away', async () => {
    const { result, api } = setup()
    await act(async () => void (await result.current.flow.quickCook(key)))
    expect(result.current.flow.warnings.map((w) => w.ingredientId)).toEqual([11])
    await pressInToast(await findToastWith('Cooked, nice one!'), 'Undo Cooked for Sat Breakfast')
    expect(await findToastWith('Sat Breakfast is back in To confirm')).toBeTruthy()
    expect(api.callsTo('POST', `${base}/reopen`)).toHaveLength(1)
    await waitFor(() => expect(result.current.flow.warnings).toEqual([]))
  })

  it('Undo runs once however often it is pressed', async () => {
    const { result, api } = setup()
    await act(async () => void (await result.current.flow.quickCook(key)))
    const toast = await findToastWith('Cooked, nice one!')
    const undo = toast.querySelector<HTMLButtonElement>('button[aria-label^="Undo Cooked"]')!
    await act(async () => {
      undo.click()
      undo.click()
    })
    await waitFor(() => expect(api.callsTo('POST', `${base}/reopen`)).toHaveLength(1))
  })

  it('Stock Lots that were already gone are said after Undo', async () => {
    const { result } = setup({ [`POST ${base}/reopen`]: { ...reopened, stockGone: 1 } })
    await act(async () => void (await result.current.flow.quickCook(key)))
    await pressInToast(await findToastWith('Cooked, nice one!'), 'Undo Cooked for Sat Breakfast')
    expect(await findToastWith('1 Stock Lot was already gone, so its Stock was not put back.')).toBeTruthy()
  })

  it.each([
    ['leftover_used', 'Some of the Leftover has been used.'],
    ['reopen_window_over', 'It is too late to undo it.'],
  ])('a refused Undo (%s) reads "Nothing was undone" with the reason, and the warnings stay', async (code, reason) => {
    const { result } = setup({ [`POST ${base}/reopen`]: { status: 409, json: { error: { code, message: code } } } })
    await act(async () => void (await result.current.flow.quickCook(key)))
    await pressInToast(await findToastWith('Cooked, nice one!'), 'Undo Cooked for Sat Breakfast')
    const refused = await findToastWith('Nothing was undone')
    expect(refused).toHaveTextContent(reason)
    expect(refused).toHaveAttribute('data-status', 'warning')
    expect(result.current.flow.warnings.map((w) => w.ingredientId)).toEqual([11])
  })

  it('a failed Cooked still says "That could not be saved. Nothing was changed." and offers no Undo', async () => {
    const { result } = setup({ [`POST ${base}/cooked`]: { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    await act(async () => void (await result.current.flow.quickCook(key)))
    const toast = await findToastWith('That could not be saved. Nothing was changed.')
    expect(buttons(toast).some((b) => b?.startsWith('Undo'))).toBe(false)
  })
})

describe('Mark as Cooked from the sheet', () => {
  it('confirm() shows the same Cooked toast with Undo', async () => {
    const { result, api } = setup()
    act(() => result.current.flow.open(key))
    await waitFor(() => expect(result.current.flow.cook.preview).not.toBeNull())
    await act(async () => void (await result.current.flow.confirm()))
    const toast = await findToastWith('Cooked, nice one!')
    expect(buttons(toast)).toEqual(['Undo Cooked for Sat Breakfast', 'Dismiss'])
    await pressInToast(toast, 'Undo Cooked for Sat Breakfast')
    await waitFor(() => expect(api.callsTo('POST', `${base}/reopen`)).toHaveLength(1))
  })

  it('"Not cooked" in the sheet (skip) shows "Sat Breakfast marked Not cooked" with Undo', async () => {
    const { result, api } = setup()
    act(() => result.current.flow.open(key))
    await waitFor(() => expect(result.current.flow.cook.preview).not.toBeNull())
    await act(async () => void (await result.current.flow.skip()))
    const toast = await findToastWith('Sat Breakfast marked Not cooked')
    expect(buttons(toast)).toEqual(['Undo Not cooked for Sat Breakfast', 'Dismiss'])
    await pressInToast(toast, 'Undo Not cooked for Sat Breakfast')
    expect(await findToastWith('Sat Breakfast is back in To confirm')).toBeTruthy()
    expect(api.callsTo('POST', `${base}/reopen`)).toHaveLength(1)
  })
})

describe('useNotCooked (a To confirm row, a Course menu, Cook Mode)', () => {
  it('acts at once and shows a one-line toast with Undo: no confirm, no icon', async () => {
    const { result, api } = setup()
    let ok = false
    await act(async () => void (ok = await result.current.notCooked(key)))
    expect(ok).toBe(true)
    expect(api.callsTo('POST', `${base}/not-cooked`)).toHaveLength(1)
    const toast = await findToastWith('Sat Breakfast marked Not cooked')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    expect(toast.querySelector('.toast__subline, .toast__body')).toBeNull()
    expect(buttons(toast)).toEqual(['Undo Not cooked for Sat Breakfast', 'Dismiss'])
  })

  it('names the Course when it is not the Main one: "Sat Dinner, Side marked Not cooked"', async () => {
    const { result } = setup({ 'POST /api/plan/2026-11-14/3/2/not-cooked': courseMeal(2, 'Side', { state: 'skipped' }) })
    await act(async () => void (await result.current.notCooked({ date: '2026-11-14', mealSlotId: 3, courseId: 2 })))
    expect(await findToastWith('Sat Dinner, Side marked Not cooked')).toBeTruthy()
  })

  it('Undo reopens the Course and says "Sat Breakfast is back in To confirm"', async () => {
    const { result, api } = setup()
    await act(async () => void (await result.current.notCooked(key)))
    await pressInToast(await findToastWith('Sat Breakfast marked Not cooked'), 'Undo Not cooked for Sat Breakfast')
    expect(await findToastWith('Sat Breakfast is back in To confirm')).toBeTruthy()
    expect(api.callsTo('POST', `${base}/reopen`)).toHaveLength(1)
  })

  it('a failure says so and resolves false, with no Undo', async () => {
    const { result } = setup({ [`POST ${base}/not-cooked`]: { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    let ok = true
    await act(async () => void (ok = await result.current.notCooked(key)))
    expect(ok).toBe(false)
    expect(await findToastWith('That could not be saved. Nothing was changed.')).toBeTruthy()
    expect(toastWith('marked Not cooked')).toBeUndefined()
  })

  it('names a meal that is only in the To confirm list (a day the plan view no longer holds)', async () => {
    const client = seededClient()
    const entry = { ...courseSlot([planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date: '2026-11-13', mealSlotId: 3 }) })], { date: '2026-11-13', mealSlotId: 3, name: 'Dinner', time: '19:00' }), courseId: 1, courseName: 'Main' }
    client.setQueryData(['plan', 'to-confirm'], { slots: [entry] })
    mockApi({ 'POST /api/plan/2026-11-13/3/1/not-cooked': courseMeal(1, 'Main', { state: 'skipped' }) })
    const { result } = renderHook(() => useNotCooked(), { wrapper: wrapperFor(client) })
    await act(async () => void (await result.current({ date: '2026-11-13', mealSlotId: 3, courseId: 1 })))
    expect(await findToastWith('Fri Dinner marked Not cooked')).toBeTruthy()
  })

  it('without a failure there is nothing else on screen before it acts', () => {
    setup()
    noToast()
  })
})
