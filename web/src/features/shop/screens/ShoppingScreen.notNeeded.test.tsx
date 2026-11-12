import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { ToastProvider } from '../../../ui/Toast'
import { makeLine, makeList, makePast } from '../testData'
import type { ShoppingList } from '../types'

// B5-SH: Not needed from the line Menu with an Undo toast, "Needed after all" from the group, and the hint without "Mark it".

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

const rice = makeLine({ ingredientId: 5, name: 'Rice', quantity: 600, pack: null, estimatedCostCents: null })

function show(list: ShoppingList) {
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: false, error: null, stale: false, status: 'ready', retry: vi.fn() })
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/shop']}>
        <Routes>
          <Route path="/shop" element={<ShoppingScreen />} />
          <Route path="/plan" element={<p>Plan screen</p>} />
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

describe('ShoppingScreen Not needed', () => {
  it('"Not needed" in the line Menu marks the Line for the list range and the picked Shop, then offers Undo', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Passata' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not needed' }))
    expect(actions.notNeeded).toHaveBeenCalledWith({ ingredientId: 2, to: '2026-11-15', shopId: 1 })
    expect(await screen.findByText('Passata is not needed on this list')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(actions.neededAfterAll).toHaveBeenCalledWith(2, '2026-11-15', 1)
  })

  it('shows no toast when the call fails, and says why', async () => {
    actions.notNeeded.mockRejectedValue(new ApiError(409, 'not_on_list', 'That line is not on the list.'))
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Passata' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not needed' }))
    expect(await screen.findByText('That line is not on the list.')).toBeInTheDocument()
    expect(screen.queryByText('Passata is not needed on this list')).toBeNull()
  })

  it('lists the Not needed Lines in a collapsed group; "Needed after all" puts one back, with no toast', async () => {
    show(makeList({ notNeeded: [rice] }))
    expect(screen.queryByText('Rice')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Needed after all: Rice' }))
    expect(actions.neededAfterAll).toHaveBeenCalledWith(5, '2026-11-15', 1)
    await waitFor(() => expect(actions.neededAfterAll).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('ticked Lines have no Menu', () => {
    show(makeList({ lines: [makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null })], progress: { ticked: 1, total: 1 } }))
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull()
  })

  it('names the unconfirmed past meals of a Line, and ships without "Mark it" until the Plan page can open To confirm', () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] }))
    expect(screen.getByText('Includes Tue Dinner, not marked Cooked yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mark it/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Mark it/ })).toBeNull()
  })

  it('a list saved by an older version (no notNeeded, no pastPlannedMeals) renders as before', () => {
    show(makeList())
    expect(screen.getByText('Passata')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Not needed \(/ })).toBeNull()
  })
})
