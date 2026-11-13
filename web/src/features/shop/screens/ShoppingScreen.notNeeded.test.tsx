import { render, screen, waitFor, within } from '@testing-library/react'
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

const openSheet = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const sheetButton = (sheet: string, name: string) => within(screen.getByRole('dialog', { name: sheet })).getByRole('button', { name })

// DS-SHOP: the ⋮ Menu is gone; a row tap opens the Line sheet, which has Not needed / Needed after all.
describe('ShoppingScreen Not needed', () => {
  it('"Not needed" in the Line sheet marks the Line for the list range and the picked Shop, closes the sheet, then offers Undo', async () => {
    show(makeList())
    expect(screen.queryByRole('button', { name: 'Actions for Passata' })).toBeNull()
    await openSheet('Passata')
    await userEvent.click(sheetButton('Passata', 'Not needed'))
    expect(actions.notNeeded).toHaveBeenCalledWith({ ingredientId: 2, to: '2026-11-15', shopId: 1 })
    expect(screen.queryByRole('dialog', { name: 'Passata' })).toBeNull()
    expect(await screen.findByText('Passata is not needed on this list')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(actions.neededAfterAll).toHaveBeenCalledWith(2, '2026-11-15', 1)
  })

  it('shows no toast when the call fails, and says why', async () => {
    actions.notNeeded.mockRejectedValue(new ApiError(409, 'not_on_list', 'That line is not on the list.'))
    show(makeList())
    await openSheet('Passata')
    await userEvent.click(sheetButton('Passata', 'Not needed'))
    expect(await screen.findByText('That line is not on the list.')).toBeInTheDocument()
    expect(screen.queryByText('Passata is not needed on this list')).toBeNull()
  })

  it('lists the Not needed Lines in a collapsed group; "Needed after all" in the row sheet puts one back, with no toast', async () => {
    show(makeList({ notNeeded: [rice] }))
    expect(screen.queryByText('Rice')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    await openSheet('Rice')
    await userEvent.click(sheetButton('Rice', 'Needed after all'))
    expect(actions.neededAfterAll).toHaveBeenCalledWith(5, '2026-11-15', 1)
    await waitFor(() => expect(actions.neededAfterAll).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })

  it('a ticked Line\'s sheet has no Not needed (Not needed is for open Lines)', async () => {
    show(makeList({ lines: [makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null })], progress: { ticked: 1, total: 1 } }))
    await openSheet('Passata')
    expect(within(screen.getByRole('dialog', { name: 'Passata' })).queryByRole('button', { name: 'Not needed' })).toBeNull()
  })

  it('names the unconfirmed past meals once, in the notice (the Mark it button: ShoppingScreen.markIt.test)', () => {
    show(makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] }))
    expect(screen.getByText('Includes Tue Dinner, not marked Cooked yet')).toBeInTheDocument()
  })

  it('a list saved by an older version (no notNeeded, no pastPlannedMeals) renders as before', () => {
    show(makeList())
    expect(screen.getByText('Passata')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Not needed \(/ })).toBeNull()
  })
})
