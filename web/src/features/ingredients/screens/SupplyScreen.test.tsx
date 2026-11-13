// H5: /supplies/:id (decision D5): the Ingredient page with kind="supply": Restock level Tile, kind Tile, no Shelf Life, no Excluded by.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { detail, dishSoapJSON, garlicJSON } from '../supply.test-helper'
import type { IngredientDetail } from '../types'

const system = vi.hoisted(() => ({ value: 'metric' as 'metric' | 'imperial' }))
const hook = {
  ingredient: detail(dishSoapJSON) as IngredientDetail | undefined,
  isLoading: false,
  error: null as Error | null,
  referenceCount: 0,
  rename: vi.fn().mockResolvedValue({}),
  setBaseUnit: vi.fn().mockResolvedValue({}),
  setShelfLife: vi.fn().mockResolvedValue({}),
  setFrozenShelfLife: vi.fn().mockResolvedValue({}),
  setImage: vi.fn().mockResolvedValue({}),
  setConversion: vi.fn().mockResolvedValue({}),
  removeConversion: vi.fn().mockResolvedValue({}),
  setRestockLevel: vi.fn().mockResolvedValue({}),
  setKind: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => system.value }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))
vi.mock('../components/MergeSheet', () => ({
  MergeSheet: ({ open, sourceId, kind }: { open: boolean; sourceId: number; kind?: string }) => (open ? <p>merge sheet for {sourceId} ({kind})</p> : null),
}))

import { SupplyScreen } from './SupplyScreen'

function setup(entry = '/supplies/21') {
  const router = createMemoryRouter(
    [
      { path: '/supplies', element: <p>supplies list</p> },
      { path: '/supplies/:id', element: <SupplyScreen /> },
      { path: '/ingredients/:id', element: <p>ingredient page</p> },
    ],
    { initialEntries: [entry] },
  )
  render(<RouterProvider router={router} />)
}
const tile = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  vi.clearAllMocks()
  hook.ingredient = detail(dishSoapJSON)
  hook.error = null
  hook.isLoading = false
  hook.referenceCount = 0
  system.value = 'metric'
})

describe('SupplyScreen: what a Supply has', () => {
  it('is headed with its name under Settings > Supplies', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Dish soap' })).toBeInTheDocument()
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(within(trail).getByRole('link', { name: 'Supplies' })).toHaveAttribute('href', '/supplies')
    expect(trail).toHaveTextContent('Dish soap')
  })
  it('shows the Base Unit, Picture, Unit Conversions, Products, Merge and Delete', () => {
    setup()
    expect(screen.getByRole('radiogroup', { name: 'Base Unit' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Picture' })).toBeInTheDocument()
    expect(screen.getByText('1 bottle = 500 ml')).toBeInTheDocument()
    expect(screen.getByText('products tile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Merge into another Supply' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Supply' })).toBeEnabled()
  })
  it('names its regions for a Supply, not an Ingredient', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Supply details' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Merge Supply' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Ingredient/ })).toBeNull()
  })
  it('has no Shelf Life, Frozen Shelf Life or Excluded by Tile', () => {
    setup()
    expect(screen.queryByLabelText(/Shelf Life/)).toBeNull()
    expect(screen.queryByRole('region', { name: /Shelf Life/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Frozen Shelf Life' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Excluded by' })).toBeNull()
    expect(screen.queryByText('exclusion list')).toBeNull()
    expect(screen.queryByText(/Shelf Life|Freezer/)).toBeNull()
  })
  it('opens the merge sheet for a Supply, in its kind', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Merge into another Supply' }))
    expect(screen.getByText('merge sheet for 21 (supply)')).toBeInTheDocument()
  })
  it('deletes after a confirm, then returns to /supplies', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Supply' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete Supply' }).at(-1)!)
    expect(hook.remove).toHaveBeenCalled()
    expect(await screen.findByText('supplies list')).toBeInTheDocument()
  })
  it('says "Supply" for a page that does not exist', () => {
    hook.ingredient = undefined
    hook.error = new ApiError(404, 'not_found', 'nope')
    setup()
    expect(screen.getByText('That Supply does not exist')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Supplies' })).toHaveAttribute('href', '/supplies')
  })
  it('sends a food Ingredient that was opened at /supplies/:id to /ingredients/:id', async () => {
    hook.ingredient = detail(garlicJSON)
    setup('/supplies/7')
    expect(await screen.findByText('ingredient page')).toBeInTheDocument()
  })
})

describe('SupplyScreen: the Restock level Tile', () => {
  it('shows the level in the Base Unit, in the Household unit display', () => {
    setup()
    const t = tile('Restock level')
    expect(t).toHaveClass('tile')
    expect(within(t).getByRole('textbox', { name: /Restock level/ })).toHaveValue('500')
    expect(within(t).getByText('Below 500 ml')).toBeInTheDocument()
  })
  it('labels the field in metric Base Units while the summary follows the Household (imperial)', () => {
    system.value = 'imperial'
    setup()
    const t = tile('Restock level')
    expect(within(t).getByRole('textbox', { name: /Restock level/ })).toHaveValue('500')
    expect(within(t).getByText('ml')).toBeInTheDocument() // the stored value is always metric, as the conversion amount field
    expect(within(t).getByText('Below 2 cups')).toBeInTheDocument()
  })
  it('saves a new level in Base Units on Enter', async () => {
    setup()
    const field = within(tile('Restock level')).getByRole('textbox', { name: /Restock level/ })
    await userEvent.clear(field)
    await userEvent.type(field, '750{Enter}')
    expect(hook.setRestockLevel).toHaveBeenCalledWith(750)
  })
  it('clears the level when the field is emptied', async () => {
    setup()
    const field = within(tile('Restock level')).getByRole('textbox', { name: /Restock level/ })
    await userEvent.clear(field)
    await userEvent.keyboard('{Enter}')
    expect(hook.setRestockLevel).toHaveBeenCalledWith(null)
  })
  it('says there is no level when it is null', () => {
    hook.ingredient = detail({ ...dishSoapJSON, restockLevel: null })
    setup()
    const t = tile('Restock level')
    expect(within(t).getByRole('textbox', { name: /Restock level/ })).toHaveValue('')
    expect(within(t).getByText('No Restock level')).toBeInTheDocument()
  })
  it('shows a failed save in words', async () => {
    hook.setRestockLevel.mockRejectedValueOnce(new ApiError(422, 'validation_failed', 'x', { reason: 'restock_level_on_food' }))
    setup()
    const field = within(tile('Restock level')).getByRole('textbox', { name: /Restock level/ })
    await userEvent.clear(field)
    await userEvent.type(field, '5{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a Supply has a Restock level')
  })
})

describe('SupplyScreen: the kind Tile', () => {
  it('says "This is a Supply" and offers "Change to food"', () => {
    setup()
    const t = tile('Kind')
    expect(within(t).getByText('This is a Supply')).toBeInTheDocument()
    expect(within(t).getByRole('button', { name: 'Change to food' })).toBeInTheDocument()
  })
  it('changes to food at once (always allowed) and follows it to /ingredients/:id', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Change to food' }))
    expect(hook.setKind).toHaveBeenCalledWith('food')
    expect(await screen.findByText('ingredient page')).toBeInTheDocument()
  })
  it('stays put and shows the reasons in words in a dialog when the change is refused (409 kind_in_use)', async () => {
    hook.setKind.mockRejectedValueOnce(new ApiError(409, 'kind_in_use', 'kind_in_use', { reasons: ['recipe_lines', 'exclusions', 'base_recipe'] }))
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Change to food' }))
    const dialog = await screen.findByRole('dialog', { name: "It can't become food yet" })
    const items = within(dialog).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['It is on a Recipe line', 'A Member excludes it', "It is a Base recipe's Ingredient"])
    expect(screen.queryByText('ingredient page')).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog', { name: "It can't become food yet" })).toBeNull()
  })
})
