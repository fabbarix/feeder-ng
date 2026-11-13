import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui/Toast'
import { makeLine, makeList, makePast } from '../testData'
import type { ShoppingList } from '../types'

// B5-F1: the Shopping List hint's "Mark it" opens the Plan on the oldest unconfirmed slot (/plan?mark=<date>:<slot>).

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

describe('ShoppingScreen: Mark it', () => {
  it('a Line with unconfirmed past meals has a Mark it button beside its hint', () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] }))
    expect(screen.getByText('Includes Tue Dinner, not marked Cooked yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark it: Passata' })).toBeInTheDocument()
  })

  it('opens the oldest unconfirmed slot on the Plan with ?mark=<date>:<slot>', async () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast({ date: '2026-11-04', mealSlotId: 7 }), makePast({ date: '2026-11-03', mealSlotId: 3 })] })] }))
    await userEvent.click(screen.getByRole('button', { name: 'Mark it: Passata' }))
    expect(await screen.findByText('Plan page ?mark=2026-11-03:3')).toBeInTheDocument()
  })

  it('a Line without unconfirmed past meals has none', () => {
    show(makeList())
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
  })
})
