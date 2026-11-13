// pantry-filter: keyboard and screen-reader behaviour of the Pantry filter header (docs/design/pantry-filter.md 8).
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import { PANTRY_MODE_KEY } from '../hooks/usePantryFilters'
import { makeLot, makeTotal } from '../testData'
import { StockScreen } from './StockScreen'

vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../hooks/useIngredientChoices', () => ({ useIngredientChoices: () => ({ choices: [], isLoading: false }) }))

const places = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
]
const lots = [
  makeLot({ id: 11, ingredientId: 7, ingredientName: 'peas', storagePlaceId: 2 }),
  makeLot({ id: 12, ingredientId: 8, ingredientName: 'rice', storagePlaceId: 1, useSoon: true }),
]

function view(url = '/pantry') {
  mockApi({
    'GET /api/stock': { ingredients: lots.map((l) => makeTotal({ ingredientId: l.ingredientId, name: l.ingredientName })) },
    'GET /api/stock/lots': { lots, today: '2026-11-11' },
    'GET /api/stock/spoiled': { lots: [], today: '2026-11-11' },
    'GET /api/storage-places': places,
  })
  renderWithProviders(<StockScreen />, url)
  // The header shows once Stock is loaded; a test that needs the Storage Places waits for what they bring.
  return screen.findByRole('searchbox', { name: 'Search Stock' })
}
const filtersButton = () => screen.getByRole('button', { name: /^Filters/ })

beforeEach(() => localStorage.removeItem(PANTRY_MODE_KEY))
afterEach(() => vi.unstubAllGlobals())

describe('names and roles', () => {
  it('Filters says it opens a dialog and how many filters are on; its count chip is hidden from the name', async () => {
    await view('/pantry?status=useSoon&place=2')
    const button = await screen.findByRole('button', { name: 'Filters, 2 active' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button.querySelector('.chip[data-kind="count"]')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
  it('List is a radiogroup "List", Sort a combobox "Sort", both with hidden labels; the search a searchbox "Search Stock"', async () => {
    await view()
    expect(screen.getByRole('radiogroup', { name: 'List' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search Stock' })).toBeInTheDocument()
    for (const label of document.querySelectorAll('.filter-bar__view-row .ui-field__label')) expect(label).toHaveClass('visually-hidden')
  })
  it('the chips are buttons that say what they remove', async () => {
    await view('/pantry?status=spoiled&kind=freezer&place=none')
    const chips = await screen.findByRole('group', { name: 'Active filters' })
    expect(within(chips).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Remove Spoiled', 'Remove kind: Freezer', 'Remove Storage Place: Not sorted'])
  })
})

describe('keyboard', () => {
  it('tab order: Search, Filters, List, Sort, then the chips', async () => {
    await view('/pantry?status=useSoon')
    const search = screen.getByRole('searchbox', { name: 'Search Stock' })
    search.focus()
    await userEvent.tab()
    expect(filtersButton()).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('radio', { name: 'Storage Place' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Remove Use soon' })).toHaveFocus()
  })
  it('from 768 px, opening the panel focuses "Use soon"; Escape closes it and focus returns to Filters', async () => {
    stubViewportWidth(1024)
    await view()
    await userEvent.click(filtersButton())
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(filtersButton()).toHaveAttribute('aria-expanded', 'true')
    expect(filtersButton()).toHaveAttribute('aria-controls', dialog.id)
    expect(within(dialog).getByRole('button', { name: 'Use soon' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
    expect(filtersButton()).toHaveFocus()
  })
  it('the Storage Place list is a multi-select listbox under a search combobox; Enter toggles the active option', async () => {
    stubViewportWidth(1024)
    await view()
    await screen.findByRole('list', { name: /^Garage Freezer/ })
    await userEvent.click(filtersButton())
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    const listbox = within(dialog).getByRole('listbox', { name: 'Filter by Storage Place' })
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true')
    const search = within(dialog).getByRole('combobox', { name: 'Search Storage Places' })
    await userEvent.click(search)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(within(dialog).getByRole('option', { name: /Garage Freezer/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Remove Storage Place: Garage Freezer' })).toBeInTheDocument()
  })
  it('removing the last chip moves focus to Filters', async () => {
    await view('/pantry?status=useSoon')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Use soon' }))
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull()
    expect(filtersButton()).toHaveFocus()
  })
  it('on a phone the panel is the modal sheet, with the ✕ "Close" and "Show Stock" (never two "Close")', async () => {
    stubViewportWidth(390)
    await view()
    await userEvent.click(filtersButton())
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(within(dialog).getByRole('button', { name: 'Show Stock' })).toBeInTheDocument()
  })
})
