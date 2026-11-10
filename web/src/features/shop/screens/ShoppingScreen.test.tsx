import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeExtra, makeLine, makeList } from '../testData'
import type { ShoppingList } from '../types'

const listHook = vi.hoisted(() => ({ useShoppingList: vi.fn() }))
vi.mock('../hooks/useShoppingList', () => listHook)
const actions = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), addExtra: vi.fn(), deleteExtra: vi.fn(), tickExtra: vi.fn(), untickExtra: vi.fn() }))
vi.mock('../hooks/useShoppingActions', () => ({ useShoppingActions: () => actions }))
const choice = vi.hoisted(() => ({ useShopChoice: vi.fn(), setShopId: vi.fn() }))
vi.mock('../hooks/useShopChoice', () => ({ useShopChoice: choice.useShopChoice }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../stock/hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [{ id: 3, name: 'milk', baseUnit: 'ml' }], isLoading: false }) }))

import { ShoppingScreen } from './ShoppingScreen'

type Status = 'loading' | 'error' | 'offline' | 'empty' | 'ready'

function show(list: ShoppingList | undefined, extra: Record<string, unknown> = {}, status: Status = list ? 'ready' : 'loading') {
  const retry = vi.fn()
  listHook.useShoppingList.mockReturnValue({ data: list, isLoading: !list, error: null, stale: false, status, retry, ...extra })
  render(
    <MemoryRouter initialEntries={['/shop']}>
      <Routes>
        <Route path="/shop" element={<ShoppingScreen />} />
        <Route path="/scan" element={<p>Scan screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { retry }
}

beforeEach(() => {
  listHook.useShoppingList.mockReset()
  choice.setShopId.mockReset()
  choice.useShopChoice.mockReturnValue({ shops: [{ id: 1, name: 'Coop' }, { id: 2, name: 'Aldi' }], shopId: 1, setShopId: choice.setShopId, isLoading: false })
  for (const f of Object.values(actions)) f.mockReset().mockResolvedValue({ ticked: true, lotId: null, created: false })
})

describe('ShoppingScreen', () => {
  it('has a header with the range Select, the Shop picker (G3) and an Add an extra IconButton', () => {
    show(makeList())
    expect(screen.getByRole('heading', { level: 1, name: 'Shop' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Shop for/ })).toHaveTextContent('Until Sun 15')
    expect(screen.getByRole('combobox', { name: /^Shop\b(?! for)/ })).toHaveTextContent('Coop')
    expect(screen.getByRole('button', { name: 'Add an extra' })).toBeInTheDocument()
    expect(document.querySelector('select, input[type=checkbox], input[type=radio]')).toBeNull()
  })

  it('G3: picking another Shop remembers it and refetches the list priced at that Shop', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('combobox', { name: /^Shop\b(?! for)/ }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: /Aldi/ }))
    expect(choice.setShopId).toHaveBeenCalledWith(2)
  })

  it('asks the list for the picked Shop', () => {
    show(makeList())
    expect(listHook.useShoppingList).toHaveBeenCalledWith(expect.objectContaining({ shopId: 1 }))
  })

  it('shows how many are left, the estimate "est. at <Shop>" and a Scan shortcut, then the Lines', async () => {
    show(makeList({ lines: [makeLine(), makeLine({ ingredientId: 3, name: 'rice', quantity: 600, pack: null, estimatedCostCents: null })], progress: { ticked: 0, total: 2 }, estimatedCostCents: 318, unpricedLines: 1 }))
    const bar = screen.getByRole('progressbar', { name: 'Left to get' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '2')
    expect(document.querySelector('.progress-tile__value')).toHaveTextContent('2')
    // the total is in the CostTile; the Passata line shows the same $3.18 in its own tile (LineTile test), so query the tile
    expect(document.querySelector('.cost-tile__value')).toHaveTextContent('$3.18')
    expect(screen.getByText('est. at Coop')).toBeInTheDocument()
    expect(screen.getByText('1 without a price')).toBeInTheDocument()
    expect(screen.getByText('2 × Mutti 700 g')).toBeInTheDocument()
    expect(screen.getByText('600 g')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('—')
    await userEvent.click(screen.getByRole('button', { name: 'Scan' }))
    expect(screen.getByText('Scan screen')).toBeInTheDocument()
  })

  it('QA: with no Price anywhere there is no "Estimated cost $0.00"', () => {
    show(makeList({ lines: [makeLine({ estimatedCostCents: null, pack: null })], estimatedCostCents: 0, unpricedLines: 1 }))
    expect(document.body).not.toHaveTextContent('$0.00')
    expect(screen.queryByText('Estimated cost')).toBeNull()
  })

  it('asks how much before ticking a Line, then adds the Stock Lot', async () => {
    show(makeList())
    await userEvent.click(screen.getByRole('button', { name: 'Tick Passata' }))
    const sheet = screen.getByRole('dialog', { name: 'Tick Passata' })
    expect(within(sheet).getByRole('spinbutton', { name: 'How much?' })).toHaveValue('1400')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Tick and add to Stock' }))
    expect(actions.tick).toHaveBeenCalledWith({ ingredientId: 2, to: '2026-11-15', quantity: 1400, shopId: 1 })
  })

  it('ticks a free-text extra at once', async () => {
    show(makeList({ lines: [], extras: [makeExtra()], progress: { ticked: 0, total: 1 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick toilet paper' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.tickExtra).toHaveBeenCalledWith(1, 0, 1)
  })

  it('asks how much for an Ingredient extra', async () => {
    show(makeList({ lines: [], extras: [makeExtra({ id: 2, text: null, ingredientId: 3, name: 'milk', baseUnit: 'ml', quantity: 2000 })], progress: { ticked: 0, total: 1 } }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick milk' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tick and add to Stock' }))
    expect(actions.tickExtra).toHaveBeenCalledWith(2, 2000, 1)
  })

  it('QA: ticks are visible - a ticked Line sits in the Ticked group with a check mark', async () => {
    show(makeList({ lines: [makeLine(), makeLine({ ingredientId: 4, name: 'rice', ticked: true, quantity: 0, pack: null, estimatedCostCents: null })], progress: { ticked: 1, total: 2 } }))
    const ticked = screen.getByRole('group', { name: 'Ticked' })
    const untick = within(ticked).getByRole('button', { name: 'Untick rice' })
    expect(untick.querySelector('svg')).not.toBeNull()
    await userEvent.click(untick)
    expect(actions.untick).toHaveBeenCalledWith(4, '2026-11-15')
    expect(screen.queryByRole('button', { name: 'Untick Passata' })).toBeNull()
  })

  it('extras can be deleted', async () => {
    show(makeList({ lines: [], extras: [makeExtra()], progress: { ticked: 0, total: 1 } }))
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
    await userEvent.click(screen.getByRole('combobox', { name: /Shop for/ }))
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Until tomorrow' }))
    expect(listHook.useShoppingList).toHaveBeenLastCalledWith(expect.objectContaining({ to: '2026-11-10' }))
  })

  it('QA: the celebration sits on top, before every tile', () => {
    show(makeList({ lines: [makeLine({ ticked: true, quantity: 0, pack: null, estimatedCostCents: null }), makeLine({ ingredientId: 5, name: 'rice', ticked: true, quantity: 0, pack: null, estimatedCostCents: null })], progress: { ticked: 2, total: 2 }, complete: true, summary: { lines: 2, spentCents: 318, lotsAdded: 2 } }))
    const celebration = screen.getByRole('status')
    expect(celebration).toHaveTextContent('Shopping list complete')
    expect(celebration).toHaveTextContent('$3.18 spent')
    for (const article of document.querySelectorAll('article')) {
      expect(celebration.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('does not celebrate an unfinished list', () => {
    show(makeList())
    expect(screen.queryByText('Shopping list complete')).toBeNull()
  })

  it('says so when there is nothing to buy', () => {
    show(makeList({ lines: [], extras: [], progress: { ticked: 0, total: 0 }, estimatedCostCents: 0 }), {}, 'empty')
    expect(screen.getByText('Nothing to buy')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('$0.00')
  })

  it('offline: shows the saved list, marked as the last one loaded (the shell shows the OfflineBanner)', () => {
    show(makeList(), { stale: true }, 'offline')
    expect(screen.getByText('Showing the last list you loaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tick Passata' })).toBeInTheDocument()
  })

  it('shows a Skeleton, not a blank page, while loading', async () => {
    show(undefined, {}, 'loading')
    expect(await screen.findByText('Loading')).toBeInTheDocument()
  })

  it('shows an ErrorState with Try again on a load error', async () => {
    const { retry } = show(undefined, { error: new Error('no such Shop') }, 'error')
    expect(screen.getByRole('alert')).toHaveTextContent('The Shopping List could not be loaded.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
