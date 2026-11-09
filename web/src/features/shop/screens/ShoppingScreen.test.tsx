import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import type { ShoppingList } from '../types'

const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn() }))
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [{ id: 3, name: 'milk', baseUnit: 'ml' }], isLoading: false }) }))
vi.mock('../../scan/lib/lastShop', () => ({ getLastShopId: () => 1, setLastShopId: vi.fn(), LAST_SHOP_KEY: 'x' }))

import { ShoppingScreen } from './ShoppingScreen'

function show(list: ShoppingList | undefined, extra: Record<string, unknown> = {}) {
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: false, error: null, stale: false, ...extra })
  render(<ShoppingScreen />)
}

beforeEach(() => {
  listHook.useShoppingList.mockReset()
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ticked: true, lotId: null, created: false })
})

describe('ShoppingScreen', () => {
  it('shows progress, the estimated cost, the range and the items', () => {
    show(makeList({ lines: [makeLine(), makeLine({ ingredientId: 3, name: 'rice', quantity: 600, pack: null, costCents: null })], progress: { done: 0, total: 2 }, estimatedCostCents: 318, unpricedLines: 1 }))
    expect(screen.getByRole('progressbar', { name: 'Items ticked' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('Estimated cost')).toBeInTheDocument()
    expect(screen.getByText('1 without a price')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Shop for' })).toBeInTheDocument()
    expect(screen.getByText('1400 g · 2 × Mutti 700 g')).toBeInTheDocument()
    expect(screen.getByText('600 g')).toBeInTheDocument()
    expect(listHook.useShoppingList).toHaveBeenCalledWith(expect.objectContaining({ shopId: 1 }))
  })

  it('asks how much before ticking a Line, then adds the Stock Lot', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Tick Passata' }))
    const sheet = screen.getByRole('dialog', { name: 'Tick Passata' })
    expect(within(sheet).getByLabelText('How much?')).toHaveValue('1400')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Tick and add to Stock' }))
    expect(actions.tick).toHaveBeenCalledWith({ ingredientId: 2, to: '2026-11-15', quantity: 1400, shopId: 1 })
  })

  it('ticks a free-text extra at once', async () => {
    show(makeList({ lines: [], extras: [makeExtra()], progress: { done: 0, total: 1 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick toilet paper' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.tickExtra).toHaveBeenCalledWith(1, 0, 1)
  })

  it('asks how much for an Ingredient extra', async () => {
    show(makeList({ lines: [], extras: [makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000 })], progress: { done: 0, total: 1 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick milk' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick and add to Stock' }))
    expect(actions.tickExtra).toHaveBeenCalledWith(2, 2000, 1)
  })

  it('ticked items sit in the Done group and can be unticked', async () => {
    show(makeList({ lines: [makeLine(), makeLine({ ingredientId: 4, name: 'rice', ticked: true, quantity: 0, pack: null, costCents: null })], progress: { done: 1, total: 2 } }))
    const done = screen.getByRole('group', { name: 'Done' })
    await userEvent.click(within(done).getByRole('button', { name: 'Untick rice' }))
    expect(actions.untick).toHaveBeenCalledWith(4, '2026-11-15')
    expect(screen.queryByRole('button', { name: 'Untick Passata' })).toBeNull()
  })

  it('extras can be deleted', async () => {
    show(makeList({ lines: [], extras: [makeExtra()], progress: { done: 0, total: 1 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete toilet paper' }))
    expect(actions.deleteExtra).toHaveBeenCalledWith(1)
  })

  it('adds an extra from the sheet', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Add an extra' }))
    await userEvent.type(screen.getByLabelText('Something to buy'), 'candles')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(actions.addExtra).toHaveBeenCalledWith({ text: 'candles' })
  })

  it('changing the range asks for the new last date', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }))
    expect(listHook.useShoppingList).toHaveBeenLastCalledWith(expect.objectContaining({ to: '2026-11-10' }))
  })

  it('celebrates when the list is complete', () => {
    show(makeList({ lines: [makeLine({ ticked: true, quantity: 0, pack: null, costCents: null })], progress: { done: 1, total: 1 }, complete: true, summary: { items: 1, spentCents: 318, lotsAdded: 2 } }))
    expect(screen.getByRole('status')).toHaveTextContent('Shopping list complete')
    expect(screen.getByRole('status')).toHaveTextContent('$3.18 spent')
  })

  it('does not celebrate an unfinished list', () => {
    show(makeList())
    expect(screen.queryByText('Shopping list complete')).toBeNull()
  })

  it('says so when there is nothing to buy', () => {
    show(makeList({ lines: [], extras: [], progress: { done: 0, total: 0 }, estimatedCostCents: 0 }))
    expect(screen.getByText('Nothing to buy')).toBeInTheDocument()
  })

  it('says when it shows the saved list because the network is down', () => {
    show(makeList(), { stale: true })
    expect(screen.getByText('Showing the last list you loaded')).toBeInTheDocument()
  })

  it('shows a load error', () => {
    show(undefined, { error: new Error('no such Shop') })
    expect(screen.getByText('no such Shop')).toBeInTheDocument()
  })
})
