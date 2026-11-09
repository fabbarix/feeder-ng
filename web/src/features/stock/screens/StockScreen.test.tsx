import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

const hooks = vi.hoisted(() => ({
  totals: { data: [] as unknown[], isLoading: false, error: null },
  lots: { data: [] as unknown[], today: '2026-11-09', isLoading: false, error: null },
  spoiled: { data: [] as unknown[], today: '2026-11-09', isLoading: false, error: null },
  throwOut: vi.fn(),
  keep: vi.fn(),
  addLot: vi.fn(),
  setTotal: vi.fn(),
}))

vi.mock('../hooks/useStock', () => ({
  useStockTotals: () => hooks.totals,
  useStockLots: () => hooks.lots,
  useSpoiledLots: () => ({ ...hooks.spoiled, throwOut: hooks.throwOut, keep: hooks.keep }),
  useStockActions: () => ({ addLot: hooks.addLot, setTotal: hooks.setTotal }),
}))
vi.mock('../hooks/useIngredientChoices', () => ({
  useIngredientChoices: () => ({ choices: [{ id: 7, name: 'chicken thighs', baseUnit: 'g' }], isLoading: false }),
}))

beforeEach(() => {
  hooks.totals.data = [
    makeTotal({ ingredientId: 1, name: 'milk', total: 1000, baseUnit: 'ml' }),
    makeTotal({ ingredientId: 7, name: 'chicken thighs', total: 800, useSoon: true }),
  ]
  hooks.lots.data = [makeLot({ id: 5, quantity: 800, goesOff: '2026-11-11', spoiled: false, useSoon: true })]
  hooks.spoiled.data = []
  for (const k of ['throwOut', 'keep', 'addLot', 'setTotal'] as const) hooks[k].mockReset().mockResolvedValue(undefined)
})

describe('StockScreen', () => {
  it('shows the Ingredient totals with use-soon first', () => {
    render(<StockScreen />)
    expect(screen.getByRole('heading', { name: 'Stock' })).toBeInTheDocument()
    const tiles = screen.getAllByRole('button', { name: /chicken thighs|milk/ })
    expect(tiles[0]).toHaveTextContent('chicken thighs')
    expect(tiles[0]).toHaveTextContent('800 g')
    expect(tiles[1]).toHaveTextContent('1000 ml')
  })

  it('shows the empty state when there is nothing in Stock', () => {
    hooks.totals.data = []
    render(<StockScreen />)
    expect(screen.getByText('Nothing in Stock yet')).toBeInTheDocument()
  })

  it('shows "Throw out or keep?" only when there are spoiled lots, and answers it', async () => {
    const { rerender } = render(<StockScreen />)
    expect(screen.queryByText('Throw out or keep?')).toBeNull()
    hooks.spoiled.data = [makeLot({ id: 42 })]
    rerender(<StockScreen />)
    expect(screen.getByText('Throw out or keep?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Throw out chicken thighs' }))
    expect(hooks.throwOut).toHaveBeenCalledWith(42)
    await userEvent.click(screen.getByRole('button', { name: 'Keep chicken thighs' }))
    expect(hooks.keep).toHaveBeenCalledWith(42)
  })

  it('opens lot detail for an Ingredient and sets its total', async () => {
    render(<StockScreen />)
    await userEvent.click(screen.getByRole('button', { name: /chicken thighs/ }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Goes off in 2 days')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Set total' }))
    const input = screen.getByLabelText('New total')
    await userEvent.clear(input)
    await userEvent.type(input, '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(hooks.setTotal).toHaveBeenCalledWith(7, 500)
  })

  it('adds a Stock Lot by hand', async () => {
    render(<StockScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Add to Stock' }))
    await userEvent.selectOptions(screen.getByLabelText('Ingredient'), 'chicken thighs')
    await userEvent.type(screen.getByLabelText('Quantity'), '400')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(hooks.addLot).toHaveBeenCalledWith({ ingredientId: 7, quantity: 400 })
  })
})
