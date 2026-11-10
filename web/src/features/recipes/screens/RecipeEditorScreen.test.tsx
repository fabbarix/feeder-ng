import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown>, upload: vi.fn() }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({
  useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }),
}))
vi.mock('../hooks/usePhotoUpload', () => ({ usePhotoUpload: () => ({ upload: h.upload, uploading: false, error: null }) }))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const view = (path = '/recipes/new') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/recipes/new" element={<RecipeEditorScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

beforeEach(() => {
  h.editor = {
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
  it('has a section per concern: Details, Photo, Ingredients, Steps', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: 'New Recipe' })).toBeInTheDocument()
    for (const name of ['Photo', 'Ingredients', 'Steps']) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
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
    h.editor = { ...h.editor, unitPrompt: { field: 'lines[0].unit', lineIndex: 0, useRef: null, ingredientId: 7, ingredientName: 'garlic', unit: 'head', baseUnit: 'g' } }
    view()
    expect(screen.getByRole('dialog', { name: 'Unit Conversion needed' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Amount in g' }), '50')
    await userEvent.click(screen.getByRole('button', { name: 'Save Unit Conversion' }))
    expect(h.editor.answerUnitPrompt).toHaveBeenCalledWith(50)
    expect(await screen.findByTestId('where')).toHaveTextContent('/recipes/11')
  })

  it('shows the Skeleton while an existing Recipe loads', async () => {
    h.editor = { ...h.editor, isLoading: true }
    view()
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(await screen.findByRole('status', {}, { timeout: 1500 })).toHaveAttribute('aria-busy', 'true')
  })

  it('has a photo zone for the Recipe and one for each Step', () => {
    const { container } = view()
    expect(container.querySelectorAll('input[type=file]')).toHaveLength(2)
  })
})
