// R2-1 (E-01, L-03, L-02): the editor is one centred column of section cards with a section index, its actions are a StickyActionBar
// at the width of the Page, and the screen sets no width of its own.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Page } from '../../../ui'
import { flour, garlic } from '../fixtures.test-helper'
import { emptyDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../hooks/useIngredientRefs', () => ({
  useIngredientRefs: () => ({ byId: new Map([[7, garlic], [8, flour]]), isLoading: false }),
}))

import { RecipeEditorScreen } from './RecipeEditorScreen'

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/recipes/new']}>
        <Routes>
          <Route
            path="/recipes/new"
            element={
              <Page width="default">
                <RecipeEditorScreen />
              </Page>
            }
          />
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
    save: vi.fn().mockResolvedValue({ id: 11 }), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(),
    addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(),
  }
})

describe('editor layout', () => {
  it('is a layout wrapper holding the section index and the 840 px column', () => {
    const { container } = view()
    const layout = container.querySelector('.recipe-editor-layout')!
    expect(layout).not.toBeNull()
    expect(layout.querySelector(':scope > .recipe-editor__index')).not.toBeNull()
    expect(layout.querySelector(':scope > .recipe-editor')).not.toBeNull()
  })
  it('keeps the page header (title and breadcrumbs) inside the column, so it lines up with the cards', () => {
    const { container } = view()
    expect(container.querySelector('.recipe-editor')).toContainElement(screen.getByRole('heading', { level: 1, name: 'New Recipe' }))
  })
  it('has a section index named "Sections": Details, Photo, Ingredients, Steps', () => {
    view()
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Details', 'Photo', 'Ingredients', 'Steps'])
    for (const a of within(nav).getAllByRole('link')) {
      const target = document.getElementById(a.getAttribute('href')!.slice(1))
      expect(target, a.textContent ?? '').not.toBeNull()
    }
  })
  it('section cards: Details, Ingredients and Steps are named regions with the ids the index links to', () => {
    view()
    for (const [id, name] of [['recipe-section-details', 'Details'], ['recipe-section-ingredients', 'Ingredients'], ['recipe-section-steps', 'Steps']] as const) {
      const region = screen.getByRole('region', { name })
      expect(region.id).toBe(id)
      expect(region).toHaveClass('recipe-editor__section')
      expect(within(region).getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(document.getElementById('recipe-section-photo')).not.toBeNull()
  })
  it('captions the columns of the ingredient lines in a header row that assistive tech skips (the fields carry their own labels)', () => {
    const { container } = view()
    const head = container.querySelector('.recipe-editor__lines-head')!
    expect(head).toHaveAttribute('aria-hidden', 'true')
    expect(head.textContent).toMatch(/Ingredient.*Quantity.*Unit.*Note/)
  })
})

describe('editor actions: a StickyActionBar (L-03)', () => {
  it('is the group "Recipe actions", aligned to the form column, with Cancel then Save Recipe', () => {
    view()
    const bar = screen.getByRole('group', { name: 'Recipe actions' })
    expect(bar).toHaveClass('sticky-action-bar')
    expect(bar).toHaveAttribute('data-column', 'form')
    const buttons = within(bar).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Cancel', 'Save Recipe'])
    expect(bar.querySelector('.form-actions')).not.toBeNull()
  })
  it('sits in the Page body, outside the 840 px column, so its edges are the Page edges (guard P6)', () => {
    const { container } = view()
    const bar = container.querySelector('.sticky-action-bar')!
    expect(bar.closest('.page__body')).not.toBeNull()
    expect(bar.closest('.recipe-editor')).toBeNull()
    expect(container.querySelector('.recipe-editor__footer')).toBeNull()
  })
  it('Save Recipe still saves', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Save Recipe' }))
    expect(h.editor.save).toHaveBeenCalledOnce()
  })
})

describe('the screen sets no width of its own (L-02)', () => {
  it('renders no inline max-width and no second page container', () => {
    const { container } = view()
    expect(container.querySelectorAll('[data-page-width]')).toHaveLength(1)
    expect(container.querySelector('[style*="max-width"], [style*="max-inline-size"]')).toBeNull()
  })
})

// CRS E2: the screen reads the household Courses; these tests do not care which.
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
