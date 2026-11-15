// H5: /supplies/:id (decision D5): the Ingredient page with kind="supply": Restock level Tile, kind Tile, no Shelf Life, no Excluded by.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { alerts, findAlert, renderRoutes } from '../ingredient.test-helper'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { detail, dishSoapJSON, garlicJSON, toiletPaperJSON } from '../supply.test-helper'
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
  save: vi.fn().mockResolvedValue({}),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useIngredientImpact', () => ({ useIngredientImpact: () => ({ impact: { references: {}, total: 0 }, isLoading: false, settled: true }) }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => system.value }))
vi.mock('../../products', async () => {
  const { Tile } = await import('../../../ui')
  return { IngredientProducts: () => <Tile as="section" aria-label="Products">products tile</Tile> }
})
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))
vi.mock('../components/MergeSheet', () => ({
  MergeSheet: ({ open, sourceId, kind }: { open: boolean; sourceId: number; kind?: string }) => (open ? <p>merge sheet for {sourceId} ({kind})</p> : null),
}))

import { SupplyScreen } from './SupplyScreen'

function setup(entry = '/supplies/21') {
  renderRoutes(
    [
      { path: '/supplies', element: <p>supplies list</p> },
      { path: '/supplies/:id', element: <SupplyScreen /> },
      { path: '/ingredients/:id', element: <p>ingredient page</p> },
    ],
    entry,
  )
}
const keeping = () => screen.getByRole('region', { name: 'Keeping' })
// B9-48 developer, user decision "type or step": the Restock level is an EditableStepper (a spinbutton text input with − and +),
// its unit suffix inside the Stepper group.
const restockField = () => within(keeping()).getByRole('spinbutton', { name: /Restock level/ })
// B9-48 (SET-05): Merge, Change kind and Delete live in the header's More menu, named for the Supply.
const more = async (name = 'More for Dish soap') => {
  await userEvent.click(screen.getByRole('button', { name }))
  return screen.getByRole('menu', { name })
}

beforeEach(() => {
  vi.clearAllMocks()
  hook.ingredient = detail(dishSoapJSON)
  hook.error = null
  hook.isLoading = false
  hook.referenceCount = 0
  system.value = 'metric'
})

describe('SupplyScreen: what a Supply has', () => {
  it('is headed with its name and "Supply" under Settings > Supplies', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Dish soap' })).toBeInTheDocument()
    expect(document.querySelector('.page-header__subtitle')).toHaveTextContent('Supply')
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(within(trail).getByRole('link', { name: 'Supplies' })).toHaveAttribute('href', '/supplies')
    expect(trail).toHaveTextContent('Dish soap')
  })
  it('shows the Base Unit and Restock level in Keeping, Picture, Unit Conversions and Products; Merge and Delete are in More', async () => {
    setup()
    expect(within(keeping()).getByRole('radiogroup', { name: 'Base Unit' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Picture' })).toBeInTheDocument()
    expect(screen.getByText('1 bottle = 500 ml')).toBeInTheDocument()
    expect(screen.getByText('products tile')).toBeInTheDocument()
    const menu = await more()
    expect(within(menu).getByRole('menuitem', { name: 'Merge into another Supply' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete Supply' })).not.toHaveAttribute('aria-disabled', 'true')
  })
  // Batch w3e ruling: the order follows the render, Products before Unit Conversions.
  it('lays out Keeping first and full width, then the Products and Unit Conversions pair, then Picture; no lone half-width tile (SET-05)', () => {
    setup()
    const tiles = [...document.querySelectorAll('[role="group"][aria-label="Supply details"] > .tile')] as HTMLElement[]
    const name = (t: HTMLElement) => t.getAttribute('aria-label') ?? t.querySelector('h2')?.textContent
    expect(tiles.map(name)).toEqual(['Keeping', 'Products', 'Unit Conversions', 'Picture'])
    expect(tiles.filter((t) => t.getAttribute('data-span') !== 'full').map(name)).toEqual(['Products', 'Unit Conversions'])
  })
  it('names its regions for a Supply, not an Ingredient', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Supply details' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Ingredient/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Rename Dish soap' })).toBeInTheDocument()
  })
  it('has no Shelf Life, Frozen Shelf Life or Excluded by Tile', () => {
    setup()
    expect(screen.queryByLabelText(/Shelf Life/)).toBeNull()
    expect(screen.queryByRole('region', { name: /Shelf Life/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Excluded by' })).toBeNull()
    expect(screen.queryByText('exclusion list')).toBeNull()
    expect(screen.queryByText(/Shelf Life|Freezer/)).toBeNull()
  })
  it('opens the merge sheet for a Supply, in its kind', async () => {
    setup()
    await userEvent.click(within(await more()).getByRole('menuitem', { name: 'Merge into another Supply' }))
    expect(screen.getByText('merge sheet for 21 (supply)')).toBeInTheDocument()
  })
  it('deletes after a confirm that names the Supply ("Delete Supply" on the button), then returns to /supplies', async () => {
    setup()
    await userEvent.click(within(await more()).getByRole('menuitem', { name: 'Delete Supply' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Dish soap?' })
    expect(hook.remove).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Supply' }))
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

describe('SupplyScreen: the Restock level row of Keeping', () => {
  it('shows the level in the Base Unit, in the Household unit display', () => {
    setup()
    expect(restockField()).toHaveValue('500')
    expect(within(keeping()).getByText('Below 500 ml')).toBeInTheDocument()
  })
  it('labels the field in metric Base Units while the summary follows the Household (imperial)', () => {
    system.value = 'imperial'
    setup()
    expect(restockField()).toHaveValue('500')
    expect(within(restockField().closest('.stepper') as HTMLElement).getByText('ml')).toBeInTheDocument() // the suffix, not the Base Unit option
    expect(within(keeping()).getByText('Below 2 cups')).toBeInTheDocument()
  })
  it('counts the field\'s unit with the level ("6 pieces", not "6 piece")', () => {
    hook.ingredient = detail(toiletPaperJSON)
    setup('/supplies/22')
    expect(restockField()).toHaveValue('6')
    expect(within(keeping()).getByText('pieces')).toBeInTheDocument()
  })
  it('saves a new level in Base Units with Save changes (Enter in the field submits too)', async () => {
    setup()
    await userEvent.clear(restockField())
    await userEvent.type(restockField(), '750{Enter}')
    expect(hook.save).toHaveBeenCalledWith({ restockLevel: 750 })
    expect(hook.setRestockLevel).not.toHaveBeenCalled()
  })
  it('clears the level when the field is emptied', async () => {
    setup()
    await userEvent.clear(restockField())
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(hook.save).toHaveBeenCalledWith({ restockLevel: null })
  })
  it('says there is no level when it is null', () => {
    hook.ingredient = detail({ ...dishSoapJSON, restockLevel: null })
    setup()
    expect(restockField()).toHaveValue('')
    expect(within(keeping()).getByText('No Restock level')).toBeInTheDocument()
  })
  it('shows a failed save in words, as the one form-level alert', async () => {
    hook.save.mockRejectedValueOnce(new ApiError(422, 'validation_failed', 'x', { reason: 'restock_level_on_food' }))
    setup()
    await userEvent.clear(restockField())
    await userEvent.type(restockField(), '5{Enter}')
    expect(await findAlert()).toHaveTextContent('Only a Supply has a Restock level')
    expect(alerts()).toHaveLength(1)
  })
})

describe('SupplyScreen: changing kind (More menu)', () => {
  it('offers "Change to food" and no Kind tile', async () => {
    setup()
    expect(screen.queryByRole('region', { name: 'Kind' })).toBeNull()
    expect(screen.queryByText('This is a Supply')).toBeNull()
    expect(within(await more()).getByRole('menuitem', { name: 'Change to food' })).toBeInTheDocument()
  })
  it('changes to food at once (always allowed) and follows it to /ingredients/:id', async () => {
    setup()
    await userEvent.click(within(await more()).getByRole('menuitem', { name: 'Change to food' }))
    expect(hook.setKind).toHaveBeenCalledWith('food')
    expect(await screen.findByText('ingredient page')).toBeInTheDocument()
  })
  it('stays put and shows the reasons in words in a dialog when the change is refused (409 kind_in_use)', async () => {
    hook.setKind.mockRejectedValueOnce(new ApiError(409, 'kind_in_use', 'kind_in_use', { reasons: ['recipe_lines', 'exclusions', 'base_recipe'] }))
    setup()
    await userEvent.click(within(await more()).getByRole('menuitem', { name: 'Change to food' }))
    const dialog = await screen.findByRole('dialog', { name: "It can't become food yet" })
    const items = within(dialog).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['It is on a Recipe line', 'A Member excludes it', "It is a Base recipe's Ingredient"])
    expect(screen.queryByText('ingredient page')).toBeNull()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog', { name: "It can't become food yet" })).toBeNull()
  })
})
