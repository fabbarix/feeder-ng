// R2-4 L-06: Stock is a two-column screen from 1280 px: the "Throw out or keep?" tile, the search and the filter chips in a sticky aside,
// the Stock list beside it. The DOM order is the phone order (tile, search, chips, list), so one tree serves both.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

type Status = 'loading' | 'error' | 'offline' | 'empty' | 'ready'
const hooks = vi.hoisted(() => ({
  totals: { data: [] as unknown[], isLoading: false, error: null, status: 'ready' as Status, refetch: vi.fn() },
  spoiled: { data: [] as unknown[], today: '2026-11-09', isLoading: false, error: null, status: 'empty' as Status, refetch: vi.fn() },
}))
vi.mock('../hooks/useStock', () => ({
  useStockTotals: () => hooks.totals,
  useStockLots: () => ({ data: [], today: '2026-11-09', isLoading: false, error: null, status: 'ready', refetch: vi.fn() }),
  useSpoiledLots: () => ({ ...hooks.spoiled, throwOut: vi.fn(), keep: vi.fn() }),
  useStockActions: () => ({ addLot: vi.fn(), setTotal: vi.fn(), throwOut: vi.fn() }),
}))
// The Pantry list has its own tests (StockScreen.pantry.test.tsx); these cover the By Ingredient list.
vi.mock('../hooks/usePantry', () => ({
  usePantry: () => ({
    mode: 'ingredients',
    setMode: vi.fn(),
    lots: { data: [], today: '2026-11-09', isLoading: false, error: null, status: 'ready', refetch: vi.fn() },
    places: [],
    view: { query: '', status: 'all', places: [], kinds: [], sort: 'goodUntil', groupByPlace: true },
    setView: vi.fn(),
    groups: [],
    placeOf: () => null,
  }),
}))
vi.mock('../hooks/useStockTakeEntry', () => ({ useStockTakeEntry: () => vi.fn() }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

const view = () => render(<MemoryRouter><ToastProvider><StockScreen /></ToastProvider></MemoryRouter>)

beforeEach(() => {
  hooks.totals.data = [makeTotal({ ingredientId: 1, name: 'milk', baseUnit: 'ml', total: 1000 }), makeTotal({ ingredientId: 3, name: 'feta', total: 200 })]
  hooks.totals.status = 'ready'
  hooks.spoiled.data = [makeLot({ id: 9, ingredientName: 'cream' })]
  hooks.spoiled.status = 'ready'
})

describe('StockScreen two-column layout (L-06)', () => {
  it('wraps the aside and the list in one layout element', () => {
    view()
    const layout = document.querySelector('.stock-screen__layout')
    expect(layout).not.toBeNull()
    expect(layout!.querySelector(':scope > .stock-screen__aside')).not.toBeNull()
    expect(layout!.querySelector(':scope > .stock-screen__main')).not.toBeNull()
  })

  it('the aside is a labelled complementary landmark holding the spoiled tile, the search and the filter chips', () => {
    view()
    const aside = screen.getByRole('complementary', { name: 'Filter Stock' })
    expect(within(aside).getByRole('region', { name: 'Throw out or keep?' })).toBeInTheDocument()
    expect(within(aside).getByRole('searchbox', { name: 'Search Stock' })).toBeInTheDocument()
    expect(within(aside).getByRole('group', { name: 'Show' })).toBeInTheDocument()
  })

  it('the Stock list sits in the main column, outside the aside', () => {
    view()
    const aside = screen.getByRole('complementary', { name: 'Filter Stock' })
    const list = screen.getByRole('list', { name: 'Stock' })
    expect(aside).not.toContainElement(list)
    expect(document.querySelector('.stock-screen__main')).toContainElement(list)
  })

  it('keeps the phone order: aside before list in the DOM', () => {
    view()
    const aside = screen.getByRole('complementary', { name: 'Filter Stock' })
    const list = screen.getByRole('list', { name: 'Stock' })
    expect(aside.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('without spoiled lots the aside still holds the search and the chips', () => {
    hooks.spoiled.data = []
    hooks.spoiled.status = 'empty'
    view()
    const aside = screen.getByRole('complementary', { name: 'Filter Stock' })
    expect(within(aside).queryByRole('region', { name: 'Throw out or keep?' })).toBeNull()
    expect(within(aside).getByRole('searchbox', { name: 'Search Stock' })).toBeInTheDocument()
  })

  it('renders no empty aside while Stock loads and nothing is spoiled', () => {
    hooks.spoiled.data = []
    hooks.spoiled.status = 'empty'
    hooks.totals.status = 'loading'
    view()
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
