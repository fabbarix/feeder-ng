// PE: the Ingredient choices (Add a Stock Lot, Shopping List extras) carry each Ingredient's Picture address.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const list = vi.hoisted(() => vi.fn())
vi.mock('../../ingredients/api', () => ({ ingredientsApi: { list } }))
import { useIngredientChoices } from './useIngredientChoices'

const url = `/api/images/${'a'.repeat(32)}`

describe('useIngredientChoices: pictures', () => {
  it('passes imageUrl through, sorted by name', async () => {
    list.mockResolvedValue([
      { id: 2, name: 'salt', baseUnit: 'g', shelfLifeDays: null, conversions: [], image: '', imageUrl: '' },
      { id: 1, name: 'flour', baseUnit: 'g', shelfLifeDays: null, conversions: [], image: 'a'.repeat(32), imageUrl: url },
    ])
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useIngredientChoices(), { wrapper })
    await waitFor(() => expect(result.current.choices).toHaveLength(2))
    expect(result.current.choices.map((c) => [c.name, c.imageUrl])).toEqual([['flour', url], ['salt', '']])
  })
})
