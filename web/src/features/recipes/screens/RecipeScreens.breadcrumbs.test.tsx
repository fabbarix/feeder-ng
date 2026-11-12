// R11a (DEFERRED production edits: team R12 owns features/recipes/** until it merges; see docs/dev/design/r11a-settings-shell.md).
// Recipe detail and the Recipe editor show Breadcrumbs above the h1 and no back IconButton.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { garlic, recipe } from '../fixtures.test-helper'
import { emptyDraft } from '../lib/draft'

const h = vi.hoisted(() => ({ recipe: {} as Record<string, unknown>, editor: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', async () => {
  const { household } = await import('../household.test-helper')
  return { useHouseholdPreferences: () => household() }
})
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic]]), isLoading: false }) }))
vi.mock('../hooks/useRecipeEditor', () => ({ useRecipeEditor: () => h.editor }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'
import { RecipeEditorScreen } from './RecipeEditorScreen'

const view = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <ConfirmProvider>
          <Routes>
            <Route path="/recipes/new" element={<RecipeEditorScreen />} />
            <Route path="/recipes/:id/edit" element={<RecipeEditorScreen />} />
            <Route path="/recipes/:id" element={<RecipeDetailScreen />} />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' })

beforeEach(() => {
  h.recipe = { recipe: recipe(), isLoading: false, error: null, setArchived: vi.fn(), remove: vi.fn() }
  h.editor = {
    draft: { ...emptyDraft(), name: 'Roast tray' },
    setDraft: vi.fn(), errors: {}, saving: false, isLoading: false, unitPrompt: null,
    save: vi.fn(), answerUnitPrompt: vi.fn(), dismissUnitPrompt: vi.fn(), addLine: vi.fn(), updateLine: vi.fn(), pickIngredient: vi.fn(), removeLine: vi.fn(), setSteps: vi.fn(),
  }
})

describe('RecipeDetailScreen breadcrumbs', () => {
  it('shows Recipes > the Recipe name above the h1, with the current page plain text', () => {
    const { container } = view('/recipes/3')
    const nav = trail()
    expect(nav.querySelector('a[href="/recipes"]')).toHaveTextContent('Recipes')
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Roast tray')
    expect(container.querySelector('.page-header')).toContainElement(nav)
    const h1 = screen.getByRole('heading', { level: 1, name: 'Roast tray' })
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no Back IconButton any more (the Edit and More actions stay)', () => {
    view('/recipes/3')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
  })

  it('the error state keeps the trail (Recipes > Recipe) and no Back button', () => {
    h.recipe = { ...h.recipe, recipe: undefined, error: new Error('x'), refetch: vi.fn() }
    view('/recipes/3')
    expect(trail().querySelector('a[href="/recipes"]')).toHaveTextContent('Recipes')
    expect(trail().querySelector('[aria-current="page"]')).toHaveTextContent('Recipe')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })
})

describe('RecipeEditorScreen breadcrumbs', () => {
  it('editing: Recipes > name (a link back to the detail page) > Edit', () => {
    h.editor = { ...h.editor, draft: { ...emptyDraft(), name: 'Roast tray' } }
    view('/recipes/3/edit')
    const nav = trail()
    expect([...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Recipes', '/recipes'], ['Roast tray', '/recipes/3']])
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Edit')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('a new Recipe: Recipes > New Recipe', () => {
    view('/recipes/new')
    expect(trail().querySelector('a[href="/recipes"]')).toHaveTextContent('Recipes')
    expect(trail().querySelector('[aria-current="page"]')).toHaveTextContent('New Recipe')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })
})

// CRS E2: the screen reads the household Courses; these tests do not care which.
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
