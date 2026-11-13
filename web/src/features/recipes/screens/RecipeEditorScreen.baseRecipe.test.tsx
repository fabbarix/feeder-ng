import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { candidateJSON, mockApi, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft, type LineDraft, type RecipeDraft } from '../lib/draft'
import type { IngredientRef } from '../types'

// BR-D: the editor screen wires the Base recipe switch, the line actions, the take-over ask, the refusals and the bulk link sheet.
const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown>, change: { turnOn: vi.fn(), turnOff: vi.fn(), error: null as string | null } }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useBaseRecipeChange', () => ({ useBaseRecipeChange: () => h.change }))
const bechRef: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
const plainBech: IngredientRef = { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] }
vi.mock('../hooks/useIngredientRefs', () => ({
  useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour], [30, bechRef], [5, plainBech]]), isLoading: false }),
}))
vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const view = (path = '/recipes/new') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/recipes/new" element={<RecipeEditorScreen />} />
              <Route path="/recipes/:id/edit" element={<RecipeEditorScreen />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )

const plainLine: LineDraft = { key: 'l1', ingredientId: 5, ingredientName: 'béchamel', quantity: '500', unit: 'ml', optional: false, note: '', linkedFromIngredientId: null }
const baseLine: LineDraft = { key: 'l2', ingredientId: 30, ingredientName: 'Béchamel', quantity: '500', unit: 'ml', optional: false, note: '', baseRecipeId: 3, baseRecipeName: 'Béchamel', linkedFromIngredientId: 5, neededAtStep: null }
const step = { key: 's1', text: 'Layer the lasagne', kind: 'active' as const, durationMinutes: '10', leadTimeMinutes: '', after: [], uses: [], image: '' }
const boil = { ...step, key: 's0', text: 'Boil the pasta' }
const editorOf = (draft: Partial<RecipeDraft>, over: Record<string, unknown> = {}) => ({
  draft: { ...emptyDraft(), name: 'Lasagne', lines: [plainLine], steps: [boil, step], ...draft },
  setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
  save: vi.fn().mockResolvedValue({ id: 11 }), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(),
  addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(), moveLine: vi.fn(),
  takeOverAsk: null, answerTakeOver: vi.fn().mockResolvedValue({ id: 11 }), cancelTakeOver: vi.fn(), refusal: null, linkLine: vi.fn(), unlinkLine: vi.fn(),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.change.turnOn = vi.fn().mockResolvedValue('done')
  h.change.turnOff = vi.fn().mockResolvedValue('done')
  h.change.error = null
  h.editor = editorOf({})
})

describe('RecipeEditorScreen: Base recipe switch', () => {
  it('asks the kind change hook first, then patches the draft; nothing is patched on Cancel', async () => {
    mockApi({})
    view()
    await userEvent.click(screen.getByRole('switch', { name: 'Base recipe' }))
    expect(h.change.turnOn).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lasagne' }))
    await waitFor(() => expect(h.editor.setDraft).toHaveBeenCalled())
    ;(h.editor.setDraft as ReturnType<typeof vi.fn>).mockClear()
    h.change.turnOn = vi.fn().mockResolvedValue('cancelled')
    await userEvent.click(screen.getByRole('switch', { name: 'Base recipe' }))
    expect(h.editor.setDraft).not.toHaveBeenCalled()
  })

  it('a Base recipe draft shows the Yield unit and no Courses', () => {
    mockApi({})
    h.editor = editorOf({ baseRecipe: true, yieldUnit: 'l', yield: '1', lines: [], courseIds: [] })
    view()
    expect(screen.getByRole('combobox', { name: 'Yield unit' })).toHaveTextContent('l')
    expect(screen.queryByRole('checkbox', { name: /Ready Meal/ })).toBeNull()
  })
})

describe('RecipeEditorScreen: line actions', () => {
  it('Link to a Base recipe: picks an existing Base recipe and links the draft line with its Ingredient', async () => {
    mockApi({
      'GET /api/recipes?kind=base': [summaryJSON({ id: 3, name: 'Béchamel' })], 'GET /api/recipes': [],
      'GET /api/recipes/3': { ...summaryJSON({ id: 3, name: 'Béchamel' }), baseIngredientId: 30, usedBy: [], lines: [] },
    })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Link to a Base recipe' }))
    const picker = await screen.findByRole('dialog', { name: 'Link to a Base recipe' })
    await userEvent.click(await within(picker).findByRole('option', { name: /^Béchamel,/ }))
    await waitFor(() => expect(h.editor.linkLine).toHaveBeenCalledWith('l1', { id: 3, name: 'Béchamel', ingredientId: 30 }))
    expect(screen.queryByRole('dialog', { name: 'Link to a Base recipe' })).toBeNull()
  })

  it('Use as a plain Ingredient: goes back to the Ingredient the line was linked from', async () => {
    mockApi({})
    h.editor = editorOf({ lines: [baseLine] })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Use as a plain Ingredient' }))
    expect(h.editor.unlinkLine).toHaveBeenCalledWith('l2', plainBech)
  })

  it('a Base recipe line has the Needed at chip, and changing it updates the line', async () => {
    mockApi({})
    h.editor = editorOf({ lines: [baseLine] })
    view()
    await userEvent.click(screen.getByRole('button', { name: /Before you start|Needed at Step/ }))
    await userEvent.click(screen.getByText(/^Step 2: Layer the lasagne/))
    expect(h.editor.updateLine).toHaveBeenCalledWith('l2', { neededAtStep: 1 })
  })
})

describe('RecipeEditorScreen: take-over ask and refusals', () => {
  const ask = { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 1, name: 'Lasagne' }], stockLots: 1, convertible: true }

  it('shows the take-over ask naming the Recipes and Stock; Yes and No answer it', async () => {
    mockApi({})
    h.editor = editorOf({ baseRecipe: true, name: 'Béchamel', yieldUnit: 'l', lines: [] }, { takeOverAsk: ask })
    view()
    const dialog = screen.getByRole('dialog', { name: 'Use the Ingredient béchamel for Béchamel?' })
    expect(within(dialog).getByText('Lasagne calls for it, and 1 Stock Lot of it is in the Pantry.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes' }))
    expect(h.editor.answerTakeOver).toHaveBeenCalledWith(true)
  })

  it('No answers false', async () => {
    mockApi({})
    h.editor = editorOf({ baseRecipe: true, name: 'Béchamel', yieldUnit: 'l', lines: [] }, { takeOverAsk: ask })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(h.editor.answerTakeOver).toHaveBeenCalledWith(false)
  })

  it('shows a cycle refusal as an alert with the path in words', () => {
    mockApi({})
    h.editor = editorOf({}, { refusal: 'Roux calls for Béchamel, which calls for Roux', errors: { 'lines.0': 'base_recipe_cycle' } })
    view()
    expect(screen.getByText('Roux calls for Béchamel, which calls for Roux')).toBeInTheDocument()
  })
})

describe('RecipeEditorScreen: bulk link after saving a Base recipe', () => {
  const saved = { id: 11, name: 'Béchamel', baseRecipe: true, baseIngredientId: 30, yieldUnit: 'l', yield: 1 }

  it('opens the list before leaving; Not now goes to the Base recipe', async () => {
    mockApi({ 'GET /api/recipes/11/link-candidates': { lines: [candidateJSON({ lineId: 2, recipeName: 'Lasagne' }), candidateJSON({ lineId: 3, recipeId: 12, recipeName: 'Moussaka' })] } })
    h.editor = editorOf({ baseRecipe: true, name: 'Béchamel', yieldUnit: 'l', lines: [] }, { save: vi.fn().mockResolvedValue(saved) })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(await screen.findByText('2 Recipes use an Ingredient named béchamel. Link them to this Base recipe?')).toBeInTheDocument()
    expect(screen.queryByTestId('where')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/11')
  })

  it('goes straight to the Base recipe when nothing can be linked', async () => {
    mockApi({ 'GET /api/recipes/11/link-candidates': { lines: [] } })
    h.editor = editorOf({ baseRecipe: true, name: 'Béchamel', yieldUnit: 'l', lines: [] }, { save: vi.fn().mockResolvedValue(saved) })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/11')
  })

  it('a plannable Recipe never looks for candidates', async () => {
    const api = mockApi({})
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/11')
    expect(api.calls.some((c) => c.path.includes('link-candidates'))).toBe(false)
  })
})
