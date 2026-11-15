import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { Product } from '../types'
import { ProductsScreen } from './ProductsScreen'

const passata: Product = { id: 1, name: 'Passata', ingredientId: 3, ingredientName: 'Tomato passata', baseUnit: 'g', packSize: 700, archived: false }
const oldPasta: Product = { id: 2, name: 'Old pasta', ingredientId: 4, ingredientName: 'Pasta', baseUnit: 'g', packSize: 500, archived: true }

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /api/me/preferences': { scheme: 'system', accent: '#3f7d58', units: 'metric' },
    'GET /api/products': [passata],
    'GET /api/products?includeArchived=1': [passata, oldPasta],
    'GET /api/products?q=pas': [passata],
    'GET /api/products?q=pas&includeArchived=1': [passata, oldPasta],
    ...extra,
  })
  renderWithProviders(<ProductsScreen />, '/products')
  return api
}

afterEach(() => vi.unstubAllGlobals())

describe('ProductsScreen', () => {
  it('lists active Products as rows with the Ingredient and pack size, linking to the Product page', async () => {
    setup()
    const row = (await screen.findByRole('link', { name: 'Passata' })).closest('li')!
    expect(row).toHaveTextContent('Tomato passata')
    expect(row).toHaveTextContent('700 g')
    expect(screen.getByRole('link', { name: 'Passata' })).toHaveAttribute('href', '/products/1')
    expect(screen.queryByText('Old pasta')).toBeNull()
  })

  it('searches with the shared SearchField (a searchbox with a clear button), not a native search input', async () => {
    const api = setup()
    await screen.findByRole('link', { name: 'Passata' })
    const box = screen.getByRole('searchbox', { name: 'Search Products' })
    await userEvent.type(box, 'pas')
    await waitFor(() => expect(api.callsTo('GET', '/api/products?q=pas').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box).toHaveValue('')
  })

  it('has an Archived filter chip, off by default, and no archived rows until it is on', async () => {
    const api = setup()
    const chip = await screen.findByRole('button', { name: 'Archived' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(api.callsTo('GET', '/api/products?includeArchived=1')).toHaveLength(0)
  })

  it('turning Archived on requests includeArchived=1 and shows only the archived Products, each marked with an Archived chip', async () => {
    const api = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Archived' }))
    await waitFor(() => expect(api.callsTo('GET', '/api/products?includeArchived=1')).toHaveLength(1))
    const row = (await screen.findByRole('link', { name: 'Old pasta' })).closest('li')!
    expect(within(row).getByText('Archived')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Passata' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Archived' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('combines the search text with includeArchived', async () => {
    const api = setup()
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Search Products' }), 'pas')
    await userEvent.click(screen.getByRole('button', { name: 'Archived' }))
    await waitFor(() => expect(api.callsTo('GET', '/api/products?q=pas&includeArchived=1').length).toBeGreaterThan(0))
  })

  it('turning Archived off goes back to the active list', async () => {
    setup()
    const chip = await screen.findByRole('button', { name: 'Archived' })
    await userEvent.click(chip)
    await screen.findByRole('link', { name: 'Old pasta' })
    await userEvent.click(chip)
    expect(await screen.findByRole('link', { name: 'Passata' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Old pasta' })).toBeNull()
  })

  it('says so when nothing is archived', async () => {
    setup({ 'GET /api/products?includeArchived=1': [passata] })
    await userEvent.click(await screen.findByRole('button', { name: 'Archived' }))
    expect(await screen.findByText('No archived Products')).toBeInTheDocument()
  })

  it('invites to add Products when there are none at all', async () => {
    setup({ 'GET /api/products': [] })
    expect(await screen.findByText('No Products yet')).toBeInTheDocument()
  })

  it('uses no native search or select', async () => {
    setup()
    await screen.findByRole('link', { name: 'Passata' })
    expect(document.querySelector('select, input[type=search]:not(.search-field input)')).toBeNull()
    expect(document.querySelector('.search-field input[type=search]')).not.toBeNull()
  })
})

// B9-30 (SET-14a, decision SET 4): "New Product" on the Products list.
describe('ProductsScreen: New Product', () => {
  it('has a primary "New Product" in the PageHeader actions', async () => {
    setup()
    await screen.findByRole('link', { name: 'Passata' })
    const button = screen.getByRole('button', { name: 'New Product' })
    expect(button).toHaveAttribute('data-variant', 'primary')
    expect(button.closest('.page-header__actions')).not.toBeNull()
  })

  it('opens the New Product sheet with the Ingredient Select first, and creates the Product', async () => {
    const api = setup({
      'GET /api/ingredients': [{ id: 3, name: 'tomato passata', baseUnit: 'g', kind: 'food', shelfLifeDays: null, conversions: [] }],
      'POST /api/products': { ...passata, id: 9, barcodes: [], shops: [], shopBarcodes: [], latestPrices: [] },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'New Product' }))
    const dialog = await screen.findByRole('dialog', { name: 'New Product' })
    await userEvent.click(await within(dialog).findByRole('combobox', { name: 'Ingredient' }))
    await userEvent.click(await screen.findByRole('option', { name: /Tomato passata/i }))
    await userEvent.type(within(dialog).getByLabelText('Pack size (g)'), '700')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Product' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/products')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/products')[0]!.body).toMatchObject({ ingredientId: 3, packSize: 700 })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Product' })).toBeNull())
  })
})
