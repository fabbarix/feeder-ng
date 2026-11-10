import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import type { Ingredient } from '../types'

const state = { ingredients: [] as Ingredient[], isEmpty: false, query: '' }
const create = vi.fn().mockResolvedValue({})
vi.mock('../hooks/useIngredients', () => ({
  useIngredients: (query: string) => {
    state.query = query
    return { ingredients: state.ingredients, isEmpty: state.isEmpty, isLoading: false, error: null, create }
  },
}))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { IngredientsScreen } from './IngredientsScreen'

const garlic: Ingredient = { id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: null, conversions: [] }

function setup() {
  const router = createMemoryRouter(
    [
      { path: '/ingredients', element: <IngredientsScreen /> },
      { path: '/ingredients/:id', element: <p>detail page</p> },
    ],
    { initialEntries: ['/ingredients'] },
  )
  render(<RouterProvider router={router} />)
}

describe('IngredientsScreen', () => {
  beforeEach(() => {
    state.ingredients = [garlic]
    state.isEmpty = false
  })
  it('lists the Ingredients under a heading', () => {
    setup()
    expect(screen.getByRole('heading', { name: strings.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Garlic' })).toBeInTheDocument()
  })
  it('opens an Ingredient page', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Garlic' }))
    expect(screen.getByText('detail page')).toBeInTheDocument()
  })
  it('passes the search text to the hook', async () => {
    setup()
    await userEvent.type(screen.getByRole('searchbox', { name: strings.searchLabel }), 'gar')
    expect(state.query).toBe('gar')
  })
  it('invites the first Ingredient when there are none', () => {
    state.ingredients = []
    state.isEmpty = true
    setup()
    expect(screen.getByText(strings.emptyTitle)).toBeInTheDocument()
  })
  it('says nothing matches when the search finds none', () => {
    state.ingredients = []
    state.isEmpty = false
    setup()
    expect(screen.getByText(strings.noMatches)).toBeInTheDocument()
  })
  it('searches with the shared SearchField, not a native search input', () => {
    setup()
    expect(document.querySelector('input[type=search]')).toBeNull()
    expect(screen.getByRole('searchbox', { name: strings.searchLabel })).toBeInTheDocument()
  })
  it('opens the New Ingredient sheet', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: strings.newIngredient }))
    expect(screen.getByRole('button', { name: strings.createIngredient })).toBeInTheDocument()
  })
})
