// B9-26 (SAFE-03, user decision): a Mark all Cooked is undone as a whole: "Undo Cooked for all 3 Courses". The server reopens the whole
// action from any one of its Courses, so Undo posts to the first Course's reopen (the slot-wide .../all/reopen would also reopen
// Courses marked earlier on their own).
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allCookedResult, courseMeal, mockApi } from '../test-utils'
import { findToastWith, pressInToast, seededClient, wrapperFor } from '../test-utils.undo'
import type { CookPreview } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'

afterEach(() => vi.unstubAllGlobals())

const slotKey = { date: '2026-11-14', mealSlotId: 3 }
const base = '/api/plan/2026-11-14/3'
const preview = (courseId: number, courseName: string): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName: 'R', mealSlotId: 3, date: '2026-11-14' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
  proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-17', needs: [],
})
const routes = (extra: Record<string, unknown> = {}) => ({
  [`GET ${base}/1/cook`]: preview(1, 'Main'),
  [`GET ${base}/2/cook`]: preview(2, 'Side'),
  [`GET ${base}/3/cook`]: preview(3, 'Dessert'),
  [`POST ${base}/all/cooked`]: allCookedResult(),
  [`POST ${base}/1/reopen`]: { meals: [], stockGone: 0 },
  ...extra,
})
const buttons = (toast: HTMLElement) => [...toast.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi(routes(extra))
  const view = renderHook(() => useAllCookedFlow(), { wrapper: wrapperFor(seededClient()) })
  return { api, ...view }
}

describe.each([
  ['the sheet (confirm)', async (r: ReturnType<typeof setup>['result']) => {
    act(() => r.current.open(slotKey, [1, 2, 3]))
    await waitFor(() => expect(r.current.controller.rows).toHaveLength(3))
    await act(async () => void (await r.current.confirm()))
  }],
  ['the one tap (quickAll)', async (r: ReturnType<typeof setup>['result']) => {
    await act(async () => void (await r.current.quickAll(slotKey, [1, 2, 3])))
  }],
])('Mark all Cooked from %s', (_name, mark) => {
  it('shows the rich toast: the slot as its subline, each Leftover by its Recipe, one Undo for all the Courses', async () => {
    const { result } = setup()
    await mark(result)
    const toast = await findToastWith('Cooked, nice one!')
    expect(toast.querySelector('.toast__subline')).toHaveTextContent('Sat Dinner')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept as a Leftover, good until Fri.')
    expect(toast.querySelector('.toast__title svg')).toBeNull()
    expect(buttons(toast)).toEqual(['Undo Cooked for all 3 Courses', 'Dismiss'])
  })

  it('Undo reopens the action once, says the slot is back in To confirm and takes the Stock shortfall notice away', async () => {
    const { result, api } = setup()
    await mark(result)
    expect(result.current.warnings.map((w) => w.ingredientId)).toEqual([11])
    await pressInToast(await findToastWith('Cooked, nice one!'), 'Undo Cooked for all 3 Courses')
    expect(await findToastWith('Sat Dinner is back in To confirm')).toBeTruthy()
    expect(api.callsTo('POST', `${base}/1/reopen`)).toHaveLength(1)
    expect(api.callsTo('POST', `${base}/all/reopen`)).toHaveLength(0)
    await waitFor(() => expect(result.current.warnings).toEqual([]))
  })

  it('a refused Undo: "Nothing was undone", the Leftover has been used', async () => {
    const { result } = setup({ [`POST ${base}/1/reopen`]: { status: 409, json: { error: { code: 'leftover_used', message: 'used' } } } })
    await mark(result)
    await pressInToast(await findToastWith('Cooked, nice one!'), 'Undo Cooked for all 3 Courses')
    expect(await findToastWith('Nothing was undone')).toHaveTextContent('Some of the Leftover has been used.')
  })
})

describe('Mark all Cooked: other outcomes', () => {
  it('no Leftover: the toast has no body but still the Undo', async () => {
    const { result } = setup({ [`POST ${base}/all/cooked`]: allCookedResult({ leftovers: [], plannedFor: [], warnings: [] }) })
    await act(async () => void (await result.current.quickAll(slotKey, [1, 2, 3])))
    const toast = await findToastWith('Cooked, nice one!')
    expect(toast.querySelector('.toast__body')).toBeNull()
    expect(buttons(toast)).toEqual(['Undo Cooked for all 3 Courses', 'Dismiss'])
  })

  it('one Leftover reads as the single Course does, with no Recipe name in front', async () => {
    const one = allCookedResult()
    const { result } = setup({ [`POST ${base}/all/cooked`]: { ...one, leftovers: [one.leftovers[0]!], warnings: [] } })
    await act(async () => void (await result.current.quickAll(slotKey, [1, 2, 3])))
    expect((await findToastWith('Cooked, nice one!')).querySelector('.toast__body')).toHaveTextContent(/^2 portions planned for Thu Lunch\.$/)
  })

  it('a failed Mark all shows the error toast and no Undo', async () => {
    const { result } = setup({ [`POST ${base}/all/cooked`]: { status: 500, json: { error: { code: 'boom', message: 'x' } } } })
    await act(async () => void (await result.current.quickAll(slotKey, [1, 2, 3])))
    expect(buttons(await findToastWith('That could not be saved. Nothing was changed.')).some((b) => b?.startsWith('Undo'))).toBe(false)
  })
})
