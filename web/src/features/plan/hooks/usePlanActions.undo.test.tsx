// B9-26 (PC-01, SAFE-03 whole-slot Not cooked, SAFE-07): the plan writes show "What changed" with Review and Undo, and Undo is one
// POST /api/plan/restore with the token (never a second replan). The hooks run on a seeded query cache (the plan view and the User).
import { act, renderHook, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markKey } from '../lib/replan'
import { meal, mockApi } from '../test-utils'
import { cell, dinnerChange, findToastWith, lunchChange, noToast, pressInToast, seededClient, toastWith, wrapperFor } from '../test-utils.undo'
import { ApiError } from '../../../lib/http'
import { planApi } from '../api'
import { usePlanActions } from './usePlanActions'
import { useReplanReview } from './useReplanReview'

afterEach(() => vi.unstubAllGlobals())

const tueBreakfast = { date: '2026-11-17', mealSlotId: 1, courseId: 1 }
const tueBreakfastPath = '/api/plan/2026-11-17/1/1'
const written = (over: Record<string, unknown> = {}) => ({ ...meal({ date: '2026-11-17', mealSlotId: 1, recipeId: 21, pinned: true }), changes: [lunchChange, dinnerChange], undoToken: 'tok-1', ...over })

function setup(handlers: Record<string, unknown>) {
  const api = mockApi(handlers)
  const client = seededClient()
  const view = renderHook(() => ({ actions: usePlanActions(), review: useReplanReview() }), { wrapper: wrapperFor(client) })
  return { api, client, ...view }
}

describe('a Swap that changed other meals (PC-01)', () => {
  it('shows "Swapped Tue Breakfast" with the count, the meals, Review and Undo, and no status icon', async () => {
    const { result } = setup({ [`PUT ${tueBreakfastPath}`]: written() })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    const toast = await findToastWith('Swapped Tue Breakfast')
    expect(toast).toHaveTextContent('2 other meals changed')
    expect(toast).toHaveTextContent('Tue Lunch is now Chicken curry. Wed Dinner is now Lentil soup.')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    const names = [...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['Review 2 changed meals', 'Undo the Swap and 2 other changes', 'Dismiss'])
  })

  it('writes the one PUT, and the changed rows are marked "was ..." until the Plan is left', async () => {
    const { result, api } = setup({ [`PUT ${tueBreakfastPath}`]: written() })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
    expect(api.callsTo('PUT', tueBreakfastPath)[0]?.body).toEqual({ recipeId: 21 })
    expect(result.current.review.marks).toEqual({
      [markKey({ date: '2026-11-17', mealSlotId: 2, courseId: 1 })]: 'was Lentil soup',
      [markKey({ date: '2026-11-18', mealSlotId: 3, courseId: 1 })]: 'was Roast chicken',
    })
  })

  it('Undo is one POST to /api/plan/restore with the token: no second PUT, no unpin', async () => {
    const { result, api } = setup({ [`PUT ${tueBreakfastPath}`]: written(), 'POST /api/plan/restore': { changes: [lunchChange] } })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    await pressInToast(await findToastWith('Swapped Tue Breakfast'), /^Undo the Swap/)
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/restore')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/restore')[0]?.body).toEqual({ undoToken: 'tok-1' })
    expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
    expect(api.calls.some((c) => c.path.endsWith('/unpin'))).toBe(false)
    expect('restore' in result.current.actions).toBe(false)
  })

  it('after Undo the plan is read again and the marks are gone', async () => {
    const { result, client } = setup({ [`PUT ${tueBreakfastPath}`]: written(), 'POST /api/plan/restore': { changes: [] } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    invalidate.mockClear()
    await pressInToast(await findToastWith('Swapped Tue Breakfast'), /^Undo the Swap/)
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plan', 'view'] })))
    await waitFor(() => expect(result.current.review.marks).toEqual({}))
  })

  it('a refused Undo says "Nothing was undone" and why, and the plan is read again', async () => {
    const { result, client } = setup({
      [`PUT ${tueBreakfastPath}`]: written(),
      'POST /api/plan/restore': { status: 409, json: { error: { code: 'plan_changed', message: 'The plan changed' } } },
    })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    invalidate.mockClear()
    await pressInToast(await findToastWith('Swapped Tue Breakfast'), /^Undo the Swap/)
    const refused = await findToastWith('Nothing was undone')
    expect(refused).toHaveTextContent('The plan has changed since.')
    expect(refused).toHaveAttribute('data-status', 'warning')
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['plan', 'view'] }))
  })

  it('Review opens What changed grouped by day and takes the marks off the rows', async () => {
    const { result } = setup({ [`PUT ${tueBreakfastPath}`]: written() })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    expect(result.current.review.open).toBe(false)
    await pressInToast(await findToastWith('Swapped Tue Breakfast'), 'Review 2 changed meals')
    await waitFor(() => expect(result.current.review.open).toBe(true))
    expect(result.current.review.model?.context).toBe('After your Swap · 2 other meals')
    expect(result.current.review.model?.days.map((d) => d.heading)).toEqual(['Tue 17', 'Wed 18'])
    expect(result.current.review.marks).toEqual({})
    expect(result.current.review.canUndo).toBe(true)
  })

  // Batch w3e review: the toast's Undo pressed offline fails gracefully, as a warning that says Feeder is offline.
  it('an Undo pressed offline is the warning "Nothing was undone" / "Feeder is offline."', async () => {
    const { result } = setup({ [`PUT ${tueBreakfastPath}`]: written() })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    vi.spyOn(planApi, 'restore').mockRejectedValueOnce(new ApiError(0, 'network', 'The network is unreachable'))
    await pressInToast(await findToastWith('Swapped Tue Breakfast'), /^Undo the Swap/)
    const refused = await findToastWith('Nothing was undone')
    expect(refused).toHaveTextContent('Feeder is offline.')
    expect(refused).toHaveAttribute('data-status', 'warning')
  })

  it('"Undo all" in the sheet restores with the same token, closes the sheet and answers true', async () => {
    const { result, api } = setup({ [`PUT ${tueBreakfastPath}`]: written(), 'POST /api/plan/restore': { changes: [] } })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    act(() => result.current.review.openReview())
    let ok = false
    await act(async () => void (ok = await result.current.review.undoAll()))
    expect(ok).toBe(true)
    expect(api.callsTo('POST', '/api/plan/restore')[0]?.body).toEqual({ undoToken: 'tok-1' })
    expect(result.current.review.open).toBe(false)
  })

  it('"Undo all" refused (409) closes the sheet, shows the refused-Undo toast and answers false', async () => {
    const { result } = setup({
      [`PUT ${tueBreakfastPath}`]: written(),
      'POST /api/plan/restore': { status: 409, json: { error: { code: 'plan_changed', message: 'The plan changed' } } },
    })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    act(() => result.current.review.openReview())
    let ok = true
    await act(async () => void (ok = await result.current.review.undoAll()))
    expect(ok).toBe(false)
    expect(await findToastWith('Nothing was undone')).toHaveTextContent('The plan has changed since.')
    expect(result.current.review.open).toBe(false)
  })

  it('"Keep the changes" closes the sheet and writes nothing', async () => {
    const { result, api } = setup({ [`PUT ${tueBreakfastPath}`]: written() })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    act(() => result.current.review.openReview())
    act(() => result.current.review.keep())
    expect(result.current.review.open).toBe(false)
    expect(api.calls.filter((c) => c.method !== 'PUT')).toHaveLength(0)
  })

  it('the next write replaces the last: its changes are the ones marked and reviewed', async () => {
    const { result } = setup({
      [`PUT ${tueBreakfastPath}`]: written(),
      'PUT /api/plan/2026-11-18/3/1': written({ changes: [{ ...lunchChange, date: '2026-11-19' }], undoToken: 'tok-2' }),
    })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    await act(async () => void (await result.current.actions.setMeal({ date: '2026-11-18', mealSlotId: 3, courseId: 1 }, 22, 'swap')))
    expect(Object.keys(result.current.review.marks)).toEqual([markKey({ date: '2026-11-19', mealSlotId: 2, courseId: 1 })])
  })
})

describe('the marks stay until the Plan is left (PC-01)', () => {
  it('leaving the screen that shows them (its useReplanReview unmounts) clears them; the next screen starts clean', async () => {
    mockApi({ [`PUT ${tueBreakfastPath}`]: written() })
    const client = seededClient()
    const wrapper = wrapperFor(client)
    const actions = renderHook(() => usePlanActions(), { wrapper })
    const screenA = renderHook(() => useReplanReview(), { wrapper })
    await act(async () => void (await actions.result.current.setMeal(tueBreakfast, 21, 'swap')))
    await waitFor(() => expect(Object.keys(screenA.result.current.marks)).toHaveLength(2))
    screenA.unmount()
    const screenB = renderHook(() => useReplanReview(), { wrapper })
    expect(screenB.result.current.marks).toEqual({})
    expect(screenB.result.current.open).toBe(false)
  })
})

describe('writes with less to say', () => {
  it('a Swap with no other change is the one line "Swapped" with Undo, and no Review', async () => {
    const { result } = setup({ [`PUT ${tueBreakfastPath}`]: written({ changes: [] }) })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    const toast = await findToastWith('Swapped')
    expect(toast.querySelector('.toast__subline, .toast__body')).toBeNull()
    const names = [...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['Undo the Swap', 'Dismiss'])
    expect(result.current.review.marks).toEqual({})
  })

  it('an answer without a token (nothing to undo) still says what happened, with no Undo', async () => {
    const { result } = setup({ [`PUT ${tueBreakfastPath}`]: written({ undoToken: undefined }) })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    const toast = await findToastWith('Swapped Tue Breakfast')
    expect(within(toast)).toBeDefined()
    expect([...toast.querySelectorAll('button')].some((b) => b.textContent === 'Undo')).toBe(false)
    expect([...toast.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === 'Review 2 changed meals')).toBe(true)
  })

  it('Choose a Recipe is worded for a choice: "Recipe chosen for Tue Breakfast"', async () => {
    const { result } = setup({ [`PUT ${tueBreakfastPath}`]: written() })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21)))
    expect(await findToastWith('Recipe chosen for Tue Breakfast')).toHaveTextContent('2 other meals changed')
  })

  it('Pin that moved other meals says so with Undo; Pin that moved none says nothing (as before)', async () => {
    const { result, api } = setup({
      [`POST ${tueBreakfastPath}/confirm`]: written(),
      'POST /api/plan/2026-11-17/2/1/confirm': written({ changes: [], undoToken: 'tok-9' }),
      [`POST ${tueBreakfastPath}/unpin`]: written({ changes: [], undoToken: undefined }),
    })
    await act(async () => void (await result.current.actions.pin(tueBreakfast)))
    expect(await findToastWith('Pinned Tue Breakfast')).toHaveTextContent('2 other meals changed')
    await act(async () => void (await result.current.actions.pin({ date: '2026-11-17', mealSlotId: 2, courseId: 1 })))
    await act(async () => void (await result.current.actions.unpin(tueBreakfast)))
    expect(toastWith('Unpinned')).toBeUndefined()
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(3)
  })

  it('a failed write shows no toast, keeps the message and leaves nothing marked', async () => {
    const { result } = setup({ [`PUT ${tueBreakfastPath}`]: { status: 422, json: { error: { code: 'recipe_archived', message: 'The Recipe is archived' } } } })
    await act(async () => void (await result.current.actions.setMeal(tueBreakfast, 21, 'swap')))
    expect(result.current.actions.error).toBe('The Recipe is archived')
    noToast()
    expect(result.current.review.marks).toEqual({})
  })
})

describe('Regenerate (SAFE-07)', () => {
  const result18 = { placed: 20, kept: 3, unfilled: 1, changed: 18, changes: [lunchChange], undoToken: 'tok-r' }

  it('toasts "Plan regenerated: 18 Planned Meals changed" from the count the server gave, with Undo', async () => {
    const { result } = setup({ 'POST /api/plan/regenerate': result18 })
    let ok = false
    await act(async () => void (ok = await result.current.actions.regenerate()))
    expect(ok).toBe(true)
    const toast = await findToastWith('Plan regenerated: 18 Planned Meals changed')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    expect([...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Undo Regenerate', 'Dismiss'])
  })

  it('Undo restores the plan with the token and says "Your previous plan is back"', async () => {
    const { result, api } = setup({ 'POST /api/plan/regenerate': result18, 'POST /api/plan/restore': { changes: [lunchChange] } })
    await act(async () => void (await result.current.actions.regenerate()))
    await pressInToast(await findToastWith('Plan regenerated'), 'Undo Regenerate')
    expect(await findToastWith('Your previous plan is back')).toBeTruthy()
    expect(api.callsTo('POST', '/api/plan/restore')[0]?.body).toEqual({ undoToken: 'tok-r' })
  })

  it('Undo after another change: "Nothing was undone" and the reason', async () => {
    const { result } = setup({
      'POST /api/plan/regenerate': result18,
      'POST /api/plan/restore': { status: 409, json: { error: { code: 'plan_changed', message: 'changed' } } },
    })
    await act(async () => void (await result.current.actions.regenerate()))
    await pressInToast(await findToastWith('Plan regenerated'), 'Undo Regenerate')
    expect(await findToastWith('Nothing was undone')).toHaveTextContent('The plan has changed since.')
  })

  it('when nothing changed: "Plan regenerated: nothing needed to change", with no Undo', async () => {
    const { result } = setup({ 'POST /api/plan/regenerate': { placed: 20, kept: 3, unfilled: 0, changed: 0, changes: [] } })
    await act(async () => void (await result.current.actions.regenerate()))
    const toast = await findToastWith('Plan regenerated: nothing needed to change')
    expect([...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Dismiss'])
  })

  it('the busy flag still toggles', async () => {
    const { result } = setup({ 'POST /api/plan/regenerate': result18 })
    await act(async () => void (await result.current.actions.regenerate()))
    expect(result.current.actions.regenerating).toBe(false)
  })
})

describe('Not cooked: whole slot (SAFE-03)', () => {
  const slot = { date: '2026-11-14', mealSlotId: 3 }
  const meals = [meal({ date: '2026-11-14', mealSlotId: 3, courseId: 1, state: 'skipped' }), meal({ date: '2026-11-14', mealSlotId: 3, courseId: 2, state: 'skipped' })]

  it('acts at once, then offers Undo in a one-line toast "Sat Dinner marked Not cooked"', async () => {
    const { result } = setup({ 'POST /api/plan/2026-11-14/3/all/not-cooked': { meals } })
    let ok = false
    await act(async () => void (ok = await result.current.actions.notCookedSlot(slot)))
    expect(ok).toBe(true)
    const toast = await findToastWith('Sat Dinner marked Not cooked')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    expect(toast.querySelector('.toast__subline, .toast__body')).toBeNull()
    expect([...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Undo Not cooked for Sat Dinner', 'Dismiss'])
  })

  it('Undo reopens the action (through one of its Courses: the server takes back the whole action, not earlier marks) and says it is back in To confirm', async () => {
    const { result, api } = setup({
      'POST /api/plan/2026-11-14/3/all/not-cooked': { meals },
      'POST /api/plan/2026-11-14/3/1/reopen': { meals: meals.map((m) => ({ ...m, state: 'planned' })), stockGone: 0 },
    })
    await act(async () => void (await result.current.actions.notCookedSlot(slot)))
    await pressInToast(await findToastWith('Sat Dinner marked Not cooked'), 'Undo Not cooked for Sat Dinner')
    expect(await findToastWith('Sat Dinner is back in To confirm')).toBeTruthy()
    expect(api.callsTo('POST', '/api/plan/2026-11-14/3/1/reopen')).toHaveLength(1)
    expect(api.callsTo('POST', '/api/plan/2026-11-14/3/all/reopen')).toHaveLength(0)
  })

  it('nothing was marked (no meals in the answer): no toast', async () => {
    const { result } = setup({ 'POST /api/plan/2026-11-14/3/all/not-cooked': { meals: [] } })
    await act(async () => void (await result.current.actions.notCookedSlot(slot)))
    noToast()
  })

  it('a refused reopen reads "Nothing was undone" with its reason', async () => {
    const { result } = setup({
      'POST /api/plan/2026-11-14/3/all/not-cooked': { meals },
      'POST /api/plan/2026-11-14/3/1/reopen': { status: 409, json: { error: { code: 'reopen_window_over', message: 'late' } } },
    })
    await act(async () => void (await result.current.actions.notCookedSlot(slot)))
    await pressInToast(await findToastWith('Sat Dinner marked Not cooked'), 'Undo Not cooked for Sat Dinner')
    expect(await findToastWith('Nothing was undone')).toHaveTextContent('It is too late to undo it.')
  })
})

// kept for the unused-import check of `cell`
void cell
