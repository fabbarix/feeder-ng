// B9-29 (the Pantry, beta.9): SSP-03 group headings, SSP-05 rows, SSP-10 Put away, SSP-17 Keep, SAFE-09 Throw out with Undo, DS-03, TB-11.
// Driven through the real hooks over a stubbed fetch (mockApi), so the wiring is what is tested. Today is Mon 9 Nov 2026 (the Lots' answer).
// Behaviour pinned (the developer chooses the markup, these are the contracts):
//   SSP-03  each Storage Place group is `section.list-group-section` with an h2 (`.list-group__name` = the place), a count chip
//           (`.list-group__count`: "1" plus visually hidden "1 Stock Lot"), the list `aria-labelledby` the h2 (no aria-label); Not sorted
//           last; rows have no chevron. Only Not sorted has an action, "Put away". A group that holds only frozen Leftovers counts them
//           ("2 Leftovers"). The ungrouped list (Group by Storage Place off) keeps its own aria-label "Stock Lots, N Stock Lots".
//   SSP-10  "Put away" opens PutAwaySheet over the Not sorted Lots; the Move posts ONE request to /api/stock/lots/put-away; the last Lot
//           leaving toasts "Every Stock Lot is put away".
//   SAFE-09 Throw out acts at once and toasts "500 g Flour thrown out" (quantity, Ingredient capitalised) with Undo, whose aria name is
//           "Undo: 500 g Flour thrown out"; Undo posts to /api/stock/waste/{id}/undo with the id the throw-out answered with.
//   SSP-17  Keep acts at once (POST .../keep, no body) and toasts "Flour kept", subline "Good until today", buttons Change and Undo; Undo
//           puts the Lot's old go-off date back (PATCH {goesOff}); Change opens "Flour: good until?" and Keep until <day> posts {goodUntil}.
//   DS-03   Stock-take is `iconOnly="narrow"`; the view row is FilterBarViewRow (the Sort turns icon-only, named "Sort: <value>", when
//           its value does not fit, and never wraps).
//   TB-11   /pantry?lot=<id> opens that Lot's sheet on arrival; an unknown id opens nothing.
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { mockApi, pickOption, renderWithProviders } from '../../settings/test-utils'
import { PANTRY_MODE_KEY } from '../hooks/usePantryFilters'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

const sortFits = vi.hoisted(() => ({ fits: true }))
vi.mock('../../../ui/FilterBar/useSortFits', async (orig) => ({ ...(await orig<typeof import('../../../ui/FilterBar/useSortFits')>()), useSortFits: () => ({ fits: sortFits.fits }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [{ id: 7, name: 'minced beef', baseUnit: 'g' }], isLoading: false }) }))

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'Kitchen Fridge', kind: 'fridge', default: false },
]
const lots = [
  makeLot({ id: 11, ingredientId: 7, ingredientName: 'minced beef', quantity: 1000, goesOff: '2026-11-12', spoiled: false, useSoon: true, storagePlaceId: 3 }),
  makeLot({ id: 12, ingredientId: 8, ingredientName: 'peas', quantity: 900, goesOff: '2027-02-01', spoiled: false, storagePlaceId: 2 }),
  makeLot({ id: 13, ingredientId: 9, ingredientName: 'rice', quantity: 2000, goesOff: null, spoiled: false, storagePlaceId: 1 }),
  makeLot({ id: 14, ingredientId: 10, ingredientName: 'feta', quantity: 300, goesOff: '2026-11-13', spoiled: false, storagePlaceId: null }),
  makeLot({ id: 15, ingredientId: 11, ingredientName: 'chicken', quantity: 650, goesOff: null, spoiled: false, storagePlaceId: null }),
]
const flour = makeLot({ id: 31, ingredientId: 20, ingredientName: 'flour', quantity: 500, goesOff: '2026-10-03', spoiled: true, storagePlaceId: 1 })

function setup(route = '/pantry', extra: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /api/stock': { ingredients: lots.map((l) => makeTotal({ ingredientId: l.ingredientId, name: l.ingredientName, total: l.quantity, lotCount: 1 })) },
    'GET /api/stock/lots': { lots, today: '2026-11-09' },
    'GET /api/stock/spoiled': { lots: [flour], today: '2026-11-09' },
    'GET /api/storage-places': places,
    'GET /api/plan/leftovers': { leftovers: [] },
    'POST /api/stock/lots/31/throw-out': { id: 90, ingredientId: 20, quantity: 500, wastedOn: '2026-11-09', reason: 'spoiled', lotId: 31 },
    'POST /api/stock/waste/90/undo': flour,
    'POST /api/stock/lots/31/keep': { ...flour, goesOff: '2026-11-09', spoiled: false },
    'PATCH /api/stock/lots/31': flour,
    'POST /api/stock/lots/put-away': { lots: [], skipped: [] },
    ...extra,
  } as Parameters<typeof mockApi>[0])
  renderWithProviders(<StockScreen />, route)
  return api
}

beforeEach(() => {
  sortFits.fits = true
  try {
    localStorage.removeItem(PANTRY_MODE_KEY)
  } catch {
    // no storage here
  }
})
afterEach(() => vi.unstubAllGlobals())

const headings = () => screen.queryAllByRole('heading', { level: 2 }).filter((h) => h.classList.contains('list-group__title'))
const section = (name: string) => headings().find((h) => h.querySelector('.list-group__name')?.textContent === name)!.closest('section') as HTMLElement

describe('SSP-03: every Storage Place group has a visible title', () => {
  it('has one h2 per group with the place and its count, Not sorted last, and each list named by its heading', async () => {
    setup()
    await screen.findByText('Minced beef')
    expect(headings().map((h) => h.querySelector('.list-group__name')?.textContent)).toEqual(['Garage Freezer', 'Kitchen Fridge', 'Kitchen Pantry', 'Not sorted'])
    const notSorted = headings()[3]!
    expect(notSorted.querySelector('.list-group__count')?.firstChild?.textContent).toBe('2')
    expect(notSorted.querySelector('.list-group__count .visually-hidden')).toHaveTextContent('2 Stock Lots')
    const list = within(section('Not sorted')).getByRole('list')
    expect(list).not.toHaveAttribute('aria-label')
    expect(list).toHaveAttribute('aria-labelledby', notSorted.id)
  })
  it('no group is named only for assistive technology: no list inside a group section has an aria-label', async () => {
    setup()
    await screen.findByText('Minced beef')
    expect(document.querySelectorAll('section.list-group-section ul[aria-label]')).toHaveLength(0)
  })
  it('each heading carries its kind icon (decorative)', async () => {
    setup()
    await screen.findByText('Minced beef')
    for (const h of headings()) expect(h.querySelector('.list-group__icon svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('the Lot rows have no chevron', async () => {
    setup()
    await screen.findByText('Minced beef')
    expect(document.querySelectorAll('section.list-group-section .list-row__chevron')).toHaveLength(0)
  })
  it('a Lot row has its quantity in the value column and its status alone in the meta (SSP-05)', async () => {
    setup()
    await screen.findByText('Minced beef')
    const row = within(section('Kitchen Fridge')).getByRole('button', { name: /Minced beef/ }).closest('li')!
    expect(row.querySelector('.list-row__value')).toHaveTextContent(/^1 kg$/)
    expect(row.querySelector('.list-row__meta')).toHaveTextContent(/^Good until Thu$/)
  })
  it('grouping off keeps one untitled list with its aria-label', async () => {
    setup('/pantry?group=off')
    expect(await screen.findByRole('list', { name: /^Stock Lots, 5 Stock Lots/ })).toBeInTheDocument()
    expect(headings()).toHaveLength(0)
  })
})

describe('SSP-10: Put away the Not sorted Stock Lots', () => {
  it('only the Not sorted heading has the action, named "Put away"', async () => {
    setup()
    await screen.findByText('Minced beef')
    expect(within(section('Not sorted')).getByRole('button', { name: 'Put away' })).toBeInTheDocument()
    expect(within(section('Kitchen Fridge')).queryByRole('button', { name: 'Put away' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Put away' })).toHaveLength(1)
  })
  it('moves the ticked Lots in one request, and says so when the last one is gone', async () => {
    const api = setup('/pantry', { 'POST /api/stock/lots/put-away': { lots: [makeLot({ id: 14, storagePlaceId: 3 }), makeLot({ id: 15, storagePlaceId: 3 })], skipped: [] } })
    await screen.findByText('Minced beef')
    await userEvent.click(within(section('Not sorted')).getByRole('button', { name: 'Put away' }))
    const sheet = await screen.findByRole('dialog', { name: 'Put away 2 Stock Lots' })
    await pickOption('Put into', /Kitchen Fridge/, within(sheet))
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Feta' }))
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Chicken' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Move 2 to Kitchen Fridge' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/stock/lots/put-away')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/stock/lots/put-away')[0]?.body).toEqual({
      moves: [
        { lotId: 14, storagePlaceId: 3 },
        { lotId: 15, storagePlaceId: 3 },
      ],
    })
    expect(await findToast('Every Stock Lot is put away')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Put away/ })).toBeNull())
  })
})

describe('SAFE-09: Throw out acts at once and can be undone', () => {
  it('toasts "500 g Flour thrown out" with Undo and posts the throw-out', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Throw out flour' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/stock/lots/31/throw-out')).toHaveLength(1))
    const toast = await findToast('500 g Flour thrown out')
    expect(within(toast).getByRole('button', { name: 'Undo: 500 g Flour thrown out' })).toBeInTheDocument()
    expect(toast.querySelector('.toast__title svg')).toBeNull()
  })
  it('Undo posts to the waste record the throw-out answered with, once', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Throw out flour' }))
    const toast = await findToast('500 g Flour thrown out')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo: 500 g Flour thrown out' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/stock/waste/90/undo')).toHaveLength(1))
  })
  it('a refused Undo says "Nothing was undone" with the reason', async () => {
    setup('/pantry', { 'POST /api/stock/waste/90/undo': { status: 409, json: { error: { code: 'undo_window_over', message: 'too late' } } } })
    await userEvent.click(await screen.findByRole('button', { name: 'Throw out flour' }))
    const toast = await findToast('500 g Flour thrown out')
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo: 500 g Flour thrown out' }))
    expect(await findToast('Nothing was undone')).toHaveTextContent('It is too late to undo it.')
  })
  it('a failed throw-out shows the error toast and no Undo', async () => {
    setup('/pantry', { 'POST /api/stock/lots/31/throw-out': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    await userEvent.click(await screen.findByRole('button', { name: 'Throw out flour' }))
    expect(await findToast('That did not save. Try again.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull()
  })
})

describe('SSP-17: Keep makes the Lot Good until today, with Change and Undo', () => {
  it('posts the keep with no date and toasts "Flour kept", "Good until today", Change and Undo', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep flour' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/stock/lots/31/keep')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/stock/lots/31/keep')[0]?.body).toBeUndefined()
    const toast = await findToast('Flour kept')
    expect(toast.querySelector('.toast__subline')).toHaveTextContent('Good until today')
    expect(within(toast).getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: /^Undo/ })).toBeInTheDocument()
    expect(toast.querySelector('.toast__title svg')).toBeNull()
  })
  it('Undo puts the old go-off date back', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep flour' }))
    const toast = await findToast('Flour kept')
    await userEvent.click(within(toast).getByRole('button', { name: /^Undo/ }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/stock/lots/31')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/stock/lots/31')[0]?.body).toEqual({ goesOff: '2026-10-03' })
  })
  it('Change opens "Flour: good until?" and Keep until posts the chosen date', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Keep flour' }))
    const toast = await findToast('Flour kept')
    await userEvent.click(within(toast).getByRole('button', { name: 'Change' }))
    const sheet = await screen.findByRole('dialog', { name: 'Flour: good until?' })
    await userEvent.click(within(sheet).getByRole('radio', { name: /In 3 days/ }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Keep until Thu 12 Nov' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/stock/lots/31/keep')).toHaveLength(2))
    expect(api.callsTo('POST', '/api/stock/lots/31/keep')[1]?.body).toEqual({ goodUntil: '2026-11-12' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Flour: good until?' })).toBeNull())
  })
})

describe('DS-03: the header at 375 px', () => {
  it('Stock-take is icon-only in the narrow band and keeps its name', async () => {
    setup()
    await screen.findByText('Minced beef')
    expect(screen.getByRole('button', { name: 'Stock-take' })).toHaveAttribute('data-icon-only', 'narrow')
  })
  it('the view row is the shared FilterBarViewRow: the Sort shows its value when it fits', async () => {
    setup()
    await screen.findByText('Minced beef')
    const row = document.querySelector('.filter-bar__view-row')!
    expect(row.querySelector(':scope > .filter-bar__sort-measure')).not.toBeNull()
    const sort = within(row as HTMLElement).getByRole('combobox', { name: 'Sort' })
    expect(sort).toHaveTextContent('Good until')
    expect(sort).not.toHaveAttribute('data-icon-only')
  })
  it('and turns icon-only, named "Sort: Good until", when it does not fit; it is still a combobox that lists the sorts', async () => {
    sortFits.fits = false
    setup()
    await screen.findByText('Minced beef')
    const sort = screen.getByRole('combobox', { name: 'Sort: Good until' })
    expect(sort).toHaveAttribute('data-icon-only', 'true')
    await userEvent.click(sort)
    expect(await screen.findAllByRole('option')).not.toHaveLength(0)
  })
})

describe('TB-11: ?lot=<id> opens that Lot', () => {
  it('opens the Lot sheet of the Lot on arrival', async () => {
    setup('/pantry?lot=11')
    expect(await screen.findByRole('dialog', { name: 'Minced beef' })).toBeInTheDocument()
  })
  it('an id that is not a Lot opens nothing, and the Pantry still shows', async () => {
    setup('/pantry?lot=999')
    await screen.findByText('Minced beef')
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: 'Minced beef' })).toBeNull()
  })
})
