// Pantry: every Stock Lot grouped by Storage Place, filtered and sorted, and a Lot moved (all or part) to another place.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { makeLot, makeTotal } from '../testData'
import { PANTRY_MODE_KEY } from '../hooks/usePantry'
import { StockScreen } from './StockScreen'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [{ id: 7, name: 'minced beef', baseUnit: 'g' }], isLoading: false }) }))

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
]
const lots = [
  makeLot({ id: 11, ingredientId: 7, ingredientName: 'minced beef', quantity: 1000, goesOff: '2026-11-12', spoiled: false, useSoon: true, storagePlaceId: 3 }),
  makeLot({ id: 12, ingredientId: 8, ingredientName: 'peas', quantity: 900, goesOff: '2027-02-01', spoiled: false, storagePlaceId: 2 }),
  makeLot({ id: 13, ingredientId: 9, ingredientName: 'rice', quantity: 2000, goesOff: null, spoiled: false, storagePlaceId: 1 }),
  makeLot({ id: 14, ingredientId: 10, ingredientName: 'feta', quantity: 200, goesOff: '2026-11-20', spoiled: false, storagePlaceId: null }),
]

function setup() {
  const api = mockApi({
    'GET /api/stock': { ingredients: lots.map((l) => makeTotal({ ingredientId: l.ingredientId, name: l.ingredientName, total: l.quantity, lotCount: 1 })) },
    'GET /api/stock/lots': { lots, today: '2026-11-11' },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-11' },
    'GET /api/storage-places': places,
    'POST /api/stock/lots/11/move': (c: { body?: unknown }) => ({ json: { ...lots[0], storagePlaceId: (c.body as { storagePlaceId: number }).storagePlaceId } }),
  })
  renderWithProviders(<StockScreen />, '/stock')
  return api
}

beforeEach(() => {
  try {
    localStorage.removeItem(PANTRY_MODE_KEY)
  } catch {
    // no storage in this environment
  }
})
afterEach(() => vi.unstubAllGlobals())

const group = (name: RegExp) => screen.getByRole('list', { name })

describe('Pantry list', () => {
  it('is called Pantry and lists every Stock Lot by Storage Place, Not sorted last', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Pantry' })).toBeInTheDocument()
    await screen.findByRole('list', { name: /^Garage Freezer/ })
    const names = screen.getAllByRole('list').map((l) => l.getAttribute('aria-label')).filter((n) => n?.includes('Stock Lot'))
    expect(names).toEqual(['Garage Freezer, 1 Stock Lot', 'Garage Fridge, 1 Stock Lot', 'Kitchen Pantry, 1 Stock Lot', 'Not sorted, 1 Stock Lot'])
    expect(within(group(/^Garage Fridge/)).getByText('Minced beef')).toBeInTheDocument()
    expect(within(group(/^Garage Fridge/)).getByText(/1000 g · Good until tomorrow/)).toBeInTheDocument()
  })

  it('filters by Storage Place and kind, and searches', async () => {
    setup()
    await screen.findByRole('list', { name: /^Garage Freezer/ })
    await userEvent.click(within(screen.getByRole('group', { name: 'Kinds' })).getByRole('button', { name: /Freezer/ }))
    expect(screen.queryByRole('list', { name: /^Garage Fridge/ })).toBeNull()
    expect(group(/^Garage Freezer/)).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'Kinds' })).getByRole('button', { name: /Freezer/ }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Storage Places' })).getByRole('button', { name: /Not sorted/ }))
    expect(screen.getAllByRole('list').filter((l) => l.getAttribute('aria-label')?.includes('Stock Lot'))).toHaveLength(1)
    expect(screen.getByText('Feta')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'Storage Places' })).getByRole('button', { name: /Not sorted/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Stock' }), 'pea')
    expect(screen.getByText('Peas')).toBeInTheDocument()
    expect(screen.queryByText('Rice')).toBeNull()
  })

  it('ungrouped, it shows one list with each Lot\'s Storage Place', async () => {
    setup()
    await screen.findByRole('list', { name: /^Garage Freezer/ })
    await userEvent.click(screen.getByRole('switch', { name: 'Group by Storage Place' }))
    const all = group(/^Stock Lots, 4 Stock Lots/)
    expect(within(all).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Minced beef'),
      expect.stringContaining('Feta'),
      expect.stringContaining('Peas'),
      expect.stringContaining('Rice'),
    ])
    expect(within(all).getByText('Not sorted')).toBeInTheDocument()
  })

  it('moves part of a Lot to the Freezer, saying the frozen Shelf Life starts', async () => {
    const api = setup()
    await screen.findByRole('list', { name: /^Garage Fridge/ })
    await userEvent.click(within(group(/^Garage Fridge/)).getByRole('button', { name: /Minced beef/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Minced beef' })
    await userEvent.click(within(sheet).getByRole('combobox', { name: /Storage Place/ }))
    await userEvent.click(screen.getByRole('option', { name: /Garage Freezer/ }))
    expect(within(sheet).getByText(/frozen Shelf Life, from today/)).toBeInTheDocument()
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'How much to move' }), '400')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/stock/lots/11/move')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/stock/lots/11/move')[0]?.body).toEqual({ storagePlaceId: 2, quantity: 400 })
    expect(await screen.findByText('minced beef moved to Garage Freezer')).toBeInTheDocument()
  })

  it('refuses to move more than the Lot holds', async () => {
    const api = setup()
    await screen.findByRole('list', { name: /^Garage Fridge/ })
    await userEvent.click(within(group(/^Garage Fridge/)).getByRole('button', { name: /Minced beef/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Minced beef' })
    await userEvent.click(within(sheet).getByRole('combobox', { name: /Storage Place/ }))
    await userEvent.click(screen.getByRole('option', { name: /Kitchen Pantry/ }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'How much to move' }), '1500')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Move' }))
    expect(within(sheet).getByText('That is more than this Stock Lot holds')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/stock/lots/11/move')).toHaveLength(0)
  })

  it('remembers "By Ingredient" on this device', async () => {
    setup()
    await screen.findByRole('list', { name: /^Garage Freezer/ })
    await userEvent.click(within(screen.getByRole('group', { name: 'List' })).getByRole('button', { name: /By Ingredient/ }))
    expect(localStorage.getItem(PANTRY_MODE_KEY)).toBe('ingredients')
    expect(screen.queryByRole('group', { name: 'Kinds' })).toBeNull()
  })
})
