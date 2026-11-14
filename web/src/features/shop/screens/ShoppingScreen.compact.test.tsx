import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLine, makeList } from '../testData'

// b8-polish (docs/dev/design/b8-polish.md 2): below 420 px (the same query as the header chips, useNarrowChips) the screen passes
// compact to ShoppingBody, so the Supplies group reads "400/1000 ml" at 360 and 390 px, and "400 of 1000 ml" from 420 px up.
const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => ({ tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn() }) }))
const choice = vi.hoisted(() => ({ useShopChoice: vi.fn() }))
vi.mock('../hooks/useShopChoice', () => choice)
vi.mock('../hooks/useShopHere', () => ({ useShopHere: () => ({ status: 'idle', anyLocated: true, find: vi.fn() }) }))
vi.mock('../../shops/components/AddShopSheet', () => ({ AddShopSheet: () => null }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

import { ShoppingScreen } from './ShoppingScreen'

function show(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: /min-width:\s*420px/.test(query) ? wide : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
  const data = makeList({
    lines: [makeLine({ ingredientId: 20, name: 'Washing-up liquid', baseUnit: 'ml', kind: 'supply', restock: { level: 1000, stock: 400 }, need: 1000, available: 400, quantity: 600, pack: null, estimatedCostCents: null })],
    progress: { ticked: 0, total: 1 },
  })
  listHook.useShoppingList.mockReturnValue({ data, isLoading: false, error: null, stale: false, status: 'ready', retry: vi.fn() })
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: 1, setShopId: vi.fn(), isLoading: false })
  render(
    <MemoryRouter initialEntries={['/shop']}>
      <Routes>
        <Route path="/shop" element={<ShoppingScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}
beforeEach(() => listHook.useShoppingList.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe('Shop screen: the Restock reason by width', () => {
  it('below 420 px it is compact, with the full text for assistive technology', () => {
    show(false)
    expect(screen.getByText('400/1000 ml')).toBeInTheDocument()
    expect(screen.getByLabelText('400 of 1000 ml')).toBeInTheDocument()
  })
  it('from 420 px it is the full text', () => {
    show(true)
    expect(screen.getByText('400 of 1000 ml')).toBeInTheDocument()
    expect(screen.queryByText('400/1000 ml')).toBeNull()
  })
})
