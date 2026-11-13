// Supplies in the Pantry (household-items.md 4.1, 6; H6): the choices of Add to Stock hold both kinds, under the subheaders
// "Ingredients" and "Supplies", and carry the kind and the Restock level the Pantry rows need.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeIngredientJson, makeSupplyJson } from '../testData'

const list = vi.hoisted(() => vi.fn())
vi.mock('../../ingredients/api', () => ({ ingredientsApi: { list } }))
import { useIngredientChoices } from './useIngredientChoices'

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>

beforeEach(() => list.mockReset())

describe('useIngredientChoices: Supplies', () => {
  it('asks for both kinds (no ?kind=) and passes kind and restockLevel through', async () => {
    list.mockResolvedValue([makeSupplyJson(), makeIngredientJson({ id: 8, name: 'rice' })])
    const { result } = renderHook(() => useIngredientChoices(), { wrapper })
    await waitFor(() => expect(result.current.choices).toHaveLength(2))
    expect(list).toHaveBeenCalledWith()
    const byName = Object.fromEntries(result.current.choices.map((c) => [c.name, c]))
    expect(byName['toilet paper']).toMatchObject({ id: 40, baseUnit: 'piece', kind: 'supply', restockLevel: 6 })
    expect(byName['rice']).toMatchObject({ id: 8, baseUnit: 'g', kind: 'food', restockLevel: null })
  })
  it('lists the food first and the Supplies after it, each by name, under "Ingredients" and "Supplies"', async () => {
    list.mockResolvedValue([
      makeSupplyJson({ id: 41, name: 'batteries' }),
      makeIngredientJson({ id: 9, name: 'rice' }),
      makeSupplyJson({ id: 40, name: 'toilet paper' }),
      makeIngredientJson({ id: 8, name: 'flour' }),
    ])
    const { result } = renderHook(() => useIngredientChoices(), { wrapper })
    await waitFor(() => expect(result.current.choices).toHaveLength(4))
    expect(result.current.choices.map((c) => [c.name, c.group])).toEqual([
      ['flour', 'Ingredients'],
      ['rice', 'Ingredients'],
      ['batteries', 'Supplies'],
      ['toilet paper', 'Supplies'],
    ])
  })
  it('a Household with no Supply gets no subheaders: the list looks as it always did', async () => {
    list.mockResolvedValue([makeIngredientJson({ id: 9, name: 'rice' }), makeIngredientJson({ id: 8, name: 'flour' })])
    const { result } = renderHook(() => useIngredientChoices(), { wrapper })
    await waitFor(() => expect(result.current.choices).toHaveLength(2))
    expect(result.current.choices.map((c) => c.group)).toEqual([undefined, undefined])
  })
  it('an older answer with no kind is food', async () => {
    list.mockResolvedValue([{ id: 2, name: 'salt', baseUnit: 'g', shelfLifeDays: null, conversions: [], image: '', imageUrl: '' }, makeSupplyJson()])
    const { result } = renderHook(() => useIngredientChoices(), { wrapper })
    await waitFor(() => expect(result.current.choices).toHaveLength(2))
    expect(result.current.choices.map((c) => [c.name, c.kind, c.group])).toEqual([
      ['salt', 'food', 'Ingredients'],
      ['toilet paper', 'supply', 'Supplies'],
    ])
  })
})
