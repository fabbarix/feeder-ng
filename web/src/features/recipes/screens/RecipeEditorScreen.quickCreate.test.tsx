import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { ingredientsApi } from '../../ingredients/api'
import type { Ingredient } from '../../ingredients/types'
import { recipesApi } from '../api'
import { flour, garlic, recipe } from '../fixtures.test-helper'
import { recipeStrings } from '../strings'
import type { IngredientRef, Recipe } from '../types'

// The R14 acceptance scenarios of the Recipe editor, with the real hooks and the HTTP layer mocked.
vi.mock('../api', () => ({
  recipesApi: {
    ingredients: vi.fn(), tags: vi.fn(), create: vi.fn(), replace: vi.fn(), get: vi.fn(), saveConversion: vi.fn(), renameIngredient: vi.fn(),
  },
}))
vi.mock('../../ingredients/api', () => ({ ingredientsApi: { create: vi.fn(), search: vi.fn() } }))
vi.mock('../hooks/usePhotoUpload', () => ({ usePhotoUpload: () => ({ upload: vi.fn(), uploading: false, error: null }) }))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const rApi = vi.mocked(recipesApi)
const iApi = vi.mocked(ingredientsApi)

const pack: IngredientRef = { id: 21, name: 'Lasagne pack', baseUnit: 'piece', conversions: [] }
const saffron: Ingredient = { id: 99, name: 'Saffron', baseUnit: 'g', shelfLifeDays: null, conversions: [] }
const garlicFull: Ingredient = { id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: null, conversions: [{ unit: 'clove', toBase: 5 }] }

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
function view(path = '/recipes/new') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipes/new" element={<><RecipeEditorScreen /><Where /></>} />
          <Route path="/recipes/:id/edit" element={<><RecipeEditorScreen /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const setOnline = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
const where = () => screen.getByTestId('where')
const recipeName = () => screen.getByRole('textbox', { name: recipeStrings.fields.name })
const sheet = () => screen.getByRole('dialog', { name: 'New Ingredient' })

async function typeInPicker(text: string) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient' }))
  await userEvent.keyboard(text)
}

beforeEach(() => {
  vi.resetAllMocks()
  setOnline(true)
  rApi.ingredients.mockResolvedValue([garlic, flour, pack])
  rApi.tags.mockResolvedValue([])
  iApi.search.mockResolvedValue({ exact: null, suggestions: [] })
  iApi.create.mockResolvedValue(saffron)
})
afterEach(() => vi.restoreAllMocks())

describe('Quick create: the draft survives creating an Ingredient', () => {
  async function startDraft() {
    view()
    await userEvent.type(recipeName(), 'Paella')
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.lines.add }))
    await typeInPicker('saffron')
    await userEvent.click(await screen.findByRole('option', { name: 'Create Ingredient "saffron"' }))
  }

  it('opens the New Ingredient sheet over the editor with the typed name, without leaving the page', async () => {
    await startDraft()
    expect(within(sheet()).getByLabelText('Name')).toHaveValue('saffron')
    expect(where()).toHaveTextContent('/recipes/new')
  })
  it('creates the Ingredient, selects it on that line, closes the sheet and focuses the amount; the draft is intact', async () => {
    await startDraft()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Create Ingredient' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Ingredient' })).toBeNull())
    expect(iApi.create).toHaveBeenCalledWith({ name: 'saffron', baseUnit: 'g' })
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).toHaveTextContent('Saffron')
    expect(recipeName()).toHaveValue('Paella')
    expect(screen.getByLabelText(recipeStrings.lines.quantity)).toHaveFocus()
    expect(where()).toHaveTextContent('/recipes/new')
    expect(rApi.create).not.toHaveBeenCalled()
  })
  it('cancelling the sheet leaves the draft and the line exactly as they were', async () => {
    await startDraft()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Ingredient' })).toBeNull())
    expect(iApi.create).not.toHaveBeenCalled()
    expect(recipeName()).toHaveValue('Paella')
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).not.toHaveTextContent('Saffron')
  })
  it('a failed create keeps the sheet and the draft', async () => {
    iApi.create.mockRejectedValue(new ApiError(409, 'name_taken', 'exists'))
    await startDraft()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Create Ingredient' }))
    expect(await within(sheet()).findByText('An Ingredient with that name already exists')).toBeInTheDocument()
    // Not recipeName(): with the sheet open, its own "Name" field matches that query too.
    expect(screen.getByDisplayValue('Paella')).toBeInTheDocument()
  })
  it('the new Ingredient is used in the saved Recipe', async () => {
    rApi.create.mockResolvedValue({ id: 31 } as Recipe)
    await startDraft()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Create Ingredient' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Ingredient' })).toBeNull())
    await userEvent.type(screen.getByLabelText(recipeStrings.lines.quantity), '1')
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.save }))
    await waitFor(() => expect(rApi.create).toHaveBeenCalledOnce())
    expect(rApi.create.mock.calls[0]![0]).toMatchObject({ name: 'Paella', lines: [{ ingredientId: 99, quantity: 1, unit: 'g' }] })
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/31')
  })
})

describe('Quick create: near duplicates', () => {
  it('asks "Did you mean Garlic?" before creating a close name, and "Use garlic" selects the existing one', async () => {
    iApi.search.mockResolvedValue({ exact: null, suggestions: [{ ingredient: garlicFull, score: 0.9 }] })
    view()
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.lines.add }))
    await typeInPicker('garlik')
    await userEvent.click(await screen.findByRole('option', { name: 'Create Ingredient "garlik"' }))
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Create Ingredient' }))
    expect(await within(sheet()).findByText('Did you mean garlic?')).toBeInTheDocument()
    expect(iApi.create).not.toHaveBeenCalled()
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Use garlic' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Ingredient' })).toBeNull())
    expect(iApi.create).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox', { name: 'Ingredient' })).toHaveTextContent('garlic')
    expect(screen.getByLabelText(recipeStrings.lines.quantity)).toHaveFocus()
  })
})

describe('Quick create: offline', () => {
  it('shows Create Ingredient disabled with the reason and opens nothing', async () => {
    setOnline(false)
    view()
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.lines.add }))
    await typeInPicker('saffron')
    const row = await screen.findByRole('option', { name: /Create Ingredient "saffron"/ })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(row).toHaveTextContent(recipeStrings.quickCreate.offlineReason)
    await userEvent.click(row)
    expect(screen.queryByRole('dialog', { name: 'New Ingredient' })).toBeNull()
  })
})

describe('Quick create: the Unit Conversion prompt is reused', () => {
  const stored = recipe({ id: 3, name: 'Aioli', steps: [], lines: [{ ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: false, note: '' }] })
  it('keeps the line unit, says Feeder will ask, and Save opens the same prompt as for any unknown unit', async () => {
    rApi.get.mockResolvedValue(stored)
    rApi.ingredients.mockResolvedValue([garlic, flour])
    view('/recipes/3/edit')
    await screen.findByDisplayValue('Aioli')
    await typeInPicker('saffron')
    await userEvent.click(await screen.findByRole('option', { name: 'Create Ingredient "saffron"' }))
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Create Ingredient' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Ingredient' })).toBeNull())
    expect(screen.getByText(recipeStrings.lines.unitNeedsConversion('clove'))).toBeInTheDocument()
    rApi.replace.mockRejectedValue(new ApiError(422, 'unknown_unit', 'No', { field: 'lines[0].unit', ingredientId: 99, ingredient: 'Saffron', unit: 'clove', baseUnit: 'g' }))
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.save }))
    expect(await screen.findByRole('dialog', { name: 'Unit Conversion needed' })).toBeInTheDocument()
  })
})

describe('Ready Meal creates its Ingredient', () => {
  const tickReadyMeal = () => userEvent.click(screen.getByRole('checkbox', { name: new RegExp(recipeStrings.fields.readyMeal) }))

  it('shows the Ingredient to be added, with the helper, as the only line', async () => {
    view()
    await userEvent.type(recipeName(), 'Fish pie pack')
    await tickReadyMeal()
    expect(await screen.findByText(recipeStrings.readyMealIngredient.helper('Fish pie pack'))).toBeInTheDocument()
    expect(screen.getByText(recipeStrings.readyMealIngredient.newBadge)).toBeInTheDocument()
    expect(screen.queryByText(recipeStrings.lines.none)).toBeNull()
  })
  it('saves as a Ready Meal with no line, so the server creates the Ingredient', async () => {
    rApi.create.mockResolvedValue({ id: 40 } as Recipe)
    view()
    await userEvent.type(recipeName(), 'Fish pie pack')
    await tickReadyMeal()
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.save }))
    await waitFor(() => expect(rApi.create).toHaveBeenCalledOnce())
    expect(rApi.create.mock.calls[0]![0]).toMatchObject({ name: 'Fish pie pack', readyMeal: true, lines: [] })
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/40')
  })
  it('keeps the helper in step with the name', async () => {
    view()
    await tickReadyMeal()
    await userEvent.type(recipeName(), 'Soup')
    expect(await screen.findByText(recipeStrings.readyMealIngredient.helper('Soup'))).toBeInTheDocument()
  })
})

describe('Ready Meal reuses an existing Ingredient', () => {
  it('selects the same-name Ingredient on the line and says nothing about adding one', async () => {
    view()
    await userEvent.type(recipeName(), 'lasagne PACK')
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(recipeStrings.fields.readyMeal) }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Ingredient' })).toHaveTextContent('Lasagne pack'))
    expect(screen.queryByText(recipeStrings.readyMealIngredient.newBadge)).toBeNull()
    expect(screen.queryByText(/Feeder adds an Ingredient called/)).toBeNull()
    expect(screen.getByLabelText(recipeStrings.lines.quantity)).toHaveValue('1')
  })
  it('saves the existing Ingredient as the line, never a duplicate', async () => {
    rApi.create.mockResolvedValue({ id: 41 } as Recipe)
    view()
    await userEvent.type(recipeName(), 'Lasagne pack')
    await userEvent.click(screen.getByRole('checkbox', { name: new RegExp(recipeStrings.fields.readyMeal) }))
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.save }))
    await waitFor(() => expect(rApi.create).toHaveBeenCalledOnce())
    expect(rApi.create.mock.calls[0]![0]).toMatchObject({ readyMeal: true, lines: [{ ingredientId: 21, quantity: 1, unit: 'piece' }] })
  })
})

describe('Ready Meal: renaming the Recipe offers to rename its Ingredient', () => {
  const stored = recipe({
    id: 3, name: 'Lasagne pack', readyMeal: true, yield: 2, steps: [],
    lines: [{ ingredientId: 21, ingredient: 'Lasagne pack', quantity: 1, unit: 'piece', optional: false, note: '' }],
  })
  async function renameAndSave() {
    rApi.get.mockResolvedValue(stored)
    rApi.replace.mockResolvedValue({ ...stored, name: 'Big lasagne pack' })
    view('/recipes/3/edit')
    const name = await screen.findByDisplayValue('Lasagne pack')
    await userEvent.clear(name)
    await userEvent.type(name, 'Big lasagne pack')
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.save }))
  }

  it('asks after saving, before leaving the editor', async () => {
    await renameAndSave()
    const ask = await screen.findByRole('dialog', { name: recipeStrings.readyMealIngredient.renameTitle })
    expect(ask).toHaveTextContent(recipeStrings.readyMealIngredient.renameBody('Lasagne pack', 'Big lasagne pack'))
    expect(where()).toHaveTextContent('/recipes/3/edit')
  })
  it('"Rename Ingredient" renames it, then goes to the Recipe', async () => {
    rApi.renameIngredient.mockResolvedValue({ ...pack, name: 'Big lasagne pack' })
    await renameAndSave()
    await userEvent.click(await screen.findByRole('button', { name: recipeStrings.readyMealIngredient.renameConfirm }))
    await waitFor(() => expect(rApi.renameIngredient).toHaveBeenCalledWith(21, 'Big lasagne pack'))
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/3')
  })
  it('"Keep the old name" leaves the Ingredient alone and goes to the Recipe', async () => {
    await renameAndSave()
    await userEvent.click(await screen.findByRole('button', { name: recipeStrings.readyMealIngredient.renameKeep }))
    expect(rApi.renameIngredient).not.toHaveBeenCalled()
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/3')
  })
  it('does not ask when the Recipe is saved under the same name', async () => {
    rApi.get.mockResolvedValue(stored)
    rApi.replace.mockResolvedValue(stored)
    view('/recipes/3/edit')
    await screen.findByDisplayValue('Lasagne pack')
    await userEvent.click(screen.getByRole('button', { name: recipeStrings.save }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/3')
    expect(screen.queryByRole('dialog', { name: recipeStrings.readyMealIngredient.renameTitle })).toBeNull()
  })
})
