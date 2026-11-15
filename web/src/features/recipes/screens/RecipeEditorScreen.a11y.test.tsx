// B9-31 (known items from earlier reviews that are behaviour): every combobox on /recipes/:id/edit has an accessible name (one had
// none), the Ready Meal rename offer keeps focus on its confirm button (focus: 'confirm', a routine question that loses nothing), and
// the page title is reachable as the leave dialog's fallback focus target (it is an <h1>).
// Layout items (the text field under the sticky Save bar: B9-19's fix; the INGREDIENT caption over the handle) go to B9-37, not here.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, mount, nameField, ready, resetDraftStore } from './RecipeEditorScreen.safe.harness.test-helper'
import { recipe } from '../fixtures.test-helper'

vi.mock('../hooks/useIngredientRefs', async () => {
  const { garlic, flour } = await import('../fixtures.test-helper')
  return { useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }) }
})
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined, isLoading: false }) }))
vi.mock('../../../lib/courses/useCourses', async () => {
  const { courseChoices } = await import('../fixtures.test-helper')
  return { useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }
})
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 7, email: 'a@b.c', displayName: 'Anna', isAdmin: false, householdTimeZone: 'Europe/Rome' } }) }))
vi.mock('../../../lib/drafts/draftStore', async (orig) => {
  const real = await orig<typeof import('../../../lib/drafts/draftStore')>()
  // Read lazily: the harness imports the screen, which imports this module, so the harness is not loaded yet when this runs.
  return { ...real, openDraftStore: async () => (await import('./RecipeEditorScreen.safe.harness.test-helper')).drafts.store }
})
vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))

beforeEach(() => {
  resetDraftStore()
  api()
})

describe('the editor\'s comboboxes', () => {
  it('every combobox on /recipes/:id/edit has an accessible name', async () => {
    mount()
    await ready()
    const all = screen.getAllByRole('combobox')
    expect(all.length).toBeGreaterThan(0)
    const named = screen.getAllByRole('combobox', { name: /\S/ })
    const unnamed = all.filter((c) => !named.includes(c)).map((c) => c.outerHTML.slice(0, 160))
    expect(unnamed).toEqual([])
  })

  it('and on /recipes/new, with a line and a Step added', async () => {
    mount('/recipes/new')
    await screen.findByRole('textbox', { name: 'Name' })
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Step' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient use' }))
    const all = screen.getAllByRole('combobox')
    const named = screen.getAllByRole('combobox', { name: /\S/ })
    expect(all.filter((c) => !named.includes(c)).map((c) => c.outerHTML.slice(0, 160))).toEqual([])
  })
})

describe('the Ready Meal rename offer', () => {
  it('opens with focus on "Rename Ingredient" (focus: confirm), and "Keep the old name" still saves and leaves', async () => {
    const ready1 = recipe({
      id: 3, name: 'Chicken pie', updatedAt: '2026-11-14T10:00:00Z', readyMeal: true,
      lines: [{ ingredientId: 7, ingredient: 'Chicken pie', quantity: 1, unit: 'pack', optional: false, note: '', auto: true } as never],
      steps: [],
    })
    api({ 'GET /api/recipes/3': ready1, 'PUT /api/recipes/3': { ...ready1, name: 'Chicken pie deluxe' }, 'PATCH /api/ingredients/7': {} })
    const { router } = mount()
    await ready('Chicken pie')
    await userEvent.type(nameField(), ' deluxe')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename the Ingredient too?' })
    expect(dialog).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Ingredient' })).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: 'Leave without saving?' })).toBeNull() // Save never asks, and neither does its follow-up
    await userEvent.click(screen.getByRole('button', { name: 'Keep the old name' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/3'))
  })
})
