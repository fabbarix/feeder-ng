// B9-45 (PC-02): the state of the one Correct Stock sheet. Save writes one Stock-take per changed row (a total, PUT .../total), says so in a
// toast, and tells the screen every row of the sheet is settled so the notice goes.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../../plan/test-utils'
import { findToast } from '../../../test/notices'
import type { ShortfallGroup } from '../lib/shortfall'
import type { StockWarning } from '../types'
import { useStockCorrection } from './useStockCorrection'

afterEach(() => vi.unstubAllGlobals())

const w = (ingredientId: number, name: string, have: number, need: number): StockWarning => ({
  ingredientId, name, baseUnit: 'g', have, need, shortfall: need - have, message: '',
})
const groups: ShortfallGroup[] = [
  { id: '2026-11-14/3/1', mealLabel: 'Sat Dinner', recipeName: 'Cauliflower al gorgonzola', warnings: [w(1, 'Cauliflower', 0, 800), w(2, 'Gorgonzola', 0, 250), w(3, 'Mushrooms', 100, 300)] },
]
const put = (id: number) => `PUT /api/stock/ingredients/${id}/total`
const ok = { ingredient: {}, lots: [] }

describe('useStockCorrection', () => {
  it('holds the sheet\'s rows (one per Ingredient) and opens and closes it', () => {
    mockApi({})
    const { result } = renderHook(() => useStockCorrection(groups, () => {}), { wrapper })
    expect(result.current.rows.map((r) => r.name)).toEqual(['Cauliflower', 'Gorgonzola', 'Mushrooms'])
    expect(result.current.open).toBe(false)
    act(() => result.current.show())
    expect(result.current.open).toBe(true)
    act(() => result.current.close())
    expect(result.current.open).toBe(false)
  })

  it('Save writes ONE total per row raised above 0, says "Stock corrected for 2 Ingredients" and settles every row of the sheet', async () => {
    const api = mockApi({ [put(2)]: ok, [put(3)]: ok })
    const onSaved = vi.fn()
    const { result } = renderHook(() => useStockCorrection(groups, onSaved), { wrapper })
    act(() => result.current.show())
    let saved = false
    await act(async () => {
      saved = await result.current.save({ 1: 0, 2: 100, 3: 40 })
    })
    expect(saved).toBe(true)
    expect(api.calls.filter((c) => c.method === 'PUT').map((c) => [c.path, c.body])).toEqual([
      ['/api/stock/ingredients/2/total', { total: 100 }],
      ['/api/stock/ingredients/3/total', { total: 40 }],
    ])
    expect(await findToast('Stock corrected for 2 Ingredients')).toBeTruthy()
    expect(onSaved).toHaveBeenCalledWith([1, 2, 3])
    expect(result.current.open).toBe(false)
  })

  it('a plain success toast, with no icon', async () => {
    mockApi({ [put(2)]: ok })
    const { result } = renderHook(() => useStockCorrection(groups, () => {}), { wrapper })
    await act(async () => void (await result.current.save({ 2: 10 })))
    const toast = await findToast('Stock corrected for 1 Ingredient')
    // every toast has its round Dismiss (an svg); the toast itself carries no status icon (as StockScreen.b9-29.test checks)
    expect(toast.querySelector('.toast__title svg, .toast__icon')).toBeNull()
  })

  it('Save with every row left at 0 writes nothing, says nothing and only closes (Stock stays where it is)', async () => {
    const api = mockApi({})
    const onSaved = vi.fn()
    const { result } = renderHook(() => useStockCorrection(groups, onSaved), { wrapper })
    act(() => result.current.show())
    await act(async () => void (await result.current.save({ 1: 0, 2: 0, 3: 0 })))
    expect(api.calls).toHaveLength(0)
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.open).toBe(false)
  })

  it('a failed write keeps the sheet open with the error, and tells the screen nothing', async () => {
    mockApi({ [put(2)]: ok, [put(3)]: { status: 500, json: { error: { code: 'x', message: 'Could not save' } } } })
    const onSaved = vi.fn()
    const { result } = renderHook(() => useStockCorrection(groups, onSaved), { wrapper })
    act(() => result.current.show())
    let saved = true
    await act(async () => {
      saved = await result.current.save({ 2: 100, 3: 40 })
    })
    expect(saved).toBe(false)
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.open).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })
})
