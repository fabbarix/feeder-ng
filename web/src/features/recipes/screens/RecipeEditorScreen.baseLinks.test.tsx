import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, refusal, summaryJSON } from '../../../lib/baseRecipes/test-utils'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft, type LineDraft, type RecipeDraft } from '../lib/draft'
import type { IngredientRef } from '../types'

// BR-D round 2: the editor's link paths that the first round left open: convert, take-over, plain-Ingredient picker, Unit Conversion prompt. (First round: the editor screen wires the Base recipe switch, the line actions, the take-over ask, the refusals and the bulk link sheet.)
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


const choose = async (name: RegExp | string, key = 'Actions for béchamel') => {
  await userEvent.click(screen.getByRole('button', { name: key }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Link to a Base recipe' }))
  const picker = await screen.findByRole('dialog', { name: 'Link to a Base recipe' })
  await userEvent.click(await within(picker).findByRole('option', { name }))
}
const pickerRoutes = {
  'GET /api/recipes?kind=base': [],
  'GET /api/recipes': [{ ...summaryJSON({ id: 20, name: 'Pesto', baseRecipe: false, yieldUnit: null, yield: 4 }) }],
}
const pestoLine: LineDraft = { ...plainLine, ingredientName: 'pesto', ingredientId: 5 }
const plan = { plannedMeals: [{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', pinned: true, bought: false }], slotRules: [], leftovers: 0, preferences: 0 }

describe('RecipeEditorScreen: choose a Recipe you plan (convert)', () => {
  const routes = () => ({
    ...pickerRoutes,
    'POST /api/recipes/20/to-base?dryRun=1': plan,
    'POST /api/recipes/20/to-base': summaryJSON({ id: 20, name: 'Pesto', yield: 500, yieldUnit: 'ml', baseIngredientId: 40 }),
  })

  it('asks in a confirm that names what goes; Cancel changes and links nothing', async () => {
    const api = mockApi(routes())
    h.editor = editorOf({ lines: [pestoLine] })
    view()
    await choose(/^Pesto/, 'Actions for pesto')
    const dialog = await screen.findByRole('dialog', { name: 'Turn Pesto into a Base recipe?' })
    expect(within(dialog).getByText(/Tue 10 Nov Dinner \(Main, Pinned\)/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(h.editor.linkLine).not.toHaveBeenCalled()
    expect(api.callsTo('POST', '/api/recipes/20/to-base')).toEqual([])
  })

  it('Confirm turns it into a Base recipe (Yield from the line) and links the draft line to its Ingredient', async () => {
    const api = mockApi(routes())
    h.editor = editorOf({ lines: [pestoLine] })
    view()
    await choose(/^Pesto/, 'Actions for pesto')
    await userEvent.click(await screen.findByRole('button', { name: 'Turn into a Base recipe' }))
    await waitFor(() => expect(h.editor.linkLine).toHaveBeenCalledWith('l1', { id: 20, name: 'Pesto', ingredientId: 40 }))
    expect(api.callsTo('POST', '/api/recipes/20/to-base')[0]?.body).toEqual({ yield: 500, yieldUnit: 'ml' })
    expect(screen.queryByRole('dialog', { name: 'Link to a Base recipe' })).toBeNull()
  })

  it('shows no generic error for the convert choice', async () => {
    mockApi(routes())
    h.editor = editorOf({ lines: [pestoLine] })
    view()
    await choose(/^Pesto/, 'Actions for pesto')
    expect(screen.queryByText(/could not be loaded|went wrong/i)).toBeNull()
  })
})

describe('RecipeEditorScreen: new Base recipe from a line meets a same-name Ingredient', () => {
  const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 1, name: 'Lasagne' }], stockLots: 1, convertible: true })
  const created = { status: 201, json: summaryJSON({ id: 9, name: 'Béchamel', yield: 500, yieldUnit: 'ml', baseIngredientId: 30 }) }
  const run = (answered: Record<string, unknown> = {}) =>
    mockApi({
      ...pickerRoutes,
      'POST /api/recipes': (c: { body: unknown }) => ((c.body as { takeOver?: boolean }).takeOver === undefined ? ask : created),
      ...answered,
    })

  it('opens the take-over dialog (Yes / No) naming the Recipes and Stock, not a generic error', async () => {
    run()
    view()
    await choose('Add "Béchamel" as a new Base recipe')
    const dialog = await screen.findByRole('dialog', { name: 'Use the Ingredient béchamel for Béchamel?' })
    expect(within(dialog).getByText('Lasagne calls for it, and 1 Stock Lot of it is in the Pantry.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Yes' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'No' })).toBeInTheDocument()
    expect(screen.queryByText(/went wrong|could not/i)).toBeNull()
    expect(h.editor.linkLine).not.toHaveBeenCalled()
  })

  it.each([true, false])('answer %s creates it again with takeOver and links the draft line', async (yes) => {
    const api = run()
    view()
    await choose('Add "Béchamel" as a new Base recipe')
    await userEvent.click(await screen.findByRole('button', { name: yes ? 'Yes' : 'No' }))
    await waitFor(() => expect(h.editor.linkLine).toHaveBeenCalledWith('l1', { id: 9, name: 'Béchamel', ingredientId: 30 }))
    expect(api.callsTo('POST', '/api/recipes').at(-1)?.body).toMatchObject({ takeOver: yes, baseRecipe: true, name: 'Béchamel' })
  })

  it('Escape on the ask creates nothing and links nothing', async () => {
    const api = run()
    view()
    await choose('Add "Béchamel" as a new Base recipe')
    await screen.findByRole('dialog', { name: 'Use the Ingredient béchamel for Béchamel?' })
    await userEvent.keyboard('{Escape}')
    expect(h.editor.linkLine).not.toHaveBeenCalled()
    expect(api.callsTo('POST', '/api/recipes')).toHaveLength(1)
  })
})

describe('RecipeEditorScreen: Use as a plain Ingredient with nothing to go back to', () => {
  const takeOverLine: LineDraft = { ...baseLine, linkedFromIngredientId: null }
  const open = async () => {
    mockApi({ ...pickerRoutes, 'GET /api/recipes?kind=base': [summaryJSON({ id: 3, name: 'Béchamel' })] })
    h.editor = editorOf({ lines: [takeOverLine] })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Béchamel' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Use as a plain Ingredient' }))
  }

  it('opens the ordinary Ingredient picker, never the Base recipe picker', async () => {
    await open()
    const dialog = await screen.findByRole('dialog', { name: /Choose.*Ingredient/ })
    expect(within(dialog).getByRole('combobox', { name: 'Ingredient' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Link to a Base recipe' })).toBeNull()
    expect(h.editor.unlinkLine).not.toHaveBeenCalled()
  })

  it('offers plain Ingredients only (no Base recipe\'s) and turns the line into the chosen one', async () => {
    await open()
    const dialog = await screen.findByRole('dialog', { name: /Choose.*Ingredient/ })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Ingredient' }))
    expect(screen.queryByRole('option', { name: /Base recipe/ })).toBeNull()
    await userEvent.click(screen.getByRole('option', { name: /garlic/ }))
    expect(h.editor.unlinkLine).toHaveBeenCalledWith('l2', garlic)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Choose.*Ingredient/ })).toBeNull())
  })

  it('Cancel leaves the line as it is', async () => {
    await open()
    const dialog = await screen.findByRole('dialog', { name: /Choose.*Ingredient/ })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(h.editor.unlinkLine).not.toHaveBeenCalled()
  })
})

describe('RecipeEditorScreen: linking a line whose unit does not convert', () => {
  const jarLine: LineDraft = { ...plainLine, unit: 'jar', quantity: '2' }
  const routes = () => ({
    'GET /api/recipes?kind=base': [summaryJSON({ id: 3, name: 'Béchamel' })], 'GET /api/recipes': [],
    'GET /api/recipes/3': { ...summaryJSON({ id: 3, name: 'Béchamel' }), baseIngredientId: 30, usedBy: [], lines: [] },
    'PUT /api/ingredients/30/conversions/jar': {},
  })

  it('shows the Unit Conversion prompt for the Base recipe\'s Ingredient before the link, as the detail does', async () => {
    mockApi(routes())
    h.editor = editorOf({ lines: [jarLine] })
    view()
    await choose(/^Béchamel,/)
    const prompt = await screen.findByRole('dialog', { name: 'Unit Conversion needed' })
    expect(within(prompt).getByRole('spinbutton', { name: 'Amount in ml' })).toBeInTheDocument()
    expect(h.editor.linkLine).not.toHaveBeenCalled()
  })

  it('saves the conversion on the Base recipe\'s Ingredient, then links the line', async () => {
    const api = mockApi(routes())
    h.editor = editorOf({ lines: [jarLine] })
    view()
    await choose(/^Béchamel,/)
    await userEvent.type(await screen.findByRole('spinbutton', { name: 'Amount in ml' }), '400')
    await userEvent.click(screen.getByRole('button', { name: 'Save Unit Conversion' }))
    await waitFor(() => expect(h.editor.linkLine).toHaveBeenCalledWith('l1', { id: 3, name: 'Béchamel', ingredientId: 30 }))
    expect(api.callsTo('PUT', '/api/ingredients/30/conversions/jar')[0]?.body).toEqual({ toBase: 400 })
  })

  it('dismissing the prompt links nothing', async () => {
    mockApi(routes())
    h.editor = editorOf({ lines: [jarLine] })
    view()
    await choose(/^Béchamel,/)
    const prompt = await screen.findByRole('dialog', { name: 'Unit Conversion needed' })
    await userEvent.click(within(prompt).getByRole('button', { name: 'Cancel' }))
    expect(h.editor.linkLine).not.toHaveBeenCalled()
  })

  it('asks nothing when the unit converts (the Base Unit)', async () => {
    mockApi(routes())
    h.editor = editorOf({ lines: [plainLine] })
    view()
    await choose(/^Béchamel,/)
    await waitFor(() => expect(h.editor.linkLine).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Unit Conversion needed' })).toBeNull()
  })
})
