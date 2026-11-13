import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../../lib/baseRecipes/test-utils'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft, type LineDraft, type RecipeDraft } from '../lib/draft'
import type { IngredientRef } from '../types'

// BR-D round 4: the Needed at default shown beside an override is the server's neededAtDefault; the editor does not work it out from the Steps.
const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useBaseRecipeChange', () => ({ useBaseRecipeChange: () => ({ turnOn: vi.fn(), turnOff: vi.fn(), error: null }) }))
const bechRef: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour], [30, bechRef]]), isLoading: false }) }))
vi.mock('../../../ui', async (orig) => ({ ...(await orig<object>()), ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={['/recipes/new']}>
            <Routes>
              <Route path="/recipes/new" element={<RecipeEditorScreen />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
const step = (key: string, text: string) => ({ key, text, kind: 'active' as const, durationMinutes: '10', leadTimeMinutes: '', after: [], uses: [], image: '' })
// The Step texts mention neither the Base recipe nor its Ingredient: a client rule would answer "the first Step"; the server says Step 3.
const steps = [step('s0', 'Boil the pasta'), step('s1', 'Fry the mince'), step('s2', 'Assemble and bake')]
const baseLine = (over: Partial<LineDraft> = {}): LineDraft => ({
  key: 'l2', ingredientId: 30, ingredientName: 'Béchamel', quantity: '500', unit: 'ml', optional: false, note: '', baseRecipeId: 3, baseRecipeName: 'Béchamel',
  linkedFromIngredientId: 5, neededAtStep: null, neededAtDefault: 2, ...over,
})
const editorOf = (line: LineDraft) => ({
  draft: { ...emptyDraft(), name: 'Lasagne', lines: [line], steps } as RecipeDraft,
  setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null, save: vi.fn(), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(),
  addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(), moveLine: vi.fn(),
  takeOverAsk: null, answerTakeOver: vi.fn(), cancelTakeOver: vi.fn(), refusal: null, linkLine: vi.fn(), unlinkLine: vi.fn(),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockApi({})
})

describe('RecipeEditorScreen: Needed at default from the server', () => {
  it('marks the server\'s default Step "(default)" and shows it on the chip while there is no override', async () => {
    h.editor = editorOf(baseLine())
    view()
    await userEvent.click(screen.getByRole('button', { name: /Needed at Step 3/ }))
    expect(screen.getByText('Step 3: Assemble and bake (default)')).toBeInTheDocument()
    expect(screen.queryByText(/^Step 1: Boil the pasta.*\(default\)/)).toBeNull()
  })

  it('an override shows its Step on the chip and keeps the mark on the server\'s default', async () => {
    h.editor = editorOf(baseLine({ neededAtStep: 1 }))
    view()
    await userEvent.click(screen.getByRole('button', { name: /Needed at Step 2/ }))
    expect(screen.getByText('Step 3: Assemble and bake (default)')).toBeInTheDocument()
  })

  it('choosing the default sends null (back to the default)', async () => {
    h.editor = editorOf(baseLine({ neededAtStep: 1 }))
    view()
    await userEvent.click(screen.getByRole('button', { name: /Needed at Step 2/ }))
    await userEvent.click(screen.getByText('Step 3: Assemble and bake (default)'))
    expect(h.editor.updateLine).toHaveBeenCalledWith('l2', { neededAtStep: null })
  })

  it('without a server default (a line just linked, not saved) no Step is marked "(default)"', async () => {
    h.editor = editorOf(baseLine({ neededAtDefault: null }))
    view()
    await userEvent.click(screen.getByRole('button', { name: /Before you start|Needed at Step/ }))
    expect(screen.queryByText(/\(default\)/)).toBeNull()
  })
})
