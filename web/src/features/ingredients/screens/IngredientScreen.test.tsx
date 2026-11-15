// The Ingredient page with a mocked useIngredient (B9-48 rewrote it for SET-05: header Rename and More, one Keeping tile, Delete as a confirm).
// The integration test with the real hooks and the HTTP stub is IngredientScreen.page.test.tsx.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { alerts, renderRoutes } from '../ingredient.test-helper'
import { strings } from '../strings'
import type { IngredientDetail } from '../types'

const base: IngredientDetail = {
  id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30,
  conversions: [{ unit: 'clove', toBase: 5 }], references: {},
}
const hook = {
  ingredient: base as IngredientDetail | undefined,
  isLoading: false,
  error: null as Error | null,
  referenceCount: 0,
  rename: vi.fn().mockResolvedValue({}),
  save: vi.fn().mockResolvedValue({}),
  setBaseUnit: vi.fn().mockResolvedValue({}),
  setShelfLife: vi.fn().mockResolvedValue({}),
  setConversion: vi.fn().mockResolvedValue({}),
  removeConversion: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue(undefined),
  refetch: vi.fn(),
  // B9-20 (RES-02): the screen switches on `state`; it follows the fields these tests set.
  get state() {
    return this.ingredient ? 'ready' : this.isLoading ? 'loading' : this.error ? 'failed' : 'loading'
  },
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useIngredientImpact', () => ({ useIngredientImpact: () => ({ impact: { references: {}, total: 0 }, isLoading: false }) }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))
vi.mock('./../components/MergeSheet', () => ({
  MergeSheet: ({ open, sourceId }: { open: boolean; sourceId: number }) => (open ? <p>merge sheet for {sourceId}</p> : null),
}))

import { IngredientScreen } from './IngredientScreen'

function setup() {
  return renderRoutes(
    [
      { path: '/ingredients', element: <p>list page</p> },
      { path: '/ingredients/:id', element: <IngredientScreen /> },
    ],
    '/ingredients/7',
  )
}
const openMore = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'More for Garlic' }))
  return screen.getByRole('menu', { name: 'More for Garlic' })
}

describe('IngredientScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hook.ingredient = base
    hook.error = null
    hook.isLoading = false
    hook.referenceCount = 0
  })
  it('shows the name with its kind, the Keeping tile and the conversions', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Garlic' })).toBeInTheDocument()
    expect(document.querySelector('.page-header__subtitle')).toHaveTextContent('Food')
    const keeping = screen.getByRole('region', { name: 'Keeping' })
    expect(within(keeping).getByRole('spinbutton', { name: 'Shelf Life' })).toHaveValue('30') // B9-48 "type or step": a text input
    expect(screen.getByText('1 clove = 5 g')).toBeInTheDocument()
  })
  it('Rename and More are the header\'s two outline IconButtons (no text Rename button, no Kind, Merge or Delete tile)', () => {
    setup()
    const actions = document.querySelector('.page-header__actions') as HTMLElement
    expect(within(actions).getByRole('button', { name: 'Rename Garlic' })).toHaveAttribute('aria-haspopup', 'dialog')
    expect(within(actions).getByRole('button', { name: 'More for Garlic' })).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.queryByRole('button', { name: strings.rename })).toBeNull()
    for (const name of ['Kind', 'Merge Ingredient', 'Delete Ingredient']) expect(screen.queryByRole('region', { name })).toBeNull()
  })
  it('renames in a sheet: the typed name goes to the hook', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Rename Garlic' }))
    const dialog = screen.getByRole('dialog', { name: 'Rename Garlic' })
    const field = within(dialog).getByRole('textbox', { name: strings.nameLabel })
    await userEvent.clear(field)
    await userEvent.type(field, 'Garlic bulb')
    await userEvent.click(within(dialog).getByRole('button', { name: strings.saveName }))
    expect(hook.rename).toHaveBeenCalledWith('Garlic bulb')
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename Garlic' })).toBeNull())
  })
  it('shows a duplicate-name error at the Name field of the Rename sheet, and keeps the sheet open', async () => {
    hook.rename.mockRejectedValueOnce(new ApiError(409, 'name_taken', 'exists'))
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Rename Garlic' }))
    const dialog = screen.getByRole('dialog', { name: 'Rename Garlic' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: strings.nameLabel }), 'x')
    await userEvent.click(within(dialog).getByRole('button', { name: strings.saveName }))
    expect(await within(dialog).findByText(strings.nameTaken)).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: strings.nameLabel })).toHaveAttribute('aria-invalid', 'true')
  })
  it('removes a conversion at once (no confirm): the hook is asked, and an Undo toast follows', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: strings.removeConversion('clove') }))
    expect(hook.removeConversion).toHaveBeenCalledWith('clove')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('1 clove removed')).toBeInTheDocument()
  })
  it('lets the Base Unit be chosen in Keeping while nothing uses the Ingredient; it is saved with Save changes, in one save', async () => {
    setup()
    await userEvent.click(screen.getByRole('radio', { name: 'ml' }))
    expect(hook.setBaseUnit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(hook.save).toHaveBeenCalledWith({ baseUnit: 'ml' })
    const menu = await openMore()
    expect(within(menu).getByRole('menuitem', { name: strings.deleteIngredient })).not.toHaveAttribute('aria-disabled', 'true')
  })
  it('locks the Base Unit and Delete while referenced', async () => {
    hook.referenceCount = 3
    hook.ingredient = { ...base, references: { 'recipe lines': 3 } }
    setup()
    expect(screen.getByText("Used in 3 places, so it can't change")).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'ml' })).toBeNull()
    const menu = await openMore()
    const del = within(menu).getByRole('menuitem', { name: strings.deleteIngredient })
    expect(del).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(del)
    expect(screen.queryByRole('dialog', { name: /Delete/ })).toBeNull()
  })
  it('Delete is a confirm: Cancel is focused, the lead names what uses it, and confirming deletes and returns to the list', async () => {
    setup()
    await userEvent.click(within(await openMore()).getByRole('menuitem', { name: strings.deleteIngredient }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete Garlic?' })
    expect(dialog).toHaveTextContent('It is on no Recipe, Product or Shopping List.')
    expect(dialog).toHaveTextContent("Nothing else changes. This can't be undone.")
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull()
    expect(hook.remove).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: strings.deleteIngredient }))
    expect(hook.remove).toHaveBeenCalled()
    expect(await screen.findByText('list page')).toBeInTheDocument()
  })
  it('opens the merge sheet for this Ingredient from More', async () => {
    setup()
    await userEvent.click(within(await openMore()).getByRole('menuitem', { name: strings.mergeInto }))
    expect(screen.getByText('merge sheet for 7')).toBeInTheDocument()
  })
  it('handles an unknown id', () => {
    hook.ingredient = undefined
    hook.error = new ApiError(404, 'not_found', 'nope')
    setup()
    expect(screen.getByText(strings.notFoundTitle)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: strings.title })).toHaveAttribute('href', '/ingredients')
  })
  it('shows a loading state, not "does not exist", while the Ingredient loads', () => {
    hook.ingredient = undefined
    hook.isLoading = true
    setup()
    expect(screen.getByText(strings.loading)).toBeInTheDocument()
    expect(screen.queryByText(strings.notFoundTitle)).not.toBeInTheDocument()
  })
  it('shows a failure with Try again (B9-20), not "does not exist", when the load fails for another reason', () => {
    hook.ingredient = undefined
    hook.error = new ApiError(500, 'server_error', 'boom')
    setup()
    expect(alerts()[0]!).toHaveTextContent(strings.itemError)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText(strings.notFoundTitle)).not.toBeInTheDocument()
  })
  it('groups its details into Bento tiles', () => {
    setup()
    expect(screen.getByRole('group', { name: strings.detailsLabel })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: strings.conversionsTitle })).toHaveClass('tile')
    expect(screen.getByRole('region', { name: 'Keeping' })).toHaveClass('tile')
  })
})
