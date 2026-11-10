import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { garlic, recipe } from '../fixtures.test-helper'

const h = vi.hoisted(() => ({
  recipe: {} as Record<string, unknown>,
  prefs: {} as Record<string, unknown>,
  picker: {} as Record<string, unknown>,
  prefsCalledWith: [] as unknown[],
}))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useRecipePreferences', () => ({
  useRecipePreferences: (memberId?: number) => {
    h.prefsCalledWith.push(memberId)
    return h.prefs
  },
}))
vi.mock('../hooks/useMemberPicker', () => ({ useMemberPicker: () => h.picker }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic]]), isLoading: false }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const Where = () => {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
const view = () =>
  render(
    <MemoryRouter initialEntries={['/recipes/3']}>
      <ConfirmProvider>
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  h.prefsCalledWith = []
  h.recipe = { recipe: recipe(), isLoading: false, error: null, setArchived: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) }
  h.prefs = {
    stateOf: () => 'none', isExcluded: () => false, toggleRecipe: vi.fn(), toggleIngredient: vi.fn(), noMember: false, isLoading: false,
  }
  h.picker = { members: [{ id: 1, name: 'Anna' }, { id: 2, name: 'Ben' }], selectedId: 1, memberId: undefined, select: vi.fn(), isLoading: false }
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
  it('shows the loading and error states with the shared primitives', () => {
    h.recipe = { ...h.recipe, recipe: undefined, isLoading: false, error: new Error('x') }
    view()
    expect(screen.getByRole('alert')).toHaveTextContent('The Recipe could not be loaded.')
  })
})

describe('RecipeDetailScreen: Cook / Batch entry (B2)', () => {
  it('starts Cook Mode for one Batch by default', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/cook/recipe/3?batches=1')
  })
  it('starts Cook Mode with the chosen Batch count', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Batches' }))
    await userEvent.click(screen.getByRole('button', { name: 'Increase Batches' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start Cook Mode' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/cook/recipe/3?batches=3')
  })
})

describe('RecipeDetailScreen: delete and archive (ConfirmDialog, no window.confirm)', () => {
  const openDelete = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(h.recipe.setArchived).toHaveBeenCalledWith(true)
  })
})

describe('RecipeDetailScreen: preferences for a chosen Member (G1)', () => {
  it('shows the Member picker above the Favourite / Dislike / Exclusion toggles', () => {
    view()
    expect(screen.getByRole('combobox', { name: 'Preferences for' })).toHaveTextContent('Anna')
    expect(screen.getByRole('button', { name: 'Favourite' })).toBeEnabled()
  })
  it('loads the preferences of the picked Member (and none explicit by default)', () => {
    h.picker = { ...h.picker, selectedId: 2, memberId: 2 }
    view()
    expect(h.prefsCalledWith.at(-1)).toBe(2)
  })
  it('picking a Member goes to the picker hook', async () => {
    view()
    await userEvent.click(screen.getByRole('combobox', { name: 'Preferences for' }))
    await userEvent.click(screen.getByRole('option', { name: 'Ben' }))
    expect(h.picker.select).toHaveBeenCalled()
  })
  it('without a linked Member and no pick, asks to choose one and disables the toggles', () => {
    h.prefs = { ...h.prefs, noMember: true }
    h.picker = { ...h.picker, selectedId: null }
    view()
    expect(screen.getByText('Choose a Member to set preferences for.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Favourite' })).toBeDisabled()
  })
})
