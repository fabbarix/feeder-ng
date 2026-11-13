// DS-SHOP: the screen wires the row, the sheet and the page structure. A single dense list; whole row = tap target; Scan the only primary.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList, makePast } from '../testData'
import type { ShoppingList } from '../types'

const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(), notNeeded: vi.fn(), neededAfterAll: vi.fn() }))
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const choice = vi.hoisted(() => ({ useShopChoice: vi.fn(), setShopId: vi.fn() }))
vi.mock('../hooks/useShopChoice', () => ({ useShopChoice: choice.useShopChoice }))
const here = vi.hoisted(() => ({ useShopHere: vi.fn() }))
vi.mock('../hooks/useShopHere', () => here)
vi.mock('../../shops/components/AddShopSheet', () => ({ AddShopSheet: () => null }))
vi.mock('../../../ui/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

import { ShoppingScreen } from './ShoppingScreen'

function show(list: ShoppingList) {
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: false, error: null, stale: false, status: 'ready', retry: vi.fn() })
  return render(
    <MemoryRouter initialEntries={['/shop']}>
      <Routes>
        <Route path="/shop" element={<ShoppingScreen />} />
        <Route path="/scan" element={<p>Scan screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listHook.useShoppingList.mockReset()
  here.useShopHere.mockReset().mockReturnValue({ status: 'idle', anyLocated: false, find: vi.fn() })
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: 1, setShopId: choice.setShopId, isLoading: false })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue(undefined)
})

describe('ShoppingScreen: rows', () => {
  it('tapping the whole row opens that Line\'s sheet (quantity, pack, cost); Close dismisses it', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
    const sheet = screen.getByRole('dialog', { name: 'Passata' })
    expect(within(sheet).getByText('2 × Mutti 700 g')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the tick control still asks "How much?" and does not open the Line sheet', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Tick Passata' }))
    expect(screen.getByRole('dialog', { name: 'Tick Passata' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Passata' })).toBeNull()
  })

  it('there is no ⋮ column: no "Actions for ..." button and no Delete button on any row', () => {
    show(makeList({ lines: [makeLine()], extras: [makeExtra()], progress: { ticked: 0, total: 2 } }))
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
  })

  it('shows the dense list: one "To get" list holding Lines and extras, and the metric strip above it', () => {
    show(makeList({ lines: [makeLine()], extras: [makeExtra()], progress: { ticked: 0, total: 2 } }))
    const strip = screen.getByRole('group', { name: 'Summary' })
    const list = screen.getByRole('list', { name: 'To get' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(strip.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the screen has exactly one primary action, Scan, even with a notice and an open sheet', async () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] }))
    await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
    const primaries = document.querySelectorAll('button[data-variant="primary"]')
    expect(primaries).toHaveLength(1)
    expect(primaries[0]).toHaveTextContent('Scan')
  })

  it('the page sections are spaced by the section gap token (the root has the shop-screen class; shop.css pins the token)', () => {
    const { container } = show(makeList())
    expect(container.querySelector('section.shop-screen')).toBeInTheDocument()
  })
})
