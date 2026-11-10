import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

type Status = 'loading' | 'error' | 'offline' | 'empty' | 'ready'
const hooks = vi.hoisted(() => ({
  totals: { data: [] as unknown[], isLoading: false, error: null, status: 'ready' as Status, refetch: vi.fn() },
  lots: { data: [] as unknown[], today: '2026-11-09', isLoading: false, error: null, status: 'ready' as Status, refetch: vi.fn() },
  spoiled: { data: [] as unknown[], today: '2026-11-09', isLoading: false, error: null, status: 'empty' as Status, refetch: vi.fn() },
  throwOut: vi.fn(),
  actionThrowOut: vi.fn(),
  keep: vi.fn(),
  addLot: vi.fn(),
  setTotal: vi.fn(),
  stockTake: vi.fn(),
}))

vi.mock('../hooks/useStock', () => ({
  useStockTotals: () => hooks.totals,
  useStockLots: () => hooks.lots,
  useSpoiledLots: () => ({ ...hooks.spoiled, throwOut: hooks.throwOut, keep: hooks.keep }),
  useStockActions: () => ({ addLot: hooks.addLot, setTotal: hooks.setTotal, throwOut: hooks.actionThrowOut }),
}))
vi.mock('../hooks/useStockTakeEntry', () => ({ useStockTakeEntry: () => hooks.stockTake }))
vi.mock('../hooks/useIngredientChoices', () => ({
  useIngredientChoices: () => ({ choices: [{ id: 7, name: 'chicken thighs', baseUnit: 'g' }], isLoading: false }),
}))

const view = () => render(<ToastProvider><StockScreen /></ToastProvider>)

beforeEach(() => {
  hooks.totals.data = [
    makeTotal({ ingredientId: 1, name: 'milk', total: 1000, baseUnit: 'ml', lotCount: 1 }),
    makeTotal({ ingredientId: 7, name: 'chicken thighs', total: 800, useSoon: true, lotCount: 2, nextGoesOff: '2026-11-12' }),
    makeTotal({ ingredientId: 3, name: 'feta', total: 200, lotCount: 1 }),
  ]
  hooks.totals.status = 'ready'
  hooks.lots.data = [makeLot({ id: 5, quantity: 800, goesOff: '2026-11-11', spoiled: false, useSoon: true })]
  hooks.spoiled.data = []
  hooks.spoiled.status = 'empty'
  for (const k of ['throwOut', 'actionThrowOut', 'keep', 'addLot', 'setTotal', 'stockTake'] as const) hooks[k].mockReset().mockResolvedValue(undefined)
  hooks.totals.refetch.mockReset()
})

describe('StockScreen layout', () => {
  it('has a PageHeader h1 and no back button or own <main>', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'Stock' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull()
    expect(document.querySelector('main')).toBeNull()
    expect(document.querySelector('header.page-header')).not.toBeNull()
  })

  it('lists the Ingredients as ListRows in a separated group, use-soon first, with no tiles', () => {
    view()
    const list = screen.getByRole('list', { name: 'Stock' })
    expect(list.closest('.list-group')).not.toBeNull()
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.list-row__title')?.textContent)).toEqual(['Chicken thighs', 'Feta', 'Milk'])
    expect(rows[0]).toHaveTextContent('800 g')
    expect(rows[0]).toHaveTextContent('2 Stock Lots · goes off Thu')
    expect(rows[2]).toHaveTextContent('1000 ml')
    expect(document.querySelector('.bento-grid, .tile')).toBeNull()
  })

  it('shows Stock-take as a secondary Button with an icon, and Add to Stock as the only primary', () => {
    view()
    const stockTake = screen.getByRole('button', { name: 'Stock-take' })
    expect(stockTake).toHaveAttribute('data-variant', 'secondary')
    expect(stockTake.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Add to Stock' })).toHaveAttribute('data-variant', 'primary')
    expect(document.querySelectorAll('button[data-variant="primary"]')).toHaveLength(1)
  })

  it('Stock-take goes to the Stock-take entry', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Stock-take' }))
    expect(hooks.stockTake).toHaveBeenCalledTimes(1)
  })

  it('has no native controls', () => {
    view()
    expect(document.querySelector('select, input[type="date"], input[type="number"]')).toBeNull()
    // The only search input is the shared SearchField's own input.
    expect(document.querySelector('input[type="search"]:not(.search-field__input)')).toBeNull()
  })
})

describe('StockScreen search and filters', () => {
  it('filters by Use soon with an aria-pressed chip', async () => {
    view()
    const chip = screen.getByRole('button', { name: 'Use soon' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    const rows = within(screen.getByRole('list', { name: 'Stock' })).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Chicken thighs')
  })

  it('searches by name', async () => {
    view()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Stock' }), 'fet')
    const rows = within(screen.getByRole('list', { name: 'Stock' })).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Feta')
  })

  it('says so when nothing matches, and Stock is not empty', async () => {
    view()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Stock' }), 'zzz')
    expect(screen.getByText('Nothing in Stock matches')).toBeInTheDocument()
    expect(screen.queryByText('Nothing in Stock yet')).toBeNull()
  })
})

describe('StockScreen status', () => {
  it('loading shows a Skeleton, not the empty state', () => {
    hooks.totals.status = 'loading'
    hooks.totals.data = undefined as never
    view()
    expect(document.querySelector('.skeleton, [aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText('Nothing in Stock yet')).toBeNull()
  })

  it('error shows ErrorState with Try again that refetches, not the empty state', async () => {
    hooks.totals.status = 'error'
    hooks.totals.data = undefined as never
    view()
    // ToastProvider keeps an empty role=alert region, so find the ErrorState by its message.
    expect(screen.getByText('Stock could not be loaded.').closest('[role="alert"]')).not.toBeNull()
    expect(screen.queryByText('Nothing in Stock yet')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(hooks.totals.refetch).toHaveBeenCalledTimes(1)
  })

  it('offline with nothing saved says so and is not "Nothing in Stock yet"', () => {
    hooks.totals.status = 'offline'
    hooks.totals.data = undefined as never
    view()
    expect(screen.getByText('Stock is not saved on this device yet')).toBeInTheDocument()
    expect(screen.queryByText('Nothing in Stock yet')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('empty shows "Nothing in Stock yet" with the hint', () => {
    hooks.totals.status = 'empty'
    hooks.totals.data = []
    view()
    expect(screen.getByText('Nothing in Stock yet')).toBeInTheDocument()
    expect(screen.getByText('Scan at a Shop, add by hand, or do a Stock-take.')).toBeInTheDocument()
  })

  it('keeps Add to Stock and Stock-take reachable in every status', () => {
    for (const status of ['loading', 'error', 'offline', 'empty'] as const) {
      hooks.totals.status = status
      hooks.totals.data = undefined as never
      const { unmount } = view()
      expect(screen.getByRole('button', { name: 'Stock-take' })).toBeInTheDocument()
      unmount()
    }
  })
})

describe('StockScreen actions', () => {
  it('shows "Throw out or keep?" only when there are spoiled lots, and answers it', async () => {
    const { rerender } = view()
    expect(screen.queryByText('Throw out or keep?')).toBeNull()
    hooks.spoiled.data = [makeLot({ id: 42 })]
    hooks.spoiled.status = 'ready'
    rerender(<ToastProvider><StockScreen /></ToastProvider>)
    expect(screen.getByText('Throw out or keep?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Throw out chicken thighs' }))
    expect(hooks.throwOut).toHaveBeenCalledWith(42)
    await userEvent.click(screen.getByRole('button', { name: 'Keep chicken thighs' }))
    expect(hooks.keep).toHaveBeenCalledWith(42)
  })

  it('shows an error toast (not an inline paragraph) when a change fails, and stays usable', async () => {
    hooks.spoiled.data = [makeLot({ id: 42 })]
    hooks.spoiled.status = 'ready'
    hooks.throwOut.mockRejectedValue(new Error('500'))
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Throw out chicken thighs' }))
    expect(await screen.findByText('That did not save. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep chicken thighs' })).toBeEnabled()
  })

  it('opens lot detail for an Ingredient and sets its total', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Chicken thighs' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Goes off in 2 days')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Set total' }))
    const input = screen.getByLabelText('New total')
    await userEvent.clear(input)
    await userEvent.type(input, '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(hooks.setTotal).toHaveBeenCalledWith(7, 500)
  })

  it('lot sheet: Throw out appears only on spoiled lot rows and throws that lot out', async () => {
    hooks.lots.data = [
      makeLot({ id: 5, quantity: 800, goesOff: '2026-11-11', spoiled: false, useSoon: true }),
      makeLot({ id: 6, quantity: 100, goesOff: '2026-11-05', spoiled: true }),
    ]
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Chicken thighs' }))
    const sheet = screen.getByRole('dialog')
    const rows = within(sheet).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).queryByRole('button', { name: /Throw out/ })).toBeNull()
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /Throw out/ }))
    expect(hooks.actionThrowOut).toHaveBeenCalledWith(6)
  })

  it('lot sheet: a failed Throw out shows the error toast', async () => {
    hooks.lots.data = [makeLot({ id: 6, spoiled: true })]
    hooks.actionThrowOut.mockRejectedValue(new Error('500'))
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Chicken thighs' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Throw out/ }))
    expect(await screen.findByText('That did not save. Try again.')).toBeInTheDocument()
  })

  it('adds a Stock Lot by hand through the shared selects', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Add to Stock' }))
    const sheet = screen.getByRole('dialog', { name: 'Add a Stock Lot' })
    await userEvent.type(within(sheet).getByLabelText('Quantity'), '400')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(hooks.addLot).toHaveBeenCalledWith({ ingredientId: 7, quantity: 400 })
  })
})
