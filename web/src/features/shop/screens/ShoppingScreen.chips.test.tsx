import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeList } from '../testData'

// b8-shop (user decision): the header chips keep their icons at every width; the labels get shorter when they do not fit.
// B9-15: a chip shortens by its own row's room (the chip Select's shortLabel), never by a window query; the room is stood in for here.
const room: { fit: { natural: number; room: number } | null } = { fit: null }
vi.mock('../../../ui/Select/chipFit', async (orig) => ({ ...(await orig<typeof import('../../../ui/Select/chipFit')>()), measureChipFit: () => room.fit }))
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

function show(shopId: number | null, wide: boolean) {
  room.fit = wide ? { natural: 150, room: 300 } : { natural: 150, room: 120 }
  listHook.useShoppingList.mockReturnValue({ data: makeList(), isLoading: false, error: null, stale: false, status: 'ready', retry: vi.fn() })
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId, setShopId: vi.fn(), isLoading: false })
  render(
    <MemoryRouter initialEntries={['/shop']}>
      <Routes>
        <Route path="/shop" element={<ShoppingScreen />} />
      </Routes>
    </MemoryRouter>,
  )
  return {
    range: screen.getByRole('combobox', { name: /Shop for/ }),
    shop: screen.getByRole('combobox', { name: /^Shop\b(?! for)/ }),
  }
}
beforeEach(() => listHook.useShoppingList.mockReset())
afterEach(() => {
  room.fit = null
})

describe('Shop header chips whose row has no room for their full values', () => {
  it('both chips keep their icon and the row still holds both pickers and the locate button', () => {
    const { range, shop } = show(null, false)
    expect(range.querySelector('.select__leading svg')).not.toBeNull()
    expect(shop.querySelector('.select__leading svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Find the Shop I am in/i })).toBeInTheDocument()
  })

  it('"Any Shop" shows as "Any"; the full wording stays the title and the name stays "Shop"', () => {
    const { shop } = show(null, false)
    expect(shop).toHaveTextContent(/^Any$/)
    expect(shop).toHaveAttribute('title', 'Any Shop')
  })

  it('"Until Sun 15" shows as "Sun 15"', () => {
    const { range } = show(null, false)
    expect(range).toHaveTextContent(/^Sun 15$/)
  })

  it('a chosen Shop shows under its own name (a Shop name is not shortened)', () => {
    const { shop } = show(1, false)
    expect(shop).toHaveTextContent('Coop')
    expect(shop).not.toHaveAttribute('title')
  })
})

describe('Shop header chips with room for their full values', () => {
  it('show the full values with their icons', () => {
    const { range, shop } = show(null, true)
    expect(range).toHaveTextContent('Until Sun 15')
    expect(shop).toHaveTextContent('Any Shop')
    expect(range.querySelector('.select__leading svg')).not.toBeNull()
    expect(shop.querySelector('.select__leading svg')).not.toBeNull()
  })
})
