import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({
  useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }),
}))
vi.mock('../../../ui', async (orig) => ({
  ...(await orig<object>()),
  ImagePicker: (await import('../../../ui/ImagePicker/fake.test-helper')).FakeImagePicker,
}))

import { RecipeEditorScreen } from './RecipeEditorScreen'
import { EditorRouter, safeEditorFields } from './RecipeEditorScreen.safe.harness.test-helper'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const view = (path = '/recipes/new') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditorRouter initialEntries={[path]}>
          <Route path="/recipes/new" element={<RecipeEditorScreen />} />
          <Route path="*" element={<Where />} />
      </EditorRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  h.editor = {
    ...safeEditorFields(),
    draft: {
      ...emptyDraft(), name: 'Aioli',
      lines: [{ key: 'l1', ingredientId: 7, ingredientName: 'garlic', quantity: '3', unit: 'clove', optional: false, note: '' }],
      steps: [{ key: 's1', text: 'Crush', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '' }],
    },
    setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
    save: vi.fn().mockResolvedValue({ id: 11 }), answerUnitPrompt: vi.fn().mockResolvedValue({ id: 11 }), dismissUnitPrompt: vi.fn(),
    addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(),
  }
})

describe('RecipeEditorScreen', () => {
  // B9-37 (RX-02): Recipe (Name, the Photo button, Kind), Ingredients, Steps, then the closed "Description and source" and "Planning".
  it('has a section per concern: Recipe, Ingredients, Steps, Description and source, Planning', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'New Recipe' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recipe' })).toContainElement(screen.getByRole('button', { name: /^Photo of the Recipe/ }))
    for (const name of ['Ingredients', 'Steps']) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    for (const name of [/^Description and source/, /^Planning/]) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded')
  })

  it('uses no native select, checkbox, file or search control (primitives only)', () => {
    view()
    // Checkbox and FileDrop keep their input inside the primitive; nothing else may be a pickable native input.
    expect(document.querySelector('select')).toBeNull()
    for (const input of document.querySelectorAll('input[type=checkbox]')) expect(input.closest('.checkbox')).not.toBeNull()
    for (const input of document.querySelectorAll('input[type=file]')) expect(input.closest('.file-drop')).not.toBeNull()
    expect(document.querySelector('input[type=search], input[type=number], input[type=date], input[type=time]')).toBeNull()
    expect(screen.queryAllByRole('combobox').length).toBeGreaterThan(0)
  })

  it('saves from the sticky footer and goes to the new Recipe', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(h.editor.save).toHaveBeenCalledOnce()
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/11')
  })

  it('opens the inline Unit Conversion prompt when the server asks, and answers it', async () => {
    h.editor = {
    ...safeEditorFields(), ...h.editor, unitPrompt: { field: 'lines[0].unit', lineIndex: 0, useRef: null, ingredientId: 7, ingredientName: 'garlic', unit: 'head', baseUnit: 'g' } }
    view()
    expect(screen.getByRole('dialog', { name: 'Unit Conversion needed' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Amount in g' }), '50')
    await userEvent.click(screen.getByRole('button', { name: 'Save Unit Conversion' }))
    expect(h.editor.answerUnitPrompt).toHaveBeenCalledWith(50)
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/11')
  })

  it('shows the Skeleton while an existing Recipe loads', async () => {
    h.editor = { ...safeEditorFields(), ...h.editor, isLoading: true }
    view()
    expect(screen.queryByText('Loading…')).toBeNull()
    // B9-31: the ToastProvider (the screen now shows Undo toasts) adds its own status live region; the Skeleton is the busy one.
    const statuses = await screen.findAllByRole('status', {}, { timeout: 1500 })
    expect(statuses.filter((el) => !el.classList.contains('toast-live'))[0]).toHaveAttribute('aria-busy', 'true')
  })

  // B9-37 (RX-02): no picker is drawn until it is asked for: the Recipe's opens from its Photo button, a Step's after "Add Photo".
  it('has an image picker for the Recipe and one for each Step, each drawn when asked for', async () => {
    view()
    expect(screen.queryAllByTestId('fake-image-picker')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: /^Photo of the Recipe/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Add Photo( to Step \d+)?$/ }))
    expect(screen.getAllByTestId('fake-image-picker')).toHaveLength(2)
  })
})

// CRS E2: the screen reads the household Courses; these tests do not care which.
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
