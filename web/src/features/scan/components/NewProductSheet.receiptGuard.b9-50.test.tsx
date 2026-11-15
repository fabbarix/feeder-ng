// B9-50 (SSP-08): on a receipt line's Something else, a new name that is a Product shows one guard: "<Product> is already a Product. Use it?".
// The Ingredient near-duplicate guard ("Did you mean …?") that the same name raises is dropped, so the two never stack.
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../../ingredients/types'
import type { OfflineProduct } from '../types'
import { choose, dialog, lines, openSomethingElse, setup } from './newProduct.test-helper'

const knownProducts: OfflineProduct[] = [
  { id: 50, name: 'Kitchen roll 4 pack', ingredientId: 7, ingredientName: 'Kitchen roll', baseUnit: 'piece', packSize: 4, lastPriceCents: null },
]
const roll = { id: 7, name: 'Kitchen roll', baseUnit: 'piece' as const, kind: 'supply' as const }
const similar = (): Promise<SearchResult> => Promise.resolve({ exact: null, suggestions: [{ ingredient: roll, score: 0.8 }] } as unknown as SearchResult)

describe('Something else with a name that is a Product', () => {
  it('shows the Product guard alone, not the Ingredient one as well', async () => {
    const findSimilar = vi.fn(similar)
    setup({ noBarcode: true, barcode: undefined, lines, matches: [], products: knownProducts, onUseProduct: vi.fn(), findSimilar, receiptLine: { text: 'KITCHEN ROLL 4 PACK', detail: '×1', scans: 1 } })
    await openSomethingElse()
    await choose(/Ingredient/, /New Ingredient/, 'Kitchen roll 4 pack')
    await waitFor(() => expect(findSimilar).toHaveBeenCalled())
    const guard = await screen.findByRole('status')
    expect(guard).toHaveTextContent('Kitchen roll 4 pack is already a Product. Use it?')
    await waitFor(() => expect(within(dialog()).queryByText(/Did you mean/)).toBeNull())
    expect(within(dialog()).getAllByRole('status')).toHaveLength(1)
  })
})
