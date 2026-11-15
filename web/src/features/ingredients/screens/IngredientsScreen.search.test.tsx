// B9-48 (SET-14e): an empty search offers to create what was typed. "No Ingredient matches “Chickpeas”." and a secondary button
// New Ingredient “Chickpeas” that opens the New Ingredient sheet with the name already filled in. Supplies get the same through
// wordsFor('supply') (lib/kind.test.ts); SuppliesScreen.tsx itself is B9-29's.
// Mock: docs/design/ui-review-3/mocks/set-14-small.html (item e). Chapter scenario "Create an Ingredient from an empty search": the API half
// is the existing POST /api/ingredients scenarios; this is the browser half.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import type { Ingredient } from '../types'

const state = { ingredients: [] as Ingredient[], screenState: 'filteredEmpty' as string }
const create = vi.fn().mockResolvedValue({})
vi.mock('../hooks/useIngredients', () => ({
  useIngredients: () => ({ state: state.screenState, ingredients: state.ingredients, isEmpty: false, isLoading: false, error: null, refetch: vi.fn(), create }),
}))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../api', async (orig) => ({ ...(await orig<object>()), ingredientsApi: { search: vi.fn().mockResolvedValue({ exact: null, suggestions: [] }) } }))

import { IngredientsScreen } from './IngredientsScreen'

const setup = () =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={createMemoryRouter([{ path: '/ingredients', element: <IngredientsScreen /> }], { initialEntries: ['/ingredients'] })} />
      </ConfirmProvider>
    </ToastProvider>,
  )
const type = (text: string) => userEvent.type(screen.getByRole('searchbox', { name: 'Search Ingredients' }), text)

beforeEach(() => {
  vi.clearAllMocks()
  state.ingredients = []
  state.screenState = 'filteredEmpty'
})

describe('IngredientsScreen: the empty search (SET-14e)', () => {
  it('names the query and offers a secondary New Ingredient “…” button', async () => {
    setup()
    await type('Chickpeas')
    expect(screen.getByText('No Ingredient matches “Chickpeas”.')).toBeInTheDocument()
    const offer = screen.getByRole('button', { name: 'New Ingredient “Chickpeas”' })
    expect(offer).toHaveAttribute('data-variant', 'secondary')
  })
  it('the offer follows what is typed, trimmed', async () => {
    setup()
    await type('  Chickpeas ')
    expect(screen.getByRole('button', { name: 'New Ingredient “Chickpeas”' })).toBeInTheDocument()
  })
  it('opens the New Ingredient sheet with the Name already filled in', async () => {
    setup()
    await type('Chickpeas')
    await userEvent.click(screen.getByRole('button', { name: 'New Ingredient “Chickpeas”' }))
    const sheet = await screen.findByRole('dialog', { name: 'New Ingredient' })
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toHaveValue('Chickpeas')
  })
  it('the header\'s own New Ingredient (not the offer) still opens the sheet empty', async () => {
    setup()
    await type('Chickpeas')
    await userEvent.click(screen.getByRole('button', { name: 'New Ingredient' }))
    expect(within(await screen.findByRole('dialog', { name: 'New Ingredient' })).getByRole('textbox', { name: 'Name' })).toHaveValue('')
  })
  it('the first-ever empty state (no Ingredients at all) keeps its own wording and has no offer with a name', () => {
    state.screenState = 'empty'
    setup()
    expect(screen.getByText('No Ingredients yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New Ingredient “/ })).toBeNull()
  })
  it('a list that matched shows no offer', async () => {
    state.screenState = 'ready'
    state.ingredients = [{ id: 1, name: 'chickpeas', baseUnit: 'g', shelfLifeDays: null, conversions: [] }]
    setup()
    await type('chick')
    expect(screen.queryByText(/No Ingredient matches/)).toBeNull()
  })
})
