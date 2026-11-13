// Supplies in the Pantry (household-items.md 4.2, 4.6, 6, D6, D7; H6): the mocks are the JSON of H2 and H4 field for field.
// Supplies show beside food by default; the Filters panel narrows them; a Supply row has no Good until; the Lot sheet has Used up.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { OPEN_INGREDIENTS_KEY } from '../hooks/useOpenIngredients'
import { PANTRY_MODE_KEY } from '../hooks/usePantryFilters'
import { makeIngredientJson, makeLot, makeSupplyJson, makeSupplyLot, makeSupplyTotal, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 4, name: 'Utility cupboard', kind: 'pantry', default: false },
]
const rice = makeLot({ id: 21, ingredientId: 9, ingredientName: 'rice', quantity: 2000, goesOff: null, spoiled: false, useSoon: false, storagePlaceId: 1, kind: 'food' })
const feta = makeLot({ id: 22, ingredientId: 10, ingredientName: 'feta', quantity: 200, goesOff: '2026-11-12', spoiled: false, useSoon: true, storagePlaceId: 1, kind: 'food' })
const paper = makeSupplyLot({ id: 31, ingredientId: 40, ingredientName: 'toilet paper', quantity: 4, storagePlaceId: 4 })
const soap = makeSupplyLot({ id: 32, ingredientId: 41, ingredientName: 'dish soap', baseUnit: 'ml', quantity: 1500, storagePlaceId: 4 })
const lots = [rice, feta, paper, soap]
const totals = [
  makeTotal({ ingredientId: 9, name: 'rice', total: 2000, lotCount: 1, nextGoesOff: null, kind: 'food' }),
  makeTotal({ ingredientId: 10, name: 'feta', total: 200, lotCount: 1, nextGoesOff: '2026-11-12', useSoon: true, kind: 'food' }),
  makeSupplyTotal({ ingredientId: 40, name: 'toilet paper', total: 4, lotCount: 1 }),
  makeSupplyTotal({ ingredientId: 41, name: 'dish soap', baseUnit: 'ml', total: 1500, lotCount: 1 }),
]
const ingredients = [
  makeIngredientJson({ id: 9, name: 'rice', shelfLifeDays: null }),
  makeIngredientJson({ id: 10, name: 'feta' }),
  makeSupplyJson({ id: 40, name: 'toilet paper', restockLevel: 6 }),
  makeSupplyJson({ id: 41, name: 'dish soap', baseUnit: 'ml', restockLevel: 1000 }),
]

function setup(url = '/pantry', data: { lots?: unknown[]; totals?: unknown[]; ingredients?: unknown[] } = {}) {
  const api = mockApi({
    'GET /api/stock': { ingredients: data.totals ?? totals },
    'GET /api/stock/lots': { lots: data.lots ?? lots, today: '2026-11-12' },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-12' },
    'GET /api/storage-places': places,
    'GET /api/ingredients': data.ingredients ?? ingredients,
    'DELETE /api/stock/lots/31': { status: 204 },
    'PATCH /api/stock/lots/31': { json: { ...paper, quantity: 3 } },
    'PATCH /api/stock/lots/32': { json: { ...soap, quantity: 1000 } },
  } as never)
  renderWithProviders(<StockScreen />, url)
  return api
}

beforeEach(() => {
  localStorage.removeItem(PANTRY_MODE_KEY)
  sessionStorage.removeItem(OPEN_INGREDIENTS_KEY)
})
afterEach(() => vi.unstubAllGlobals())

const groupNamed = (name: RegExp) => screen.findByRole('list', { name })
const openFilters = () => userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
const panel = () => screen.getByRole('dialog', { name: 'Filters' })
const rowOf = (name: RegExp) => screen.getByRole('button', { name }).closest('li') as HTMLElement

describe('the Pantry by default (D6): Supplies beside food', () => {
  it('a Supply Lot shows in its Storage Place group with the food in the others', async () => {
    setup()
    const utility = await groupNamed(/^Utility cupboard, 2 Stock Lots/)
    expect(within(utility).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Dish soap'), expect.stringContaining('Toilet paper')])
    expect(within(await groupNamed(/^Kitchen Pantry, 2 Stock Lots/)).getByText('Rice')).toBeInTheDocument()
  })
  it('a Supply row says its quantity and Restock level: "4 pieces · below Restock level 6" and "1500 ml · restocks below 1000 ml"', async () => {
    setup()
    await groupNamed(/^Utility cupboard/)
    await waitFor(() => expect(rowOf(/Toilet paper/)).toHaveTextContent('4 pieces · below Restock level 6'))
    expect(rowOf(/Dish soap/)).toHaveTextContent('1500 ml · restocks below 1000 ml')
  })
  it('a Supply below its Restock level is marked info, not spoil; the other is not marked', async () => {
    setup()
    await groupNamed(/^Utility cupboard/)
    await waitFor(() => expect(rowOf(/Toilet paper/)).toHaveTextContent('below Restock level'))
    expect(rowOf(/Toilet paper/).querySelector('.list-row__meta')).toHaveAttribute('data-status', 'info')
    expect(rowOf(/Dish soap/).querySelector('.list-row__meta')).not.toHaveAttribute('data-status')
  })
  it('a Supply row has no Good until, "No go-off date", Use soon or Spoiled tone; the food rows keep theirs', async () => {
    setup()
    const utility = await groupNamed(/^Utility cupboard/)
    expect(utility).not.toHaveTextContent(/good until|go-off|went off|use soon|spoiled/i)
    for (const meta of utility.querySelectorAll('.list-row__meta')) expect(['spoil', 'danger']).not.toContain(meta.getAttribute('data-status'))
    expect(rowOf(/Feta/)).toHaveTextContent('Good until today')
    expect(rowOf(/Feta/).querySelector('.list-row__meta')).toHaveAttribute('data-status', 'spoil')
  })
  it('a Supply with no Restock level shows its quantity alone', async () => {
    setup('/pantry', { ingredients: [makeSupplyJson({ id: 40, name: 'toilet paper', restockLevel: null }), makeSupplyJson({ id: 41, name: 'dish soap', baseUnit: 'ml', restockLevel: null })] })
    await groupNamed(/^Utility cupboard/)
    expect(rowOf(/Toilet paper/).querySelector('.list-row__meta')).toHaveTextContent(/^4 pieces$/)
  })
})

describe('the Food or Supplies filter', () => {
  it('is in the Filters panel with Food and Supplies, apart from Kind', async () => {
    stubViewportWidth(1024)
    setup()
    await groupNamed(/^Utility cupboard/)
    await openFilters()
    const dialog = panel()
    await waitFor(() => expect(within(dialog).getByRole('group', { name: 'Food or Supplies' })).toBeInTheDocument())
    expect(within(within(dialog).getByRole('group', { name: 'Food or Supplies' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Food', 'Supplies'])
    expect(within(within(dialog).getByRole('group', { name: 'Filter by kind' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pantry', 'Fridge', 'Freezer'])
  })
  it('Supplies narrows both lists to the Supplies, with a removable chip and the count in Filters', async () => {
    stubViewportWidth(1024)
    setup()
    await groupNamed(/^Utility cupboard/)
    await openFilters()
    await userEvent.click(await within(panel()).findByRole('button', { name: 'Supplies' }))
    await waitFor(() => expect(screen.queryByText('Rice')).toBeNull())
    expect(screen.queryByText('Feta')).toBeNull()
    expect(screen.getByText('Toilet paper')).toBeInTheDocument()
    expect(screen.getByText('Dish soap')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
    const chips = screen.getByRole('group', { name: 'Active filters' })
    expect(within(chips).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Remove Supplies'])
  })
  it('?stock=food hides the Supplies; ?stock=supply hides the food', async () => {
    setup('/pantry?stock=food')
    await groupNamed(/^Kitchen Pantry/)
    expect(screen.queryByText('Toilet paper')).toBeNull()
    expect(screen.getByText('Rice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Food' })).toBeInTheDocument()
  })
  it('removing the chip shows both again', async () => {
    setup('/pantry?stock=supply')
    await groupNamed(/^Utility cupboard/)
    expect(screen.queryByText('Rice')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Supplies' }))
    expect(await screen.findByText('Rice')).toBeInTheDocument()
    expect(screen.getByText('Toilet paper')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })
  it('Use soon never matches a Supply; Spoiled neither', async () => {
    setup('/pantry?status=useSoon')
    await groupNamed(/^Kitchen Pantry/)
    expect(screen.getByText('Feta')).toBeInTheDocument()
    expect(screen.queryByText('Toilet paper')).toBeNull()
    expect(screen.queryByText('Dish soap')).toBeNull()
  })
  it('Supplies with Use soon on leaves nothing in Stock that matches', async () => {
    setup('/pantry?stock=supply&status=useSoon')
    expect(await screen.findByText('Nothing in Stock matches')).toBeInTheDocument()
  })
  it('the section is not in the panel while the Household has no Supply', async () => {
    stubViewportWidth(1024)
    setup('/pantry', { lots: [rice, feta], totals: totals.slice(0, 2), ingredients: ingredients.slice(0, 2) })
    await groupNamed(/^Kitchen Pantry/)
    await openFilters()
    expect(within(panel()).queryByRole('group', { name: 'Food or Supplies' })).toBeNull()
  })
  it('applies By Ingredient too, where a Supply row has its total and Restock meta and no go-off phrase', async () => {
    localStorage.setItem(PANTRY_MODE_KEY, 'ingredients')
    setup('/pantry?stock=supply')
    const row = await screen.findByRole('button', { name: 'Toilet paper, 1 Stock Lot' })
    expect(screen.queryByRole('button', { name: /^Rice/ })).toBeNull()
    const li = row.closest('li') as HTMLElement
    await waitFor(() => expect(li).toHaveTextContent('1 Stock Lot · below Restock level 6'))
    expect(li).toHaveTextContent('4 pieces')
    expect(li).not.toHaveTextContent(/good until|go-off|use soon/i)
  })
})

describe('the Lot sheet of a Supply: Used up', () => {
  async function openPaper() {
    const api = setup()
    await groupNamed(/^Utility cupboard/)
    await userEvent.click(screen.getByRole('button', { name: /Toilet paper/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Toilet paper' })
    return { api, sheet }
  }
  it('has no Good until and offers Used up', async () => {
    const { sheet } = await openPaper()
    expect(sheet).not.toHaveTextContent(/good until|go-off|went off/i)
    expect(within(sheet).getByRole('button', { name: 'Used up' })).toBeInTheDocument()
  })
  it('the whole Lot: DELETE /api/stock/lots/31, a toast, the sheet closes; no waste is recorded', async () => {
    const { api, sheet } = await openPaper()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Used up' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/stock/lots/31')).toHaveLength(1))
    expect(await screen.findByText('Toilet paper used up')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Toilet paper' })).toBeNull()
    expect(api.calls.filter((c) => /throw-out|keep|waste/.test(c.path))).toEqual([])
    expect(api.calls.filter((c) => c.method === 'PATCH')).toEqual([])
  })
  it('part of it: PATCH /api/stock/lots/31 with the quantity that remains and nothing else', async () => {
    const { api, sheet } = await openPaper()
    await userEvent.type(within(sheet).getByLabelText('How much was used up'), '1')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Used up' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/stock/lots/31')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/stock/lots/31')[0]!.body).toEqual({ quantity: 3 })
    expect(api.callsTo('DELETE', '/api/stock/lots/31')).toHaveLength(0)
    expect(api.calls.filter((c) => /throw-out|keep|waste/.test(c.path))).toEqual([])
    expect(await screen.findByText('Toilet paper used up')).toBeInTheDocument()
  })
  it('more than the Lot holds sends nothing', async () => {
    const { api, sheet } = await openPaper()
    await userEvent.type(within(sheet).getByLabelText('How much was used up'), '5')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Used up' }))
    expect(await within(sheet).findByText('That is more than this Stock Lot holds')).toBeInTheDocument()
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })
  it('a failed Used up shows the error toast and leaves the Lot', async () => {
    const api = mockApi({
      'GET /api/stock': { ingredients: totals },
      'GET /api/stock/lots': { lots, today: '2026-11-12' },
      'GET /api/stock/spoiled': { lots: [], today: '2026-11-12' },
      'GET /api/storage-places': places,
      'GET /api/ingredients': ingredients,
      'DELETE /api/stock/lots/31': { status: 500, json: { error: { code: 'boom', message: 'boom' } } },
    } as never)
    renderWithProviders(<StockScreen />, '/pantry')
    await groupNamed(/^Utility cupboard/)
    await userEvent.click(screen.getByRole('button', { name: /Toilet paper/ }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Toilet paper' })).getByRole('button', { name: 'Used up' }))
    expect(await screen.findByText('That did not save. Try again.')).toBeInTheDocument()
    expect(api.callsTo('DELETE', '/api/stock/lots/31')).toHaveLength(1)
  })
  it('a food Lot has no Used up', async () => {
    setup()
    await groupNamed(/^Kitchen Pantry/)
    await userEvent.click(screen.getByRole('button', { name: /Rice/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Rice' })
    expect(within(sheet).queryByRole('button', { name: 'Used up' })).toBeNull()
  })
  it('Edit opens a sheet with no Good until', async () => {
    const { sheet } = await openPaper()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Edit' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit Toilet paper' })
    expect(within(edit).queryByText('Good until')).toBeNull()
    expect(within(edit).queryByRole('switch')).toBeNull()
  })
})

describe('Add to Stock', () => {
  it('lists the Ingredients and the Supplies under their subheaders; a Supply shows no Good until or Shelf Life', async () => {
    setup()
    await groupNamed(/^Utility cupboard/)
    await userEvent.click(screen.getByRole('button', { name: 'Add to Stock' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a Stock Lot' })
    await waitFor(() => expect(within(sheet).getByRole('combobox', { name: 'Ingredient' })).toBeEnabled())
    await userEvent.click(within(sheet).getByRole('combobox', { name: 'Ingredient' }))
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getAllByRole('group').map((g) => g.querySelector('.select__group-title')?.textContent)).toEqual(['Ingredients', 'Supplies'])
    await userEvent.click(within(listbox).getByRole('option', { name: /toilet paper/ }))
    expect(within(sheet).queryByText(/good until|shelf life/i)).toBeNull()
    await userEvent.type(within(sheet).getByLabelText('Quantity'), '9')
  })
})
