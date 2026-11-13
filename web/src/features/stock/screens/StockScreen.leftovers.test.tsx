// B5-LOW wiring (U4, ADR 0012): frozen Leftovers sit in their Freezer on the Pantry, with a Leftovers filter; Take out makes one
// a normal Leftover and lists the Planned Meals it replans.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { friLunch, frozenChilli, leftover } from '../../../lib/leftovers/fixtures'
import type { Leftover } from '../../../lib/leftovers'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { makeLot, makeTotal } from '../testData'
import { PANTRY_MODE_KEY } from '../hooks/usePantry'
import { StockScreen } from './StockScreen'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
]
const lots = [
  makeLot({ id: 12, ingredientId: 8, ingredientName: 'peas', quantity: 900, goesOff: '2027-02-01', spoiled: false, storagePlaceId: 2 }),
  makeLot({ id: 13, ingredientId: 9, ingredientName: 'rice', quantity: 2000, goesOff: null, spoiled: false, storagePlaceId: 1 }),
]
// Today on the Pantry is 2026-11-11 (the Lots answer). Chilli is frozen in Garage Freezer; Stew's Freezer was deleted (place 99);
// Soup is an ordinary Leftover and is not Stock.
const chilli = frozenChilli({ id: 5, recipeId: 10, portions: 3, storagePlaceId: 2, storagePlaceName: 'Garage Freezer', useBy: '2027-02-10' })
const stew = frozenChilli({ id: 6, recipeId: 12, recipeName: 'Stew', portions: 2, storagePlaceId: 99, storagePlaceName: null, useBy: '2027-01-05' })
const soup = leftover({ id: 4, recipeId: 11, recipeName: 'Soup', portions: 2, useBy: '2026-11-14' })

let current: Leftover[] = []
function setup(extra: Record<string, unknown> = {}, leftovers: Leftover[] = [chilli, stew, soup]) {
  current = leftovers
  const api = mockApi({
    'GET /api/stock': { ingredients: lots.map((l) => makeTotal({ ingredientId: l.ingredientId, name: l.ingredientName, total: l.quantity, lotCount: 1 })) },
    'GET /api/stock/lots': { lots, today: '2026-11-11' },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-11' },
    'GET /api/storage-places': places,
    'GET /api/plan/leftovers': () => ({ leftovers: current }),
    'GET /api/household/settings': { frozenUseByDays: 90, defaultLeftoverUseByDays: 3 },
    'GET /api/recipes/10': { id: 10, frozenUseByDays: null, leftoverUseByDays: null },
    ...extra,
  } as Parameters<typeof mockApi>[0])
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

describe('Pantry: frozen Leftovers', () => {
  it('shows a frozen Leftover inside its Freezer, with its portions and Use-by', async () => {
    setup()
    const freezer = await waitFor(() => group(/^Garage Freezer/))
    expect(await within(freezer).findByText('Chilli')).toBeInTheDocument()
    expect(within(freezer).getByText('3 portions · Use by 10 Feb')).toBeInTheDocument()
    expect(within(freezer).getByText('Peas')).toBeInTheDocument() // its Stock Lots stay in the same group
    expect(within(group(/^Kitchen Pantry/)).queryByText('Chilli')).toBeNull()
  })

  it('puts a frozen Leftover whose Freezer was deleted under Not sorted', async () => {
    setup()
    const unsorted = await waitFor(() => group(/^Not sorted/))
    expect(await within(unsorted).findByText('Stew')).toBeInTheDocument()
  })

  it('does not list a Leftover that is not frozen: it is not Stock', async () => {
    setup()
    await screen.findByText('Chilli')
    expect(screen.queryByText('Soup')).toBeNull()
  })

  it('has a Leftovers filter that shows only the Leftovers, and goes back', async () => {
    setup()
    await screen.findByText('Chilli')
    const chip = screen.getByRole('button', { name: 'Leftovers' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Chilli')).toBeInTheDocument()
    expect(screen.getByText('Stew')).toBeInTheDocument()
    expect(screen.queryByText('Peas')).toBeNull()
    expect(screen.queryByText('Rice')).toBeNull()
    await userEvent.click(chip)
    expect(screen.getByText('Peas')).toBeInTheDocument()
    expect(screen.getByText('Rice')).toBeInTheDocument()
  })

  it('the Storage Place, kind and search filters apply to Leftovers too', async () => {
    setup()
    await screen.findByText('Chilli')
    await userEvent.click(within(screen.getByRole('group', { name: 'Kinds' })).getByRole('button', { name: /Fridge/ }))
    expect(screen.queryByText('Chilli')).toBeNull()
    await userEvent.click(within(screen.getByRole('group', { name: 'Kinds' })).getByRole('button', { name: /Fridge/ }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Kinds' })).getByRole('button', { name: /Freezer/ }))
    expect(screen.getByText('Chilli')).toBeInTheDocument()
    expect(screen.queryByText('Rice')).toBeNull()
    await userEvent.click(within(screen.getByRole('group', { name: 'Kinds' })).getByRole('button', { name: /Freezer/ }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Stock' }), 'stew')
    expect(screen.getByText('Stew')).toBeInTheDocument()
    expect(screen.queryByText('Chilli')).toBeNull()
  })

  it('ungrouped, a Leftover is one more row with its Storage Place', async () => {
    setup()
    await screen.findByText('Chilli')
    await userEvent.click(screen.getByRole('switch', { name: 'Group by Storage Place' }))
    const row = screen.getByText('Chilli').closest('li') as HTMLElement
    expect(row).toHaveTextContent('3 portions · Use by 10 Feb · Garage Freezer')
  })

  it('By Ingredient never lists Leftovers', async () => {
    setup()
    await screen.findByText('Chilli')
    await userEvent.click(within(screen.getByRole('group', { name: 'List' })).getByRole('button', { name: /By Ingredient/ }))
    expect(await screen.findByText('Peas')).toBeInTheDocument()
    expect(screen.queryByText('Chilli')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Leftovers' })).toBeNull()
  })

  it('with no Leftover at all the Pantry looks as before, without a Leftovers filter', async () => {
    setup({}, [soup])
    await screen.findByText('Peas')
    expect(screen.queryByRole('button', { name: 'Leftovers' })).toBeNull()
  })

  it('a Leftover in a Freezer with no Stock Lot still gets its Freezer group', async () => {
    setup({ 'GET /api/storage-places': [...places, { id: 4, name: 'Basement Freezer', kind: 'freezer', default: false }] }, [
      frozenChilli({ id: 7, recipeName: 'Lasagne', storagePlaceId: 4, storagePlaceName: 'Basement Freezer' }),
    ])
    const basement = await waitFor(() => group(/^Basement Freezer/))
    expect(await within(basement).findByText('Lasagne')).toBeInTheDocument()
  })
})

describe('Pantry: the Leftover row menu', () => {
  it('offers Had it, Threw it out and Take out (Freeze it is for a Leftover that is not frozen)', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Chilli' }))
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual(['Had it', 'Threw it out', 'Take out'])
  })

  it('Take out lists the Planned Meals it replans, then makes a normal Leftover that leaves the Pantry', async () => {
    const api = setup({
      'POST /api/plan/leftovers/5/take-out?dryRun=1': { replanned: [friLunch] },
      'POST /api/plan/leftovers/5/take-out': () => {
        current = [{ ...chilli, frozen: false, frozenOn: null, storagePlaceId: 1, storagePlaceName: 'Kitchen Pantry', useBy: '2026-11-14' }, stew, soup]
        return { leftover: current[0], replanned: [friLunch] }
      },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Chilli' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Take out' }))
    const sheet = await screen.findByRole('dialog', { name: 'Take Chilli out of the freezer?' })
    expect(await within(sheet).findByText('Fri Lunch was going to have it; it is planned again.')).toBeInTheDocument()
    expect(within(sheet).getByText('Use by Sat once out (3 days)')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/leftovers/5/take-out')).toHaveLength(0)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Take out' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/5/take-out')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/plan/leftovers/5/take-out')[0]?.body).toEqual({ storagePlaceId: 1 })
    expect(await screen.findByText('Chilli is out of the freezer. Use by Sat.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Chilli')).toBeNull())
    expect(screen.getByText('Stew')).toBeInTheDocument()
  })

  it('Take out into Not sorted sends null', async () => {
    const api = setup({
      'POST /api/plan/leftovers/5/take-out?dryRun=1': { replanned: [] },
      'POST /api/plan/leftovers/5/take-out': { leftover: { ...chilli, frozen: false }, replanned: [] },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Chilli' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Take out' }))
    const sheet = await screen.findByRole('dialog', { name: 'Take Chilli out of the freezer?' })
    await userEvent.click(within(sheet).getByRole('combobox', { name: 'Storage Place' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Not sorted' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Take out' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/5/take-out')[0]?.body).toEqual({ storagePlaceId: null }))
  })

  it('Threw it out from the Pantry posts the portions and refreshes the list', async () => {
    const api = setup({
      'POST /api/plan/leftovers/6/threw-out?dryRun=1': { replanned: [] },
      'POST /api/plan/leftovers/6/threw-out': () => {
        current = [chilli, soup]
        return { leftover: { ...stew, portions: 0 }, replanned: [] }
      },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Stew' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Threw it out' }))
    const sheet = await screen.findByRole('dialog', { name: 'Throw out Stew?' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Threw it out' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/leftovers/6/threw-out')[0]?.body).toEqual({ portions: 2 }))
    await waitFor(() => expect(screen.queryByText('Stew')).toBeNull())
  })
})
