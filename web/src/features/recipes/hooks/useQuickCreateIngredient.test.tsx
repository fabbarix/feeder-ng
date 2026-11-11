import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ingredientsApi } from '../../ingredients/api'
import type { Ingredient } from '../../ingredients/types'
import { recipeStrings } from '../strings'
import { useQuickCreateIngredient } from './useQuickCreateIngredient'

vi.mock('../../ingredients/api', () => ({ ingredientsApi: { create: vi.fn(), search: vi.fn() } }))
const api = vi.mocked(ingredientsApi)

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

const saffron: Ingredient = { id: 99, name: 'Saffron', baseUnit: 'g', shelfLifeDays: null, conversions: [] }
const setOnline = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)

beforeEach(() => {
  vi.resetAllMocks()
  setOnline(true)
})
afterEach(() => vi.restoreAllMocks())

function setup() {
  const pick = vi.fn()
  const hook = renderHook(() => useQuickCreateIngredient({ pick }), { wrapper })
  return { ...hook, pick }
}

describe('useQuickCreateIngredient', () => {
  it('opens for a line with the typed name and the line unit, and closes again', () => {
    const { result } = setup()
    expect(result.current.request).toBeNull()
    act(() => result.current.open({ lineKey: 'l1', query: 'saffron', unit: 'g' }))
    expect(result.current.request).toEqual({ lineKey: 'l1', query: 'saffron', unit: 'g' })
    act(() => result.current.close())
    expect(result.current.request).toBeNull()
  })
  it('closing never picks anything for the line', () => {
    const { result, pick } = setup()
    act(() => result.current.open({ lineKey: 'l1', query: 'saffron', unit: '' }))
    act(() => result.current.close())
    expect(pick).not.toHaveBeenCalled()
    expect(result.current.focusLineKey).toBeNull()
  })
  it('creates through the Ingredients API and refreshes the Ingredient list', async () => {
    api.create.mockResolvedValue(saffron)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = setup()
    let made: Ingredient | undefined
    await act(async () => {
      made = await result.current.create({ name: 'Saffron', baseUnit: 'g' })
    })
    expect(api.create).toHaveBeenCalledWith({ name: 'Saffron', baseUnit: 'g' })
    expect(made).toBe(saffron)
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['ingredients'] }))
  })
  it('lets a failed create reach the sheet', async () => {
    api.create.mockRejectedValue(new Error('name_taken'))
    const { result } = setup()
    await expect(act(async () => result.current.create({ name: 'Saffron', baseUnit: 'g' }))).rejects.toThrow('name_taken')
  })
  it('select picks the Ingredient on the line, closes the sheet and asks for focus on the amount', () => {
    const { result, pick } = setup()
    act(() => result.current.open({ lineKey: 'l1', query: 'saffron', unit: 'g' }))
    act(() => result.current.select(saffron))
    expect(pick).toHaveBeenCalledWith('l1', { id: 99, name: 'Saffron', baseUnit: 'g', conversions: [] })
    expect(result.current.request).toBeNull()
    expect(result.current.focusLineKey).toBe('l1')
    act(() => result.current.amountFocused())
    expect(result.current.focusLineKey).toBeNull()
  })
  it('select also serves "Use Garlic" for a near duplicate', () => {
    const garlic: Ingredient = { id: 7, name: 'Garlic', baseUnit: 'g', shelfLifeDays: null, conversions: [{ unit: 'clove', toBase: 5 }] }
    const { result, pick } = setup()
    act(() => result.current.open({ lineKey: 'l2', query: 'garlik', unit: 'clove' }))
    act(() => result.current.select(garlic))
    expect(pick).toHaveBeenCalledWith('l2', { id: 7, name: 'Garlic', baseUnit: 'g', conversions: [{ unit: 'clove', toBase: 5 }] })
  })
  it('has no disabled reason online', () => {
    expect(setup().result.current.disabledReason).toBeUndefined()
  })
  it('gives the offline reason while the phone is offline', () => {
    setOnline(false)
    expect(setup().result.current.disabledReason).toBe(recipeStrings.quickCreate.offlineReason)
  })
})
