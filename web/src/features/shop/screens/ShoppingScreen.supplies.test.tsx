import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import type { ShoppingList } from '../types'

// H7': the Shop screen with Supply Lines: the header (range and Shop) still works, ticking a Restock Line goes through the same
// sheet and API call as any Line, and the status groups (open, Ticked) hold Supply Lines like any other.

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
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [{ id: 3, name: 'milk', baseUnit: 'ml' }], isLoading: false }) }))

import { ShoppingScreen } from './ShoppingScreen'

const paper = () =>
  makeLine({ ingredientId: 20, name: 'Toilet paper', baseUnit: 'piece', kind: 'supply', restock: { level: 6, stock: 2 }, need: 6, available: 2, quantity: 4, pack: null, estimatedCostCents: null })
const rice = () => makeLine({ ingredientId: 1, name: 'Rice', kind: 'food', restock: null, quantity: 500, pack: null, estimatedCostCents: null })
const mixed = (): ShoppingList => makeList({ lines: [paper(), rice()], progress: { ticked: 0, total: 2 } })

function show(list: ShoppingList) {
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: false, error: null, stale: false, status: 'ready', retry: vi.fn() })
  render(
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
  choice.setShopId.mockReset()
  here.useShopHere.mockReset().mockReturnValue({ status: 'idle', anyLocated: false, find: vi.fn() })
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }, { id: 2, name: 'Aldi' }], shopId: 1, setShopId: choice.setShopId, isLoading: false })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ticked: true, lotId: null, created: false })
})

describe('ShoppingScreen with Supply Lines', () => {
  it('the header keeps its range and Shop pickers, and the Supplies group is below them', () => {
    show(mixed())
    expect(screen.getByRole('combobox', { name: /Shop for/ })).toHaveTextContent('Until Sun 15')
    expect(screen.getByRole('combobox', { name: /^Shop\b(?! for)/ })).toHaveTextContent('Coop')
    const header = document.querySelector('.shop-screen__controls')!
    const group = screen.getByRole('region', { name: /^Supplies/ })
    expect(header.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('picking another Shop still remembers it, with the Supply Lines on the list', async () => {
    show(mixed())
    await userEvent.click(screen.getByRole('combobox', { name: /^Shop\b(?! for)/ }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Aldi/ }))
    expect(choice.setShopId).toHaveBeenCalledWith(2)
  })

  it('the metric strip counts Supply Lines like any Line ("N of M left")', () => {
    show(makeList({ lines: [paper(), rice()], progress: { ticked: 0, total: 2 } }))
    expect(screen.getByRole('group', { name: 'Summary' })).toHaveTextContent(/2\s*of 2 left/)
  })

  it('ticking a Restock Line opens the same "How much?" sheet, prefilled with what it needs, and ticks by Ingredient', async () => {
    show(mixed())
    await userEvent.click(screen.getByRole('button', { name: 'Tick Toilet paper' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('spinbutton')).toHaveValue('4')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tick and add to Stock' }))
    expect(actions.tick).toHaveBeenCalledWith(expect.objectContaining({ ingredientId: 20, quantity: 4, to: '2026-11-15', shopId: 1 }))
  })

  it('a ticked Supply Line is shown in Ticked, not in the Supplies group', () => {
    show(makeList({ lines: [{ ...paper(), ticked: true, quantity: 0 }, rice()], progress: { ticked: 1, total: 2 } }))
    expect(screen.queryByRole('list', { name: 'Supplies' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Ticked' })).getByRole('button', { name: 'Tick Toilet paper', pressed: true })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'To get' })).getByRole('button', { name: 'Rice' })).toBeInTheDocument()
  })

  it('a Supply extra ticks and unticks through the extras API, in its group', async () => {
    show(makeList({ lines: [], extras: [makeExtra({ id: 5, text: null, ingredientId: 20, name: 'Toilet paper', baseUnit: 'piece', quantity: 9, kind: 'supply' })], progress: { ticked: 0, total: 1 } }))
    expect(within(screen.getByRole('list', { name: 'Supplies' })).getByRole('button', { name: 'Toilet paper' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tick Toilet paper' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('the row sheet of a Restock Line offers Not needed, as for any open Line', async () => {
    show(mixed())
    await userEvent.click(screen.getByRole('button', { name: 'Toilet paper' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Not needed' }))
    expect(actions.notNeeded).toHaveBeenCalledWith({ ingredientId: 20, to: '2026-11-15', shopId: 1 })
  })

  it('a food-only list has no Supplies group and the screen is as before', () => {
    show(makeList({ lines: [rice()], progress: { ticked: 0, total: 1 } }))
    expect(screen.queryByRole('region', { name: /Supplies/ })).toBeNull()
    expect(screen.getByRole('list', { name: 'To get' })).toBeInTheDocument()
  })
})
