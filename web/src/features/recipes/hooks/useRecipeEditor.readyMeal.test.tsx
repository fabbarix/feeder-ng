import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recipesApi } from '../api'
import { flour, garlic, recipe } from '../fixtures.test-helper'
import type { IngredientRef, Recipe } from '../types'
import { useRecipeEditor } from './useRecipeEditor'

vi.mock('../api', () => ({
  recipesApi: { create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn(), renameIngredient: vi.fn() },
}))
const api = vi.mocked(recipesApi)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

const pack: IngredientRef = { id: 21, name: 'Lasagne pack', baseUnit: 'piece', conversions: [] }
const known = [garlic, flour, pack]

beforeEach(() => vi.resetAllMocks())

const tick = (result: { current: ReturnType<typeof useRecipeEditor> }, name: string) =>
  act(() => result.current.setDraft((d) => ({ ...d, name, yield: '2', readyMeal: true })))

describe('useRecipeEditor: Ready Meal line (R14)', () => {
  it('ticking Ready Meal with a new name makes the pending line', () => {
    const { result } = renderHook(() => useRecipeEditor(undefined, known), { wrapper })
    tick(result, 'Fish pie pack')
    expect(result.current.draft.lines).toHaveLength(1)
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: null, ingredientName: 'Fish pie pack', quantity: '1', unit: 'piece', auto: true })
  })
  it('selects the existing Ingredient when the name matches one, and creates no duplicate', () => {
    const { result } = renderHook(() => useRecipeEditor(undefined, known), { wrapper })
    tick(result, 'lasagne PACK')
    expect(result.current.draft.lines).toHaveLength(1)
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: 21, quantity: '1', unit: 'piece' })
  })
  it('follows the name as it is typed after the box was ticked', () => {
    const { result } = renderHook(() => useRecipeEditor(undefined, known), { wrapper })
    tick(result, 'Lasagne')
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: null, ingredientName: 'Lasagne' })
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Lasagne pack' })))
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: 21 })
    expect(result.current.draft.lines).toHaveLength(1)
  })
  it('picks up Ingredients that load after the box was ticked', () => {
    const { result, rerender } = renderHook(({ list }) => useRecipeEditor(undefined, list), { wrapper, initialProps: { list: [] as IngredientRef[] } })
    tick(result, 'Lasagne pack')
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: null })
    rerender({ list: known })
    act(() => result.current.setDraft((d) => ({ ...d })))
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: 21 })
  })
  it('saves a pending line as a Ready Meal with no lines: the server makes the Ingredient', async () => {
    api.create.mockResolvedValue({ id: 5 } as Recipe)
    const { result } = renderHook(() => useRecipeEditor(undefined, known), { wrapper })
    tick(result, 'Fish pie pack')
    await act(async () => {
      await result.current.save()
    })
    expect(api.create).toHaveBeenCalledOnce()
    expect(api.create.mock.calls[0]![0]).toMatchObject({ name: 'Fish pie pack', readyMeal: true, lines: [] })
  })
  it('unticking drops a pending line but keeps a selected Ingredient as an ordinary line', () => {
    const { result } = renderHook(() => useRecipeEditor(undefined, known), { wrapper })
    tick(result, 'Fish pie pack')
    act(() => result.current.setDraft((d) => ({ ...d, readyMeal: false })))
    expect(result.current.draft.lines).toEqual([])
    tick(result, 'Lasagne pack')
    act(() => result.current.setDraft((d) => ({ ...d, readyMeal: false })))
    expect(result.current.draft.lines).toHaveLength(1)
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: 21 })
    expect(result.current.draft.lines[0]!.auto).toBeFalsy()
  })
  it('a created Ingredient keeps the unit of its line', () => {
    const { result } = renderHook(() => useRecipeEditor(undefined, known), { wrapper })
    act(() => result.current.addLine())
    const key = result.current.draft.lines[0]!.key
    act(() => result.current.updateLine(key, { quantity: '2', unit: 'tbsp' }))
    act(() => result.current.pickCreatedIngredient(key, { id: 99, name: 'Saffron', baseUnit: 'ml', conversions: [] }))
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: 99, quantity: '2', unit: 'tbsp' })
  })
})

describe('useRecipeEditor: rename offer (R14)', () => {
  const stored: Recipe = recipe({
    id: 3, name: 'Lasagne pack', readyMeal: true, yield: 2,
    lines: [{ ingredientId: 21, ingredient: 'Lasagne pack', quantity: 1, unit: 'piece', optional: false, note: '' }],
    steps: [],
  })

  async function loaded() {
    api.get.mockResolvedValue(stored)
    const hook = renderHook(() => useRecipeEditor(3, known), { wrapper })
    await waitFor(() => expect(hook.result.current.draft.name).toBe('Lasagne pack'))
    return hook
  }

  it('has no offer until the name changes', async () => {
    const { result } = await loaded()
    expect(result.current.renameOffer).toBeNull()
  })
  it('does not turn the stored line into an automatic one when the name changes', async () => {
    const { result } = await loaded()
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Big lasagne pack' })))
    expect(result.current.draft.lines).toHaveLength(1)
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: 21, ingredientName: 'Lasagne pack' })
  })
  it('offers to rename the linked Ingredient once the Recipe is renamed', async () => {
    const { result } = await loaded()
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Big lasagne pack' })))
    expect(result.current.renameOffer).toEqual({ ingredientId: 21, from: 'Lasagne pack', to: 'Big lasagne pack' })
  })
  it('keeps the offer after the save so the screen can ask', async () => {
    api.replace.mockResolvedValue({ ...stored, name: 'Big lasagne pack' })
    const { result } = await loaded()
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Big lasagne pack' })))
    await act(async () => {
      await result.current.save()
    })
    expect(result.current.renameOffer).not.toBeNull()
  })
  it('renames the Ingredient through the API on request', async () => {
    api.renameIngredient.mockResolvedValue({ ...pack, name: 'Big lasagne pack' })
    const { result } = await loaded()
    act(() => result.current.setDraft((d) => ({ ...d, name: 'Big lasagne pack' })))
    await act(async () => {
      await result.current.renameLinkedIngredient()
    })
    expect(api.renameIngredient).toHaveBeenCalledWith(21, 'Big lasagne pack')
  })
  it('does nothing without an offer', async () => {
    const { result } = await loaded()
    await act(async () => {
      await result.current.renameLinkedIngredient()
    })
    expect(api.renameIngredient).not.toHaveBeenCalled()
  })
})
