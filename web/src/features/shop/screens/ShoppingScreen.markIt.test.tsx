import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui/Toast'
import { makeLine, makeList, makePast } from '../testData'
import type { ShoppingList } from '../types'

// B5-F1 (DS-SHOP): the Shopping List "Mark it" opens the Plan on the oldest unconfirmed slot (/plan?mark=<date>:<slot>).

const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({
  tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn(),
  notNeeded: vi.fn(), neededAfterAll: vi.fn(),
}))
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const choice = vi.hoisted(() => ({ useShopChoice: vi.fn(), setShopId: vi.fn() }))
vi.mock('../hooks/useShopChoice', () => ({ useShopChoice: choice.useShopChoice }))
const here = vi.hoisted(() => ({ useShopHere: vi.fn() }))
vi.mock('../hooks/useShopHere', () => here)
vi.mock('../../shops/components/AddShopSheet', () => ({ AddShopSheet: () => null }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

import { ShoppingScreen } from './ShoppingScreen'

function PlanPage() {
  return <p>{`Plan page ${useLocation().search}`}</p>
}

function show(list: ShoppingList) {
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: false, error: null, stale: false, status: 'ready', retry: vi.fn() })
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/shop']}>
        <Routes>
          <Route path="/shop" element={<ShoppingScreen />} />
          <Route path="/plan" element={<PlanPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  listHook.useShoppingList.mockReset()
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }], shopId: 1, setShopId: choice.setShopId, isLoading: false })
  here.useShopHere.mockReset().mockReturnValue({ status: 'idle', anyLocated: false, find: vi.fn() })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue(undefined)
})

describe('ShoppingScreen: Mark it (DS-SHOP: said once in the notice; the row sheet has it too)', () => {
  it('the notice above the list says the sentence once and has one Mark it button; the Line row has none', () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] }), makeLine({ ingredientId: 3, name: 'Rice', pastPlannedMeals: [makePast()] })], progress: { ticked: 0, total: 2 } }))
    expect(screen.getAllByText('Includes Tue Dinner, not marked Cooked yet')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Mark it' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Mark it: Passata' })).toBeNull()
  })

  it('the notice opens the oldest unconfirmed slot on the Plan with ?mark=<date>:<slot>', async () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast({ date: '2026-11-04', mealSlotId: 7 }), makePast({ date: '2026-11-03', mealSlotId: 3 })] })] }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark it' }))
    expect(await screen.findByText('Plan page ?mark=2026-11-03:3')).toBeInTheDocument()
  })

  it('the Line sheet has Mark it too, for that Line\'s oldest slot', async () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast({ date: '2026-11-04', mealSlotId: 7 }), makePast({ date: '2026-11-03', mealSlotId: 3 })] })] }))
    await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Passata' })).getByRole('button', { name: 'Mark it' }))
    expect(await screen.findByText('Plan page ?mark=2026-11-03:3')).toBeInTheDocument()
  })

  it('a list without unconfirmed past meals has no notice and no Mark it', async () => {
    show(makeList())
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Passata' }))
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Mark it/ })).toBeNull()
  })
})
