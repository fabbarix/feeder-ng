// B9-48 (SET-05, SAFE-02, SAFE-04): the Ingredient page against the HTTP stub, with the real hooks (useIngredient, useKeepingForm,
// useIngredientImpact): what the page asks the server, in what order, and what the person sees and where focus goes.
// Mocked: the unit system, the Products tile (B9-30's) and the Excluded-by list; the MergeSheet (own tests).
// Chapter scenarios covered here (vitest, since the browser steps are not in the godog suite):
//   "Change Shelf Life and Frozen Shelf Life and save both at once" (also bdd/features/ingredients/ingredient_keeping.feature, the API half)
//   "Rename an Ingredient in a sheet and return to the Rename button"
//   "Delete an Ingredient that nothing uses" and "Remove a conversion and Undo it".
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, refusal } from '../../../lib/baseRecipes/test-utils'
import { alerts, findAlert, renderRoutes } from '../ingredient.test-helper'
import { detail, garlicJSON } from '../supply.test-helper'

vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', async () => {
  const { Tile } = await import('../../../ui')
  return { IngredientProducts: () => <Tile as="section" aria-label="Products">products tile</Tile> }
})
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))
vi.mock('../components/MergeSheet', () => ({ MergeSheet: ({ open }: { open: boolean }) => (open ? <p>merge sheet</p> : null) }))

import { ingredientsApi } from '../api'
import type { IngredientImpact } from '../types'
import { IngredientScreen } from './IngredientScreen'

const garlic = detail(garlicJSON) // Shelf Life 30, frozen none, conversion 1 clove = 5 g
const setup = (routes: Record<string, unknown> = {}, entry = '/ingredients/7', id = 7) => {
  const api = mockApi({ [`GET /api/ingredients/${id}`]: garlic, [`GET /api/ingredients/${id}/impact`]: { references: {}, total: 0 }, ...routes })
  const view = renderRoutes(
    [
      { path: '/ingredients', element: <p>list page</p> },
      { path: '/ingredients/:id', element: <IngredientScreen /> },
      { path: '/supplies', element: <p>supplies page</p> },
    ],
    entry,
  )
  return { api, ...view }
}
const keeping = () => screen.getByRole('region', { name: 'Keeping' })
const ready = async () => screen.findByRole('heading', { level: 1, name: 'Garlic' })
const tiles = () => [...document.querySelectorAll('[role="group"][aria-label="Ingredient details"] > .tile')] as HTMLElement[]

beforeEach(() => vi.unstubAllGlobals())

describe('layout: one Keeping tile, no orphan (SET-05)', () => {
  it('Keeping is the first tile and full width; Unit Conversions and Products are the pair; Excluded by and Picture are full and last', async () => {
    setup()
    await ready()
    const names = tiles().map((t) => t.getAttribute('aria-label') ?? t.querySelector('h2')?.textContent)
    expect(names).toEqual(['Keeping', 'Unit Conversions', 'Products', 'Excluded by', 'Picture'])
    const span = (name: string) => tiles().find((t) => (t.getAttribute('aria-label') ?? t.querySelector('h2')?.textContent) === name)!.getAttribute('data-span')
    expect(span('Keeping')).toBe('full')
    expect(span('Excluded by')).toBe('full')
    expect(span('Picture')).toBe('full')
    expect(span('Unit Conversions')).not.toBe('full')
    expect(span('Products')).not.toBe('full')
  })
  it('the pair keeps the container query hook: its tiles are .ingredient__tile inside the .ingredient__tiles container (they stack at 560-575 px)', async () => {
    setup()
    await ready()
    const container = document.querySelector('.ingredient__tiles') as HTMLElement
    expect(container).not.toBeNull()
    expect(container.querySelector('[role="group"][aria-label="Ingredient details"]')).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Unit Conversions' })).toHaveClass('ingredient__tile')
  })
  it('the page has exactly ONE accent (primary) button: Save changes', async () => {
    setup()
    await ready()
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('data-variant', 'primary')
    expect(document.querySelector('[data-variant="danger"]')).toBeNull()
  })
  it('Products and Unit Conversions keep their own outline actions, never an accent', async () => {
    setup()
    await ready()
    const conv = screen.getByRole('region', { name: 'Unit Conversions' })
    expect(within(conv).getByRole('button', { name: 'Add conversion' })).toHaveAttribute('data-variant', 'secondary')
  })
})

describe('Keeping: one save, one PATCH (SET-05)', () => {
  it('both Shelf Lives saved at once: ONE PATCH with both, then "Saved Keeping for Garlic"', async () => {
    const { api } = setup({ 'PATCH /api/ingredients/7': { ...garlicJSON, shelfLifeDays: 31, frozenShelfLifeDays: 1 } })
    await ready()
    await userEvent.click(within(within(keeping()).getByRole('group', { name: 'Shelf Life' })).getByRole('button', { name: 'Increase Shelf Life' }))
    await userEvent.click(within(within(keeping()).getByRole('group', { name: 'Frozen Shelf Life' })).getByRole('button', { name: 'Increase Frozen Shelf Life' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/ingredients/7')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/ingredients/7')[0]!.body).toEqual({ shelfLifeDays: 31, frozenShelfLifeDays: 1 })
    expect(await screen.findByText('Saved Keeping for Garlic')).toBeInTheDocument()
  })
  it('leaving with unsaved Keeping changes asks "Leave without saving?"; Keep editing stays, Discard changes goes', async () => {
    setup()
    await ready()
    await userEvent.click(within(within(keeping()).getByRole('group', { name: 'Shelf Life' })).getByRole('button', { name: 'Increase Shelf Life' }))
    await userEvent.click(screen.getByRole('link', { name: 'Ingredients' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
    expect(dialog).toHaveTextContent('Your changes to Garlic are not saved.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Garlic' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Ingredients' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByText('list page')).toBeInTheDocument()
  })
  it('no prompt when nothing changed', async () => {
    setup({ 'PATCH /api/ingredients/7': garlicJSON })
    await ready()
    await userEvent.click(screen.getByRole('link', { name: 'Ingredients' }))
    expect(await screen.findByText('list page')).toBeInTheDocument()
  })
})

describe('Rename in a sheet and back to the Rename button (SET-05)', () => {
  it('opens "Rename Garlic" with the field focused; Save name PATCHes { name }; the sheet closes and focus returns to the Rename button', async () => {
    const { api } = setup({ 'PATCH /api/ingredients/7': { ...garlicJSON, name: 'garlic bulb' } })
    await ready()
    const rename = screen.getByRole('button', { name: 'Rename Garlic' })
    await userEvent.click(rename)
    const dialog = await screen.findByRole('dialog', { name: 'Rename Garlic' })
    const field = within(dialog).getByRole('textbox', { name: 'Name' })
    expect(field).toHaveFocus()
    await userEvent.keyboard('{Control>}a{/Control}Garlic bulb')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename Garlic' })).toBeNull())
    expect(api.callsTo('PATCH', '/api/ingredients/7')[0]!.body).toEqual({ name: 'Garlic bulb' })
    expect(rename).toHaveFocus()
  })
  it('Cancel returns focus to the Rename button too', async () => {
    setup()
    await ready()
    const rename = screen.getByRole('button', { name: 'Rename Garlic' })
    await userEvent.click(rename)
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Rename Garlic' })).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(rename).toHaveFocus())
  })
})

describe('Delete Ingredient: a confirm that shows what it touches (SAFE-02)', () => {
  const openDelete = async (name = 'Delete Garlic?') => {
    await userEvent.click(screen.getByRole('button', { name: 'More for Garlic' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'More for Garlic' })).getByRole('menuitem', { name: 'Delete Ingredient' }))
    return screen.findByRole('dialog', { name })
  }
  it('reads the impact when the confirm opens (not before), then DELETEs on confirm and goes to the list; no Undo toast (a confirm, not a light removal)', async () => {
    const { api } = setup({ 'DELETE /api/ingredients/7': { status: 204 } })
    await ready()
    expect(api.callsTo('GET', '/api/ingredients/7/impact')).toHaveLength(0)
    const dialog = await openDelete()
    await waitFor(() => expect(api.callsTo('GET', '/api/ingredients/7/impact')).toHaveLength(1))
    await within(dialog).findByText('It is on no Recipe, Product or Shopping List.')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Ingredient' }))
    expect(await screen.findByText('list page')).toBeInTheDocument()
    expect(api.callsTo('DELETE', '/api/ingredients/7')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull()
  })
  it('when the impact read finds it in use: rows, not a sentence', async () => {
    setup({ 'GET /api/ingredients/7/impact': { references: { products: 2, 'recipe lines': 1 }, total: 3 } })
    await ready()
    const dialog = await openDelete('Garlic is still used')
    const group = await within(dialog).findByRole('list', { name: 'Used by' })
    expect(within(group).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Recipe lines1', 'Products2'])
    expect(dialog).toHaveTextContent('It is used in 3 places.')
  })
  it('when it is still used there is no Delete: Close, and Merge into another Ingredient opens the merge (user decision)', async () => {
    const { api } = setup({ 'GET /api/ingredients/7/impact': { references: { products: 2 }, total: 2 } })
    await ready()
    const dialog = await openDelete('Garlic is still used')
    await within(dialog).findByRole('list', { name: 'Used by' })
    expect(within(dialog).queryByRole('button', { name: 'Delete Ingredient' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge into another Ingredient' }))
    expect(await screen.findByText('merge sheet')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Garlic is still used' })).toBeNull()
    expect(api.callsTo('DELETE', '/api/ingredients/7')).toHaveLength(0)
  })
  // Batch w3e ruling: the dialog shows only once the impact read has answered (its title never jumps); meanwhile More is busy.
  it('while the impact read is out there is no dialog yet and More is aria-busy', async () => {
    let answer: (v: IngredientImpact) => void = () => {}
    vi.spyOn(ingredientsApi, 'impact').mockImplementationOnce(() => new Promise<IngredientImpact>((r) => (answer = r)))
    setup()
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'More for Garlic' }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'More for Garlic' })).getByRole('menuitem', { name: 'Delete Ingredient' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'More for Garlic' })).toHaveAttribute('aria-busy', 'true'))
    expect(screen.queryByRole('dialog')).toBeNull()
    answer({ references: { products: 2 }, total: 2 })
    expect(await screen.findByRole('dialog', { name: 'Garlic is still used' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More for Garlic' })).not.toHaveAttribute('aria-busy')
  })
  it('Cancel deletes nothing and puts focus back on More', async () => {
    const { api } = setup()
    await ready()
    const dialog = await openDelete()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete Garlic?' })).toBeNull())
    expect(api.callsTo('DELETE', '/api/ingredients/7')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'More for Garlic' })).toHaveFocus()
  })
  it('a refusal by the server stays on the page as the one form-level alert', async () => {
    setup({ 'DELETE /api/ingredients/7': refusal(409, 'in_use') })
    await ready()
    const dialog = await openDelete()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Ingredient' }))
    const alert = await findAlert()
    expect(alert).toHaveClass('form-error')
    expect(alerts()).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Garlic' })).toBeInTheDocument()
  })
})

describe('Unit Conversions: a light removal with Undo; errors at the field (SAFE-02, SAFE-04)', () => {
  it('Remove clove acts at once (no dialog), then the toast "1 clove removed" with Undo; Undo PUTs it back and says "1 clove is back"', async () => {
    const { api } = setup({ 'DELETE /api/ingredients/7/conversions/clove': { ...garlicJSON, conversions: [] }, 'PUT /api/ingredients/7/conversions/clove': garlic })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Remove clove' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(api.callsTo('DELETE', '/api/ingredients/7/conversions/clove')).toHaveLength(1))
    const undo = await screen.findByRole('button', { name: 'Undo: put back 1 clove' })
    expect(screen.getByText('1 clove removed')).toBeInTheDocument()
    await userEvent.click(undo)
    await waitFor(() => expect(api.callsTo('PUT', '/api/ingredients/7/conversions/clove')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/ingredients/7/conversions/clove')[0]!.body).toEqual({ toBase: 5 })
    expect(await screen.findByText('1 clove is back')).toBeInTheDocument()
  })
  it('a refused Undo says "Nothing was undone" (warning), not an error', async () => {
    setup({ 'DELETE /api/ingredients/7/conversions/clove': { ...garlicJSON, conversions: [] }, 'PUT /api/ingredients/7/conversions/clove': refusal(409, 'in_use') })
    await ready()
    await userEvent.click(screen.getByRole('button', { name: 'Remove clove' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo: put back 1 clove' }))
    expect(await screen.findByText('Nothing was undone')).toBeInTheDocument()
  })
  it('adding with a failed server answer shows the one FormError in the Unit Conversions tile', async () => {
    setup({ 'PUT /api/ingredients/7/conversions/bulb': refusal(500, 'server_error') })
    await ready()
    const tile = screen.getByRole('region', { name: 'Unit Conversions' })
    await userEvent.type(within(tile).getByLabelText('Unit'), 'bulb')
    await userEvent.type(within(tile).getByLabelText('Amount in g'), '50')
    await userEvent.click(within(tile).getByRole('button', { name: 'Add conversion' }))
    const alert = await within(tile).findByRole('alert')
    expect(alert).toHaveClass('form-error')
    expect(within(tile).getByLabelText('Unit')).toHaveValue('bulb')
  })
  it('adding with an empty Unit focuses the Unit field with its message', async () => {
    setup()
    await ready()
    const tile = screen.getByRole('region', { name: 'Unit Conversions' })
    await userEvent.click(within(tile).getByRole('button', { name: 'Add conversion' }))
    expect(within(tile).getByLabelText('Unit')).toHaveFocus()
    expect(within(tile).getByLabelText('Unit')).toHaveAccessibleDescription(/Enter a unit, for example clove\./)
  })
})

describe('B9-20 states are kept', () => {
  it('a 404 says the Ingredient does not exist; a failure offers Try again', async () => {
    mockApi({ 'GET /api/ingredients/7': refusal(404, 'not_found') })
    renderRoutes([{ path: '/ingredients/:id', element: <IngredientScreen /> }], '/ingredients/7')
    expect(await screen.findByText('That Ingredient does not exist')).toBeInTheDocument()
  })
  it('a server failure is an ErrorState with Try again', async () => {
    mockApi({ 'GET /api/ingredients/7': refusal(500, 'server_error') })
    renderRoutes([{ path: '/ingredients/:id', element: <IngredientScreen /> }], '/ingredients/7')
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    await act(async () => {})
  })
})
