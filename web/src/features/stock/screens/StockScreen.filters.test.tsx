// pantry-filter: the Pantry filter header on the screen: its rows, the Filters panel, the active chips, the URL and Back
// (docs/design/pantry-filter.md 2, 3, 4, 6).
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { mockApi, newQueryClient } from '../../settings/test-utils'
import { PANTRY_MODE_KEY } from '../hooks/usePantryFilters'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
]
const lots = [
  makeLot({ id: 11, ingredientId: 7, ingredientName: 'minced beef', quantity: 1000, goesOff: '2026-11-12', useSoon: true, storagePlaceId: 3 }),
  makeLot({ id: 12, ingredientId: 8, ingredientName: 'peas', quantity: 900, goesOff: '2027-02-01', storagePlaceId: 2 }),
  makeLot({ id: 13, ingredientId: 9, ingredientName: 'rice', quantity: 2000, goesOff: null, storagePlaceId: 1 }),
  makeLot({ id: 14, ingredientId: 10, ingredientName: 'feta', quantity: 200, goesOff: '2026-11-20', storagePlaceId: null }),
]

const Where = () => {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
const Elsewhere = () => {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  )
}
const ToLot = () => {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/ingredients/7')}>
      Go away
    </button>
  )
}

function view(url = '/pantry') {
  mockApi({
    'GET /api/stock': { ingredients: lots.map((l) => makeTotal({ ingredientId: l.ingredientId, name: l.ingredientName, total: l.quantity, lotCount: 1, useSoon: l.useSoon })) },
    'GET /api/stock/lots': { lots, today: '2026-11-11' },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-11' },
    'GET /api/storage-places': places,
  })
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={['/start', url]} initialIndex={1}>
            <Routes>
              <Route path="/start" element={<Where />} />
              <Route path="/pantry" element={<><StockScreen /><ToLot /><Where /></>} />
              <Route path="/ingredients/:id" element={<><Elsewhere /><Where /></>} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent ?? ''
const params = () => new URLSearchParams(where().split('?')[1] ?? '')
const filtersButton = () => screen.getByRole('button', { name: /^Filters/ })
const panel = () => screen.getByRole('dialog', { name: 'Filters' })
const groupNames = () => screen.getAllByRole('list').map((l) => l.getAttribute('aria-label')).filter((n) => n?.includes('Stock Lot'))
const ready = () => screen.findByRole('list', { name: /^Garage Freezer/ })

beforeEach(() => {
  localStorage.removeItem(PANTRY_MODE_KEY)
})
afterEach(() => vi.unstubAllGlobals())

describe.each([390, 834, 1440])('the Pantry header at %i px', (width) => {
  beforeEach(() => stubViewportWidth(width))

  it('row 1 is Search and Filters, row 2 the List control and Sort; no row 3 without a filter', async () => {
    const { container } = view()
    await ready()
    const rows = container.querySelectorAll('.filter-bar > .filter-bar__row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveClass('filter-bar__search-row')
    expect(within(rows[0] as HTMLElement).getByRole('searchbox', { name: 'Search Stock' })).toBeInTheDocument()
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Filters' })).toBeInTheDocument()
    expect(rows[1]).toHaveClass('filter-bar__view-row')
    expect(within(rows[1] as HTMLElement).getByRole('radiogroup', { name: 'List' })).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Good until')
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull()
  })
  it('the old stacked controls are gone: no All chip, no visible Sort label, no switch or settings button on the page', async () => {
    view()
    await ready()
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull()
    expect(screen.queryByText('Sort by')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Storage Places' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Storage Places' })).toBeNull()
  })
  it('a filter chosen in the panel filters the list, shows as a chip and is in the URL', async () => {
    view()
    await ready()
    await userEvent.click(filtersButton())
    await userEvent.click(within(panel()).getByRole('option', { name: /Garage Freezer/ }))
    await userEvent.click(within(panel()).getByRole('option', { name: /Not sorted/ }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Show Stock' }))
    expect(groupNames()).toEqual(['Garage Freezer, 1 Stock Lot', 'Not sorted, 1 Stock Lot'])
    expect(params().getAll('place')).toEqual(['2', 'none'])
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument()
    const chips = screen.getByRole('group', { name: 'Active filters' })
    expect(within(chips).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove Storage Place: Garage Freezer',
      'Remove Storage Place: Not sorted',
    ])
  })
})

describe('filters', () => {
  it('Use soon keeps the Lots to use soon, in the spoil colour; removing its chip brings everything back', async () => {
    view()
    await ready()
    await userEvent.click(filtersButton())
    await userEvent.click(within(within(panel()).getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Use soon' }))
    expect(params().get('status')).toBe('useSoon')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Show Stock' }))
    expect(groupNames()).toEqual(['Garage Fridge, 1 Stock Lot'])
    const chip = screen.getByRole('button', { name: 'Remove Use soon' })
    expect(chip).toHaveAttribute('data-status', 'spoil')
    await userEvent.click(chip)
    expect(groupNames()).toHaveLength(4)
    expect(params().has('status')).toBe(false)
    expect(filtersButton()).toHaveFocus()
  })
  it('a kind keeps its Storage Places; Clear filters keeps the list, the sort and the grouping', async () => {
    view('/pantry?sort=name&group=off')
    await screen.findByRole('list', { name: /^Stock Lots/ })
    await userEvent.click(filtersButton())
    await userEvent.click(within(within(panel()).getByRole('group', { name: 'Filter by kind' })).getByRole('button', { name: 'Freezer' }))
    expect(screen.getByRole('list', { name: /^Stock Lots, 1 Stock Lot/ })).toBeInTheDocument()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Clear filters' }))
    expect(where()).toBe('/pantry?sort=name&group=off')
    expect(within(panel()).getByRole('button', { name: 'Show Stock' })).toHaveFocus()
  })
  it('the search filters the list as you type and stays out of the URL', async () => {
    view()
    await ready()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Stock' }), 'pea')
    expect(groupNames()).toEqual(['Garage Freezer, 1 Stock Lot'])
    expect(where()).toBe('/pantry')
  })
  it('the switch in the panel turns the grouping off (group=off)', async () => {
    view()
    await ready()
    await userEvent.click(filtersButton())
    await userEvent.click(within(panel()).getByRole('switch', { name: 'Group by Storage Place' }))
    expect(params().get('group')).toBe('off')
    expect(screen.getByRole('list', { name: /^Stock Lots, 4 Stock Lots/ })).toBeInTheDocument()
  })
  it('the Sort chip writes the URL', async () => {
    view()
    await ready()
    await userEvent.click(screen.getByRole('combobox', { name: 'Sort' }))
    await userEvent.click(screen.getByRole('option', { name: 'Quantity' }))
    expect(params().get('sort')).toBe('quantity')
  })
  it('counts one filter per chip, in the order of the panel', async () => {
    // jsdom lays nothing out, so every chip shows; "+N" is covered by ActiveFilterChips and the page-layout guard (P17, P21).
    view('/pantry?status=spoiled&place=3&place=1&kind=fridge')
    await screen.findByRole('group', { name: 'Active filters' })
    expect(screen.getByRole('button', { name: 'Filters, 4 active' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Active filters' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove Spoiled',
      'Remove kind: Fridge',
      'Remove Storage Place: Garage Fridge',
      'Remove Storage Place: Kitchen Pantry',
    ])
  })
})

describe('By Ingredient', () => {
  it('has no Sort and only the status filter; place filters are kept in the URL but not applied or shown', async () => {
    view('/pantry?view=ingredients&place=2&status=useSoon')
    await screen.findByRole('list', { name: 'Stock' })
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Stock' })).getAllByRole('listitem')).toHaveLength(1)
    expect(params().getAll('place')).toEqual(['2'])
    await userEvent.click(filtersButton())
    expect(within(panel()).queryByRole('listbox')).toBeNull()
  })
  it('choosing it writes the URL and the device', async () => {
    view()
    await ready()
    await userEvent.click(screen.getByRole('radio', { name: 'Ingredient' }))
    expect(params().get('view')).toBe('ingredients')
    expect(localStorage.getItem(PANTRY_MODE_KEY)).toBe('ingredients')
  })
})

describe('the URL and Back', () => {
  it('a link with every parameter opens the Pantry exactly so', async () => {
    view('/pantry?view=places&status=useSoon&place=3&kind=fridge&sort=name&group=off')
    await screen.findByRole('list', { name: /^Stock Lots/ })
    expect(screen.getByRole('radio', { name: 'Storage Place' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Name')
    expect(screen.getByRole('button', { name: 'Filters, 3 active' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /^Stock Lots, 1 Stock Lot/ })).toBeInTheDocument()
  })
  it('the filters come back with Back: each change replaced the Pantry entry, so the history is /start, /pantry?…, /ingredients/7', async () => {
    view()
    await ready()
    await userEvent.click(filtersButton())
    await userEvent.click(within(within(panel()).getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Use soon' }))
    await userEvent.click(within(panel()).getByRole('option', { name: /Garage Fridge/ }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Show Stock' }))
    await userEvent.click(screen.getByRole('button', { name: 'Go away' }))
    expect(where()).toBe('/ingredients/7')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(where()).toBe('/pantry?status=useSoon&place=3'))
    expect(await screen.findByRole('button', { name: 'Remove Use soon' })).toBeInTheDocument()
  })
  it('a Storage Place that no longer exists is ignored', async () => {
    view('/pantry?place=99')
    await ready()
    expect(filtersButton()).toHaveAccessibleName('Filters')
    expect(groupNames()).toHaveLength(4)
  })
})

describe('the page header', () => {
  it('keeps Stock-take and Add to Stock (the one primary), and moves Storage Places into the More menu', async () => {
    view()
    await ready()
    expect(screen.getByRole('button', { name: 'Stock-take' })).toHaveAttribute('data-variant', 'secondary')
    const primaries = [...document.querySelectorAll('.button[data-variant="primary"]')]
    expect(primaries.map((b) => b.textContent)).toEqual(['Add to Stock'])
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Storage Places' })).toHaveAttribute('href', '/settings/storage-places')
  })
})
