// Beta.5 ST: By Ingredient rows expand in place to the Ingredient's Lots; one Lot sheet for Edit, Delete and Move.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { OPEN_INGREDIENTS_KEY } from '../hooks/useOpenIngredients'
import { PANTRY_MODE_KEY } from '../hooks/usePantry'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
]
const lots = [
  makeLot({ id: 21, ingredientId: 7, ingredientName: 'chicken thighs', quantity: 800, purchased: '2026-11-09', goesOff: '2026-11-13', spoiled: false, storagePlaceId: 3, shelfLifeDays: 4 }),
  makeLot({ id: 22, ingredientId: 7, ingredientName: 'chicken thighs', quantity: 500, purchased: '2026-11-08', goesOff: '2026-11-11', spoiled: false, useSoon: true, storagePlaceId: 3, shelfLifeDays: 4 }),
  makeLot({ id: 23, ingredientId: 9, ingredientName: 'rice', quantity: 2000, purchased: '2026-11-01', goesOff: null, spoiled: false, storagePlaceId: 1, shelfLifeDays: null }),
]

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /api/stock': {
      ingredients: [
        makeTotal({ ingredientId: 7, name: 'chicken thighs', total: 1300, lotCount: 2, useSoon: true, nextGoesOff: '2026-11-11' }),
        makeTotal({ ingredientId: 9, name: 'rice', total: 2000, lotCount: 1, useSoon: false, nextGoesOff: null }),
      ],
    },
    'GET /api/stock/lots': { lots, today: '2026-11-10' },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-10' },
    'GET /api/storage-places': places,
    'PATCH /api/stock/lots/21': { json: { ...lots[0], quantity: 650 } },
    'DELETE /api/stock/lots/21': { status: 204 },
    ...extra,
  } as never)
  renderWithProviders(<StockScreen />, '/pantry')
  return api
}

beforeEach(() => {
  localStorage.setItem(PANTRY_MODE_KEY, 'ingredients')
  sessionStorage.removeItem(OPEN_INGREDIENTS_KEY)
})
afterEach(() => {
  localStorage.removeItem(PANTRY_MODE_KEY)
  vi.unstubAllGlobals()
})

const thighs = () => screen.findByRole('button', { name: 'Chicken thighs, 2 Stock Lots' })

describe('Pantry By Ingredient: Lots inline', () => {
  it('a row expands in place to its Lots in Deduction order and collapses again, without opening a sheet', async () => {
    setup()
    const row = await thighs()
    expect(row).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('dialog')).toBeNull()
    const list = screen.getByRole('list', { name: 'Chicken thighs Stock Lots' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('500 g'),
      expect.stringContaining('800 g'),
    ])
    expect(within(list).getByText('Bought 8 Nov · Good until tomorrow · Garage Fridge')).toBeInTheDocument()
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
  })

  it('remembers the open rows for the session only', async () => {
    setup()
    await userEvent.click(await thighs())
    expect(JSON.parse(sessionStorage.getItem(OPEN_INGREDIENTS_KEY) ?? '[]')).toContain(7)
    expect(localStorage.getItem(OPEN_INGREDIENTS_KEY)).toBeNull()
  })

  it('opens already expanded when the session remembers the row', async () => {
    sessionStorage.setItem(OPEN_INGREDIENTS_KEY, JSON.stringify([7]))
    setup()
    expect(await thighs()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('list', { name: 'Chicken thighs Stock Lots' })).toBeVisible()
  })

  it('tapping a Lot opens the Lot sheet with Edit, Delete and Move to', async () => {
    setup()
    await userEvent.click(await thighs())
    await userEvent.click(within(screen.getByRole('list', { name: 'Chicken thighs Stock Lots' })).getByRole('button', { name: '800 g' }))
    const sheet = await screen.findByRole('dialog', { name: 'Chicken thighs' })
    expect(within(sheet).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: 'Move to' })).toBeInTheDocument()
  })
})

async function openLot(quantity: string) {
  await userEvent.click(await thighs())
  await userEvent.click(within(screen.getByRole('list', { name: 'Chicken thighs Stock Lots' })).getByRole('button', { name: quantity }))
  return screen.findByRole('dialog', { name: 'Chicken thighs' })
}

describe('Pantry: Edit a Lot', () => {
  it('Edit opens the edit sheet in place of the Lot sheet; Save patches only what changed', async () => {
    const api = setup()
    const sheet = await openLot('800 g')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Edit' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit Chicken thighs' })
    expect(screen.queryByRole('dialog', { name: 'Chicken thighs' })).toBeNull()
    const input = within(edit).getByLabelText('Quantity')
    await userEvent.clear(input)
    await userEvent.type(input, '650')
    await userEvent.click(within(edit).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/stock/lots/21')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/stock/lots/21')[0]?.body).toEqual({ quantity: 650 })
    expect(await screen.findByText('chicken thighs saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Chicken thighs' })).toBeNull())
  })

  it('a refused edit shows the error toast and leaves the screen usable', async () => {
    const api = setup({ 'PATCH /api/stock/lots/21': { status: 422, json: { error: { code: 'validation_failed', message: 'quantity must be more than zero' } } } })
    const sheet = await openLot('800 g')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Edit' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit Chicken thighs' })
    const input = within(edit).getByLabelText('Quantity')
    await userEvent.clear(input)
    await userEvent.type(input, '650')
    await userEvent.click(within(edit).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/stock/lots/21')).toHaveLength(1))
    expect(await screen.findByText('That did not save. Try again.')).toBeInTheDocument()
  })
})

describe('Pantry: Delete a Lot', () => {
  it('asks in our own dialog, then deletes and says so', async () => {
    const api = setup()
    const confirm = vi.spyOn(window, 'confirm')
    const sheet = await openLot('800 g')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this Stock Lot?' })
    expect(api.callsTo('DELETE', '/api/stock/lots/21')).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/stock/lots/21')).toHaveLength(1))
    expect(await screen.findByText('chicken thighs removed from Stock')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('Cancel deletes nothing', async () => {
    const api = setup()
    const sheet = await openLot('800 g')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this Stock Lot?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api.callsTo('DELETE', '/api/stock/lots/21')).toHaveLength(0)
  })
})

describe('Pantry by Storage Place: the same Lot sheet', () => {
  it('has Edit and Delete there too', async () => {
    localStorage.removeItem(PANTRY_MODE_KEY)
    setup()
    const list = await screen.findByRole('list', { name: /^Garage Fridge/ })
    await userEvent.click(within(list).getAllByRole('button', { name: /Chicken thighs/ })[0]!)
    const sheet = await screen.findByRole('dialog', { name: 'Chicken thighs' })
    expect(within(sheet).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
