// H5: /supplies (decision D5): the Ingredients list with kind="supply": its own title, search, empty copy and New Supply sheet.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dishSoapJSON, toiletPaperJSON } from '../supply.test-helper'
import type { Ingredient } from '../types'

const state = { ingredients: [] as Ingredient[], isEmpty: false, isLoading: false, query: '', kind: undefined as string | undefined }
const create = vi.fn().mockResolvedValue({})
vi.mock('../hooks/useIngredients', () => ({
  useIngredients: (query: string, kind?: string) => {
    state.query = query
    state.kind = kind
    return { ingredients: state.ingredients, isEmpty: state.isEmpty, isLoading: state.isLoading, error: null, create }
  },
}))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
// H9: the stock level and quick Use have their own tests (SuppliesScreen.use.test.tsx); here Stock has not loaded and nothing is used.
vi.mock('../hooks/useSupplyStock', () => ({ useSupplyStock: () => ({ totals: null, isLoading: true, error: null }) }))
vi.mock('../hooks/useSupplyUse', () => ({
  useSupplyUse: () => ({ request: vi.fn(), sheet: null, confirm: vi.fn(), closeSheet: vi.fn(), busyIds: new Set() }),
}))

import { SuppliesScreen } from './SuppliesScreen'

function setup() {
  const router = createMemoryRouter(
    [
      { path: '/supplies', element: <SuppliesScreen /> },
      { path: '/supplies/:id', element: <p>supply page</p> },
      { path: '/settings', element: <p>settings</p> },
    ],
    { initialEntries: ['/supplies'] },
  )
  render(<RouterProvider router={router} />)
}

describe('SuppliesScreen', () => {
  beforeEach(() => {
    state.ingredients = [toiletPaperJSON, dishSoapJSON]
    state.isEmpty = false
    state.isLoading = false
    create.mockClear()
  })
  it('while the list first loads, shows rows to come, never "No Supply matches that search"', async () => {
    state.ingredients = []
    state.isLoading = true
    setup()
    expect(screen.queryByText('No Supply matches that search')).toBeNull()
    expect(await screen.findByText('Loading')).toBeInTheDocument()
  })
  it('asks the list hook for Supplies', () => {
    setup()
    expect(state.kind).toBe('supply')
  })
  it('is headed Supplies, with Settings > Supplies above it', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Supplies' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Settings')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })
  it('lists the Supplies and opens one at /supplies/:id', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Dish soap' }))
    expect(screen.getByText('supply page')).toBeInTheDocument()
  })
  it('searches with "Search Supplies" and passes the text on', async () => {
    setup()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Supplies' }), 'soap')
    expect(state.query).toBe('soap')
  })
  it('invites the first Supply, in the Supply words, when there are none', () => {
    state.ingredients = []
    state.isEmpty = true
    setup()
    expect(screen.getByText('No Supplies yet')).toBeInTheDocument()
    expect(screen.getByText("Toilet paper, batteries or laundry pods: things you buy and keep in Stock but don't cook with.")).toBeInTheDocument()
  })
  it('says nothing matches when the search finds none', () => {
    state.ingredients = []
    setup()
    expect(screen.getByText('No Supply matches that search')).toBeInTheDocument()
  })
  it('opens the New Supply sheet: the kind is fixed, so no Food | Supply choice', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'New Supply' }))
    expect(screen.getByRole('dialog', { name: 'New Supply' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Kind' })).toBeNull()
    expect(screen.queryByLabelText(/Shelf Life/)).toBeNull()
  })
  it('never uses the word "item" or "non-food" in its copy', () => {
    state.ingredients = []
    state.isEmpty = true
    setup()
    expect(document.body.textContent).not.toMatch(/\bitems?\b|non-food/i)
  })
})
