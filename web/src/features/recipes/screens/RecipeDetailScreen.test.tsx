import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { cookRecipePath } from '../../cook'
import { garlic, recipe } from '../fixtures.test-helper'
import { household, prefs } from '../household.test-helper'

const h = vi.hoisted(() => ({
  recipe: {} as Record<string, unknown>,
  household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences,
}))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic]]), isLoading: false }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const Where = () => {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
const view = (entry = '/recipes/3') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ConfirmProvider>
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
  h.recipe = { recipe: recipe(), isLoading: false, error: null, setArchived: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) }
  vi.spyOn(window, 'confirm').mockImplementation(() => {
    throw new Error('window.confirm is native UI')
  })
})

describe('RecipeDetailScreen: layout', () => {
  it('has the Recipe name as its h1, an Edit IconButton and the metric tiles', async () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'Roast tray' })).toBeInTheDocument()
    expect(screen.getByText('4 portions per Batch')).toBeInTheDocument()
    expect(screen.getByText('+ 4 h ahead')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes/3/edit')
  })
  it('shows the error state with the shared primitive', () => {
    h.recipe = { ...h.recipe, recipe: undefined, isLoading: false, error: new Error('x'), refetch: vi.fn() }
    view()
    expect(screen.getByRole('alert')).toHaveTextContent('The Recipe could not be loaded.')
  })
  it('the error state keeps a PageHeader, and Try again calls onRetry (refetch)', async () => {
    const refetch = vi.fn()
    h.recipe = { ...h.recipe, recipe: undefined, isLoading: false, error: new Error('x'), refetch }
    view()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})

describe('RecipeDetailScreen: Cook / Batch entry (B2)', () => {
  it('starts Cook Mode for one Batch by default', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(screen.getByTestId('where').textContent).toBe(cookRecipePath(3, 1))
  })
  it('starts Cook Mode with the chosen Batch count', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Batches' }))
    await userEvent.click(screen.getByRole('button', { name: 'Increase Batches' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(screen.getByTestId('where').textContent).toBe(cookRecipePath(3, 3))
    expect(cookRecipePath(3, 3)).toBe('/cook/recipe/3?batches=3')
  })
})

describe('RecipeDetailScreen: delete and archive (ConfirmDialog, no window.confirm)', () => {
  const openDelete = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' })) // R2-1 (G-01): a Menu, not a sheet
  }
  it('asks in a dialog with three choices, then deletes', async () => {
    view()
    await openDelete()
    const dialog = await screen.findByRole('dialog', { name: 'Delete Roast tray?' })
    expect(dialog).toHaveTextContent('Archive keeps it for history.')
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(h.recipe.remove).toHaveBeenCalledOnce()
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes')
  })
  it('archives instead on request', async () => {
    view()
    await openDelete()
    await userEvent.click(await screen.findByRole('button', { name: 'Archive instead' }))
    expect(h.recipe.setArchived).toHaveBeenCalledWith(true)
    expect(h.recipe.remove).not.toHaveBeenCalled()
  })
  it('keeps the Recipe on Cancel', async () => {
    view()
    await openDelete()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(h.recipe.remove).not.toHaveBeenCalled()
  })
  it('archives from the overflow without a dialog', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(h.recipe.setArchived).toHaveBeenCalledWith(true)
  })
})

const preferences = () => screen.getByRole('heading', { level: 2, name: 'Preferences' }).closest('section') as HTMLElement

describe('RecipeDetailScreen: preferences of the whole Household (PT)', () => {
  it('shows the preferences as a table in the Preferences Tile, with no Member select', () => {
    view()
    expect(within(preferences()).getByRole('table', { name: 'Preferences for Roast tray' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Preferences for' })).toBeNull()
    expect(screen.queryByText('Choose a Member to set preferences for.')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Your preferences' })).toBeNull()
  })
  it('has a row per Member, the Member linked to the signed-in User first and marked You', () => {
    h.household = household({ meUserId: 11, members: [{ id: 1, name: 'Anna', colour: '#fff', avatar: '', userId: 10 }, { id: 2, name: 'Ben', colour: '#fff', avatar: '', userId: 11 }] })
    view()
    const names = within(preferences()).getAllByRole('rowheader').map((r) => /Anna|Ben/.exec(r.textContent ?? '')![0])
    expect(names).toEqual(['Ben', 'Anna'])
    expect(within(within(preferences()).getByRole('rowheader', { name: /Ben/ })).getByText('You')).toBeInTheDocument()
  })
  it('shows each Member\'s own state for this Recipe', () => {
    h.household = household({ prefsByMember: { 1: prefs(1, { recipes: { '3': 'favourite' } }), 2: prefs(2, { recipes: { '3': 'exclusion', '4': 'dislike' } }) } })
    view()
    expect(screen.getByRole('button', { name: 'Anna: Favourite' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ben: Exclusion' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ben: Dislike' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('saves a tap for that Member and Recipe through the hook', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Ben: Dislike' }))
    expect(h.household.toggleRecipe).toHaveBeenCalledWith(2, 3, 'dislike')
  })
  it('shows an Exclusion via an Ingredient of this Recipe as read-only "via garlic"', () => {
    h.household = household({ prefsByMember: { 1: prefs(1), 2: prefs(2, { excludedIngredients: [7] }) } })
    view()
    expect(screen.queryByRole('button', { name: 'Ben: Exclusion' })).toBeNull()
    expect(screen.getByRole('row', { name: /Ben/ })).toHaveTextContent('Excluded via garlic')
  })
  it('ignores an Ingredient the Recipe does not have', () => {
    h.household = household({ prefsByMember: { 1: prefs(1), 2: prefs(2, { excludedIngredients: [99] }) } })
    view()
    expect(screen.getByRole('button', { name: 'Ben: Exclusion' })).toBeInTheDocument()
  })
  it('highlights and scrolls to the row a #preference-member-<id> link points at', () => {
    view('/recipes/3#preference-member-2')
    expect(screen.getByRole('row', { name: /Ben/ })).toHaveAttribute('data-highlighted', 'true')
    expect(screen.getByRole('row', { name: /Anna/ })).not.toHaveAttribute('data-highlighted', 'true')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
  it('shows an ErrorState with Try again in the Tile when the preferences fail to load', async () => {
    h.household = household({ isError: true, prefsByMember: {} })
    view()
    await userEvent.click(within(preferences()).getByRole('button', { name: 'Try again' }))
    expect(h.household.refetch).toHaveBeenCalledOnce()
  })
  it('offers an Admin Add Members when the Household has none', () => {
    h.household = household({ members: [], prefsByMember: {}, isAdmin: true })
    view()
    expect(within(preferences()).getByRole('link', { name: 'Add Members' })).toBeInTheDocument()
  })
})

describe('RecipeDetailScreen: Who excludes garlic? (PT)', () => {
  it('has an "Exclusions for garlic" button on the Ingredient line and no Exclusion toggle of its own', () => {
    view()
    expect(screen.getByRole('button', { name: 'Exclusions for garlic' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exclude garlic' })).toBeNull()
  })
  it('shows the Avatars of the Members who exclude garlic on the line', () => {
    h.household = household({ prefsByMember: { 1: prefs(1), 2: prefs(2, { excludedIngredients: [7] }) } })
    view()
    const line = screen.getByRole('button', { name: 'Exclusions for garlic' }).closest('.ingredient-lines__row') as HTMLElement
    expect(within(line).getByRole('img', { name: 'Ben' })).toBeInTheDocument()
    expect(within(line).queryByRole('img', { name: 'Anna' })).toBeNull()
  })
  it('opens a Dialog "Who excludes garlic?" with a toggle per Member, and closes on Escape', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Exclusions for garlic' }))
    const dialog = await screen.findByRole('dialog', { name: 'Who excludes garlic?' })
    expect(within(dialog).getByRole('button', { name: 'Anna: excludes garlic' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(dialog).getByRole('button', { name: 'Ben: excludes garlic' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('saves a toggle in the Dialog for that Member and Ingredient', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Exclusions for garlic' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Ben: excludes garlic' }))
    expect(h.household.toggleIngredient).toHaveBeenCalledWith(2, 7)
  })
  it('uses no native confirm, alert or prompt', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => { throw new Error('native UI') })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Exclusions for garlic' }))
    expect(alert).not.toHaveBeenCalled()
  })
})

// CRS E2: the screen reads the household Courses; these tests do not care which.
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
