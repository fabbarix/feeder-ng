// B9-45 (PC-02): the Cook flows hand ONE shortfall notice's data to their screen (groups per Cooked meal, merged), one Correct Stock sheet,
// and Cook Mode's quiet mode: no toast (the confirmation page has its own Undo). 2026-11-14 is a Saturday.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allCookedResult, courseMeal, mockApi } from '../test-utils'
import { findToastWith, pressInToast, seededClient, toastWith, wrapperFor } from '../test-utils.undo'
import type { CookedResult, CookPreview, StockWarning } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'
import { useCookFlow } from './useCookFlow'

afterEach(() => vi.unstubAllGlobals())

const barley: StockWarning = { ingredientId: 11, name: 'barley', baseUnit: 'g', have: 0, need: 250, shortfall: 250, message: 'Stock shows no barley, the recipe uses 250 g' }
const stew = 'Slow cooker beef and barley stew'
const preview = (courseId: number): CookPreview => ({
  meal: courseMeal(courseId, 'Main', { date: '2026-11-14', mealSlotId: 1, recipeName: stew }), fresh: true, batches: 1, yield: 6, portionsNeeded: 4.75, proposedLeftover: 1.25,
  maxLeftover: 6, leftoverUseBy: '2026-11-17', needs: [],
})
const cooked = (warnings: StockWarning[]): CookedResult => ({
  meal: courseMeal(1, 'Main', { state: 'cooked', recipeName: stew }), leftover: null, warnings, plannedFor: [],
})
const keyA = { date: '2026-11-14', mealSlotId: 1, courseId: 1 }
const keyB = { date: '2026-11-17', mealSlotId: 1, courseId: 1 }

function setupCookFlow(options?: { toast?: boolean }, warnings = [barley]) {
  const api = mockApi({
    'GET /api/plan/2026-11-14/1/1/cook': preview(1),
    'POST /api/plan/2026-11-14/1/1/cooked': cooked(warnings),
    'POST /api/plan/2026-11-14/1/1/reopen': { meals: [], stockGone: 0 },
    'GET /api/plan/2026-11-17/1/1/cook': { ...preview(1), meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Pancakes' }) },
    'POST /api/plan/2026-11-17/1/1/cooked': { ...cooked([{ ...barley, ingredientId: 12, name: 'flour' }]), meal: courseMeal(1, 'Main', { state: 'cooked', recipeName: 'Pancakes' }) },
    'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
    'PUT /api/stock/ingredients/12/total': { ingredient: {}, lots: [] },
  })
  const view = renderHook(() => useCookFlow(options), { wrapper: wrapperFor(seededClient()) })
  return { api, ...view }
}

describe('useCookFlow: the shortfall groups', () => {
  it('quickCook hands over one group for the meal: its label, its Recipe, its warnings', async () => {
    const { result } = setupCookFlow()
    await act(async () => void (await result.current.quickCook(keyA)))
    expect(result.current.shortfalls).toEqual([{ id: '2026-11-14/1/1', mealLabel: 'Sat Breakfast', recipeName: stew, warnings: [barley] }])
  })

  it('several Cooked meals are several groups of the ONE notice, newest last, never summed', async () => {
    const { result } = setupCookFlow()
    await act(async () => void (await result.current.quickCook(keyA)))
    await act(async () => void (await result.current.quickCook(keyB)))
    expect(result.current.shortfalls.map((g) => [g.id, g.mealLabel, g.recipeName])).toEqual([
      ['2026-11-14/1/1', 'Sat Breakfast', stew],
      ['2026-11-17/1/1', 'Tue Breakfast', 'Pancakes'],
    ])
  })

  it('a meal with no shortfall adds no group', async () => {
    const { result } = setupCookFlow(undefined, [])
    await act(async () => void (await result.current.quickCook(keyA)))
    expect(result.current.shortfalls).toEqual([])
  })

  it('Dismiss clears the whole notice at once', async () => {
    const { result } = setupCookFlow()
    await act(async () => void (await result.current.quickCook(keyA)))
    act(() => result.current.dismissShortfalls())
    expect(result.current.shortfalls).toEqual([])
    expect(result.current.warnings).toEqual([])
  })

  it('Undo from the Cooked toast takes that meal\'s group away with its notice', async () => {
    const { result } = setupCookFlow()
    await act(async () => void (await result.current.quickCook(keyA)))
    await pressInToast(await findToastWith('Cooked, nice one!'), 'Undo Cooked for Sat Breakfast')
    await waitFor(() => expect(result.current.shortfalls).toEqual([]))
  })
})

describe('useCookFlow: the one Correct Stock sheet', () => {
  it('lists every short Ingredient of the groups; Save writes the raised ones and the whole notice goes', async () => {
    const { result, api } = setupCookFlow()
    await act(async () => void (await result.current.quickCook(keyA)))
    await act(async () => void (await result.current.quickCook(keyB)))
    expect(result.current.stock.rows.map((r) => r.name)).toEqual(['barley', 'flour'])
    act(() => result.current.stock.show())
    await act(async () => void (await result.current.stock.save({ 11: 0, 12: 50 })))
    expect(api.calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual(['/api/stock/ingredients/12/total'])
    expect(await findToastWith('Stock corrected for 1 Ingredient')).toBeTruthy()
    expect(result.current.shortfalls).toEqual([])
  })
})

describe('useCookFlow({ toast: false }): Cook Mode shows no toast', () => {
  it('quickCook marks the meal and keeps the shortfalls, but shows no Cooked toast', async () => {
    const { result } = setupCookFlow({ toast: false })
    await act(async () => void (await result.current.quickCook(keyA)))
    expect(result.current.shortfalls).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 50))
    expect(toastWith('Cooked, nice one!')).toBeUndefined()
  })

  it('by default the Cooked toast is shown (the Plan and Today)', async () => {
    const { result } = setupCookFlow()
    await act(async () => void (await result.current.quickCook(keyA)))
    expect(await findToastWith('Cooked, nice one!')).toBeTruthy()
  })
})

describe('useAllCookedFlow: Mark all Cooked', () => {
  const slotKey = { date: '2026-11-14', mealSlotId: 3 }
  const base = '/api/plan/2026-11-14/3'
  const prev = (courseId: number, courseName: string): CookPreview => ({
    meal: courseMeal(courseId, courseName, { recipeName: 'R', mealSlotId: 3, date: '2026-11-14' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
    proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-17', needs: [],
  })
  const routes = (result = allCookedResult()) => ({
    [`GET ${base}/1/cook`]: prev(1, 'Main'),
    [`GET ${base}/2/cook`]: prev(2, 'Side'),
    [`POST ${base}/all/cooked`]: result,
    [`POST ${base}/1/reopen`]: { meals: [], stockGone: 0 },
  })

  it('hands over one group for the slot; the Recipe is unknown when several Courses were cooked', async () => {
    mockApi(routes())
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper: wrapperFor(seededClient()) })
    await act(async () => void (await result.current.quickAll(slotKey, [1, 2])))
    expect(result.current.shortfalls).toEqual([
      { id: '2026-11-14/3', mealLabel: 'Sat Dinner', recipeName: null, warnings: allCookedResult().warnings },
    ])
  })

  it('names the Recipe when one Course was cooked', async () => {
    mockApi(routes(allCookedResult({ meals: [courseMeal(1, 'Main', { recipeName: 'Roast chicken', state: 'cooked' })] })))
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper: wrapperFor(seededClient()) })
    await act(async () => void (await result.current.quickAll(slotKey, [1])))
    expect(result.current.shortfalls[0]?.recipeName).toBe('Roast chicken')
  })

  it('has a Correct Stock controller and Dismiss for the notice', async () => {
    mockApi(routes())
    const { result } = renderHook(() => useAllCookedFlow(), { wrapper: wrapperFor(seededClient()) })
    await act(async () => void (await result.current.quickAll(slotKey, [1, 2])))
    expect(result.current.stock.rows.map((r) => r.name)).toEqual(['chicken thighs'])
    act(() => result.current.dismissShortfalls())
    expect(result.current.shortfalls).toEqual([])
  })

  it('{ toast: false } marks all and shows no toast (Cook Mode)', async () => {
    mockApi(routes())
    const { result } = renderHook(() => useAllCookedFlow({ toast: false }), { wrapper: wrapperFor(seededClient()) })
    await act(async () => void (await result.current.quickAll(slotKey, [1, 2])))
    await new Promise((r) => setTimeout(r, 50))
    expect(toastWith('Cooked, nice one!')).toBeUndefined()
    expect(result.current.shortfalls).toHaveLength(1)
  })
})
