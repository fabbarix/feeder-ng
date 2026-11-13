import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../../lib/baseRecipes/test-utils'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft, type LineDraft, type RecipeDraft } from '../lib/draft'
import type { IngredientRef } from '../types'

// BR-D round 3: the kind switch applies on Save. (Round 2 header: the editor's link paths that the first round left open: convert, take-over, plain-Ingredient picker, Unit Conversion prompt. (First round: the editor screen wires the Base recipe switch, the line actions, the take-over ask, the refusals and the bulk link sheet.)
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



const savedPlannable = { name: 'Pesto', yield: '4', lines: [], steps: [] }
const stored = (kind: 'plannable' | 'base') => ({ storedKind: kind })

describe('RecipeEditorScreen: the kind switch applies on Save', () => {
  it('turning it on changes the draft only: no dry run, no to-base, no dialog', async () => {
    const api = mockApi({})
    h.editor = editorOf(savedPlannable, stored('plannable'))
    view('/recipes/4/edit')
    await userEvent.click(screen.getByRole('switch', { name: 'Base recipe' }))
    await waitFor(() => expect(h.editor.setDraft).toHaveBeenCalled())
    expect(h.change.turnOn).not.toHaveBeenCalled()
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('Save on a saved Recipe that became a Base recipe asks first (turnOn), then saves, in that order', async () => {
    mockApi({})
    const order: string[] = []
    h.change.turnOn = vi.fn(async () => (order.push('turnOn'), 'done' as const))
    h.editor = editorOf({ ...savedPlannable, baseRecipe: true, yieldUnit: 'portion' }, { ...stored('plannable'), save: vi.fn(async () => (order.push('save'), { id: 4, baseRecipe: true, baseIngredientId: 30 })) })
    view('/recipes/4/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await waitFor(() => expect(order).toEqual(['turnOn', 'save']))
    expect(h.change.turnOn).toHaveBeenCalledWith({ name: 'Pesto', yield: 4, yieldUnit: 'portion' })
  })

  it('Cancel in the confirm saves nothing and leaves the screen as it is', async () => {
    mockApi({})
    h.change.turnOn = vi.fn().mockResolvedValue('cancelled')
    h.editor = editorOf({ ...savedPlannable, baseRecipe: true, yieldUnit: 'portion' }, stored('plannable'))
    view('/recipes/4/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await waitFor(() => expect(h.change.turnOn).toHaveBeenCalled())
    expect(h.editor.save).not.toHaveBeenCalled()
    expect(screen.queryByTestId('where')).toBeNull()
  })

  it('a failed change saves nothing and shows its words', async () => {
    mockApi({})
    h.change.turnOn = vi.fn().mockResolvedValue('failed')
    h.change.error = 'A Ready Meal cannot be a Base recipe.'
    h.editor = editorOf({ ...savedPlannable, baseRecipe: true, yieldUnit: 'portion' }, stored('plannable'))
    view('/recipes/4/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(await screen.findByText('A Ready Meal cannot be a Base recipe.')).toBeInTheDocument()
    expect(h.editor.save).not.toHaveBeenCalled()
  })

  it('Save asks once, even when pressed twice quickly (no race)', async () => {
    mockApi({})
    let release: (v: 'done') => void = () => {}
    h.change.turnOn = vi.fn(() => new Promise<'done'>((r) => (release = r)))
    h.editor = editorOf({ ...savedPlannable, baseRecipe: true, yieldUnit: 'portion' }, stored('plannable'))
    view('/recipes/4/edit')
    const save = screen.getByRole('button', { name: 'Save Recipe' })
    await userEvent.click(save)
    await userEvent.click(save)
    release('done')
    await waitFor(() => expect(h.editor.save).toHaveBeenCalledTimes(1))
    expect(h.change.turnOn).toHaveBeenCalledTimes(1)
  })

  it('turning a Base recipe back asks turnOff on Save with its Yield; nothing happens on the toggle', async () => {
    mockApi({})
    h.editor = editorOf({ name: 'Béchamel', yield: '4', baseRecipe: false, yieldUnit: '', lines: [], steps: [] }, stored('base'))
    view('/recipes/2/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await waitFor(() => expect(h.change.turnOff).toHaveBeenCalledWith({ name: 'Béchamel', yield: 4 }))
  })

  it('a Recipe whose kind did not change never calls the kind hook on Save', async () => {
    mockApi({})
    h.editor = editorOf(savedPlannable, stored('plannable'))
    view('/recipes/4/edit')
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    await waitFor(() => expect(h.editor.save).toHaveBeenCalled())
    expect(h.change.turnOn).not.toHaveBeenCalled()
    expect(h.change.turnOff).not.toHaveBeenCalled()
  })
})
