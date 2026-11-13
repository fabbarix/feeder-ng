// H5: the food Ingredient page: kind Tile "This is food", "Change to Supply" with a confirm and the kind_in_use refusal in words;
// no Restock level on food; a Supply opened at /ingredients/:id is sent to /supplies/:id.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { detail, dishSoapJSON, garlicJSON } from '../supply.test-helper'
import type { IngredientDetail } from '../types'

const hook = {
  ingredient: detail(garlicJSON) as IngredientDetail | undefined,
  isLoading: false,
  error: null as Error | null,
  referenceCount: 0,
  rename: vi.fn(),
  setBaseUnit: vi.fn(),
  setShelfLife: vi.fn().mockResolvedValue({}),
  setFrozenShelfLife: vi.fn().mockResolvedValue({}),
  setImage: vi.fn(),
  setConversion: vi.fn(),
  removeConversion: vi.fn(),
  setRestockLevel: vi.fn(),
  setKind: vi.fn().mockResolvedValue({}),
  remove: vi.fn(),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))
vi.mock('../components/MergeSheet', () => ({
  MergeSheet: ({ open, kind }: { open: boolean; kind?: string }) => (open ? <p>merge sheet ({kind})</p> : null),
}))

import { IngredientScreen } from './IngredientScreen'

const setup = (entry = '/ingredients/7') =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/ingredients/:id', element: <IngredientScreen /> },
          { path: '/supplies/:id', element: <p>supply page</p> },
        ],
        { initialEntries: [entry] },
      )}
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  hook.ingredient = detail(garlicJSON)
  hook.error = null
})

describe('IngredientScreen: food', () => {
  it('has the kind Tile "This is food" and no Restock level Tile', () => {
    setup()
    const t = screen.getByRole('region', { name: 'Kind' })
    expect(within(t).getByText('This is food')).toBeInTheDocument()
    expect(within(t).getByRole('button', { name: 'Change to Supply' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Restock level' })).toBeNull()
    expect(screen.getByLabelText('Shelf Life')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Excluded by' })).toBeInTheDocument()
  })
  it('merges in its kind', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Merge into another Ingredient' }))
    expect(screen.getByText('merge sheet (food)')).toBeInTheDocument()
  })
  it('asks first, saying the Shelf Life and the Good until of its Stock Lots are cleared', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Change to Supply' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change Garlic to a Supply?' })
    expect(dialog).toHaveTextContent('Its Shelf Life and the Good until of its Stock Lots are cleared.')
    expect(hook.setKind).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Change to Supply' }))
    expect(hook.setKind).toHaveBeenCalledWith('supply')
    expect(await screen.findByText('supply page')).toBeInTheDocument()
  })
  it('does nothing when the confirm is cancelled', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Change to Supply' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(hook.setKind).not.toHaveBeenCalled()
    expect(screen.queryByText('supply page')).toBeNull()
  })
  it('shows the kind_in_use reasons in words when the change is refused, and stays on the page', async () => {
    hook.setKind.mockRejectedValueOnce(new ApiError(409, 'kind_in_use', 'kind_in_use', { reasons: ['recipe_lines', 'base_recipe'] }))
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Change to Supply' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change to Supply' }))
    const refusal = await screen.findByRole('dialog', { name: "It can't become a Supply yet" })
    expect(within(refusal).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['It is on a Recipe line', "It is a Base recipe's Ingredient"])
    expect(screen.queryByText('supply page')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Garlic' })).toBeInTheDocument()
  })
  it('sends a Supply opened at /ingredients/:id to /supplies/:id', async () => {
    hook.ingredient = detail(dishSoapJSON)
    setup('/ingredients/21')
    expect(await screen.findByText('supply page')).toBeInTheDocument()
  })
})
