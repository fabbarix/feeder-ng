// Supplies in the Pantry (household-items.md 6, 8; H6): keyboard and screen-reader behaviour of the Food or Supplies filter and of
// Used up. Names, roles and states, as pantry-filter.md 8 does for the rest of the header.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { PANTRY_MODE_KEY } from '../hooks/usePantryFilters'
import { makeIngredientJson, makeLot, makeSupplyJson, makeSupplyLot, makeSupplyTotal, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

const places = [{ id: 4, name: 'Utility cupboard', kind: 'pantry', default: true }]
const lots = [
  makeLot({ id: 21, ingredientId: 9, ingredientName: 'rice', storagePlaceId: 4, goesOff: null, spoiled: false, kind: 'food' }),
  makeSupplyLot({ id: 31, ingredientId: 40, ingredientName: 'toilet paper', quantity: 4, storagePlaceId: 4 }),
]

function view(url = '/pantry') {
  mockApi({
    'GET /api/stock': { ingredients: [makeTotal({ ingredientId: 9, name: 'rice', kind: 'food', nextGoesOff: null }), makeSupplyTotal()] },
    'GET /api/stock/lots': { lots, today: '2026-11-12' },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-12' },
    'GET /api/storage-places': places,
    'GET /api/ingredients': [makeIngredientJson({ id: 9, name: 'rice', shelfLifeDays: null }), makeSupplyJson()],
  } as never)
  renderWithProviders(<StockScreen />, url)
  return screen.findByRole('searchbox', { name: 'Search Stock' })
}
const filtersButton = () => screen.getByRole('button', { name: /^Filters/ })

beforeEach(() => localStorage.removeItem(PANTRY_MODE_KEY))
afterEach(() => vi.unstubAllGlobals())

describe('Food or Supplies in the Filters panel', () => {
  it('is a group "Food or Supplies" of toggle buttons with aria-pressed, under a heading of the same name', async () => {
    stubViewportWidth(1024)
    await view('/pantry?stock=supply')
    await userEvent.click(await screen.findByRole('button', { name: 'Filters, 1 active' }))
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(await within(dialog).findByRole('heading', { level: 3, name: 'Food or Supplies' })).toBeInTheDocument()
    const group = within(dialog).getByRole('group', { name: 'Food or Supplies' })
    expect(within(group).getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByRole('button', { name: 'Supplies' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('opening the panel still focuses "Use soon"; Tab goes on to Spoiled, then Food and Supplies, before the kinds', async () => {
    stubViewportWidth(1024)
    await view()
    await userEvent.click(filtersButton())
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    await within(dialog).findByRole('group', { name: 'Food or Supplies' })
    expect(within(dialog).getByRole('button', { name: 'Use soon' })).toHaveFocus()
    await userEvent.tab()
    expect(within(dialog).getByRole('button', { name: 'Spoiled' })).toHaveFocus()
    await userEvent.tab()
    expect(within(dialog).getByRole('button', { name: 'Food' })).toHaveFocus()
    await userEvent.tab()
    expect(within(dialog).getByRole('button', { name: 'Supplies' })).toHaveFocus()
    await userEvent.tab()
    expect(within(dialog).getByRole('button', { name: 'Pantry' })).toHaveFocus()
  })
  it('Space and Enter press a chip; pressing it again releases it', async () => {
    stubViewportWidth(1024)
    await view()
    await userEvent.click(filtersButton())
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    const supplies = await within(dialog).findByRole('button', { name: 'Supplies' })
    supplies.focus()
    await userEvent.keyboard(' ')
    expect(supplies).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Enter}')
    expect(supplies).toHaveAttribute('aria-pressed', 'false')
  })
  it('the chip says what it removes; removing the last one moves focus to Filters', async () => {
    await view('/pantry?stock=food')
    const chips = await screen.findByRole('group', { name: 'Active filters' })
    expect(within(chips).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Remove Food'])
    await userEvent.click(within(chips).getByRole('button', { name: 'Remove Food' }))
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull()
    expect(filtersButton()).toHaveFocus()
  })
  it('Filters names the count, the chip included', async () => {
    await view('/pantry?stock=supply&status=useSoon')
    expect(await screen.findByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument()
  })
})

describe('Supply rows', () => {
  it('say their Restock level in text, not by colour alone; the row is one button named by the Supply', async () => {
    await view()
    const row = await screen.findByRole('button', { name: /Toilet paper/ })
    await vi.waitFor(() => expect(row.closest('li')).toHaveTextContent('4 pieces · below Restock level 6'))
  })
})

describe('Used up', () => {
  async function openSheet() {
    await view()
    await userEvent.click(await screen.findByRole('button', { name: /Toilet paper/ }))
    return screen.findByRole('dialog', { name: 'Toilet paper' })
  }
  it('is a labelled text field, a "Used up" button and a heading, with no native control', async () => {
    const sheet = await openSheet()
    expect(within(sheet).getByRole('heading', { name: 'Used up' })).toBeInTheDocument()
    const field = within(sheet).getByRole('textbox', { name: 'How much was used up' })
    // b8 G4: the field shows its Base Unit; the shared TextField puts its suffix first in aria-describedby.
    expect(field).toHaveAccessibleDescription('piece Leave it as 4 pieces to use up all of it.')
    expect(within(sheet).getByRole('button', { name: 'Used up' })).toBeInTheDocument()
    expect(sheet.querySelector('select, input[type="number"], input[type="date"], input[type="checkbox"]')).toBeNull()
  })
  it('a refused amount is announced as an alert on the field, and the field is marked invalid', async () => {
    const sheet = await openSheet()
    const field = within(sheet).getByRole('textbox', { name: 'How much was used up' })
    await userEvent.type(field, '9')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Used up' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('That is more than this Stock Lot holds')
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })
  it('Enter in the field submits it; Escape closes the sheet with no change', async () => {
    const sheet = await openSheet()
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'How much was used up' }), '9{Enter}')
    expect(await within(sheet).findByRole('alert')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Toilet paper' })).toBeNull()
  })
})
