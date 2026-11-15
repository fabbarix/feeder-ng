// B9-31: the shared harness of the editor-safety screen tests. The REAL useRecipeEditor and useRecipeDraft run; the network is a
// routed fetch stub (lib/baseRecipes/test-utils.mockApi), the draft store is in memory, and the router is a DATA router
// (createMemoryRouter): useLeaveGuard needs one, so the older editor tests that mount a MemoryRouter must move to it (see the hand-back).
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { Link, Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { useHasUnsavedChanges } from '../../../app/unsavedChanges'
import { mockApi, newQueryClient } from '../../../lib/baseRecipes/test-utils'
import { createMemoryDraftStore } from '../../../lib/drafts/draftStore'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { courseChoices, recipe } from '../fixtures.test-helper'
import type { Recipe } from '../types'
import { RecipeEditorScreen } from './RecipeEditorScreen'

export const USER_ID = 7
/** The in-memory draft store every test file hands to `openDraftStore` (vi.mock in the file). */
export const drafts = { store: createMemoryDraftStore() }
export const resetDraftStore = () => void (drafts.store = createMemoryDraftStore())

/** The stored Recipe of these tests: Roast tray, one line (garlic), two Steps (Marinate, advance; Roast, passive, using garlic). */
export const STORED: Recipe = recipe({ id: 3, name: 'Roast tray', updatedAt: '2026-11-14T10:00:00Z' })

export function api(over: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/recipes/3': STORED,
    'PUT /api/recipes/3': { ...STORED, name: 'Roast tray, my way' },
    'POST /api/recipes': { ...STORED, id: 11 },
    'GET /api/slot-rules': [],
    'GET /api/meal-slots': [],
    'GET /api/household/settings': { frozenUseByDays: 90 },
    ...over,
  })
}

const Probe = () => <p data-testid="unsaved">{String(useHasUnsavedChanges())}</p>
const Shell = () => (
  <>
    <nav aria-label="Main">
      <Link to="/plan">Plan</Link>
      <Link to="/pantry">Pantry</Link>
    </nav>
    <Probe />
    <Outlet />
  </>
)

export function mount(path = '/recipes/3/edit', entries: string[] = [path]) {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: '/recipes/new', element: <RecipeEditorScreen /> },
          { path: '/recipes/:id/edit', element: <RecipeEditorScreen /> },
          { path: '/recipes/:id', element: <h1>Recipe page</h1> },
          { path: '/recipes', element: <h1>Recipes page</h1> },
          { path: '/plan', element: <h1>Plan page</h1> },
          { path: '/pantry', element: <h1>Pantry page</h1> },
        ],
      },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  )
  const view = render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { router, ...view }
}

/** Waits until the editor shows the stored Recipe (Name filled) or, for a new Recipe, its form. */
export const ready = (name = 'Roast tray') => waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(name))
export const nameField = () => screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
export const unsaved = () => screen.getByTestId('unsaved').textContent
export const leaveDialog = () => screen.queryByRole('dialog', { name: 'Leave without saving?' })
export const discardDialog = () => screen.queryByRole('dialog', { name: 'Discard your changes?' })

export { courseChoices }
