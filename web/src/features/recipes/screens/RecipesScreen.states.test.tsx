import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summary } from '../fixtures.test-helper'

// B9-20 (RES-02): the Recipes screen switches on the hook's `state`: all seven states, one screen, "Unknown is not empty".
const state = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))
const live = vi.hoisted(() => ({ byFilter: null as null | ((f: { q?: string; tags?: string[] }) => Record<string, unknown>) }))
vi.mock('../hooks/useRecipes', () => ({ useRecipes: (f: { q?: string; tags?: string[] }) => (live.byFilter ? live.byFilter(f) : state.result) }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const base = { recipes: [], tags: [], isEmpty: false, isLoading: false, error: null, refetch: vi.fn() }
const view = (entry = '/recipes') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/recipes" element={<RecipesScreen />} />
          <Route path="/recipes/new" element={<p>new recipe page</p>} />
          <Route path="/recipes/import" element={<p>import page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 }))))
  state.result = { ...base }
  live.byFilter = null
})

describe('RecipesScreen by state', () => {
  it('loading: a skeleton in the final shape, and no empty or no-match text', () => {
    state.result = { ...base, isLoading: true, state: 'loading' }
    const { container } = view()
    expect(container.querySelector('.skeleton')).not.toBeNull()
    expect(container.querySelector('.empty-state, .error-state, .load-state')).toBeNull()
  })

  it('ready: the Recipe tiles', () => {
    state.result = { ...base, recipes: [summary({ id: 1, name: 'Pancakes' })], state: 'ready' }
    view()
    expect(screen.getByText('Pancakes')).toBeInTheDocument()
  })

  it('offlineSaved: the saved Recipes, with no state of their own (the offline banner says it is the saved copy)', () => {
    state.result = { ...base, recipes: [summary({ id: 1, name: 'Pancakes' })], state: 'offlineSaved' }
    const { container } = view()
    expect(screen.getByText('Pancakes')).toBeInTheDocument()
    expect(container.querySelector('.load-state, .empty-state, .error-state')).toBeNull()
  })

  it('offlineUnknown: the LoadState, no EmptyState, no "No Recipe matches"', () => {
    state.result = { ...base, state: 'offlineUnknown' }
    const { container } = view()
    expect(screen.getByRole('heading', { name: 'Your Recipes aren’t on this phone yet' })).toBeInTheDocument()
    expect(container.querySelector('.empty-state')).toBeNull()
    expect(screen.queryByText(/matches/)).toBeNull()
  })

  it('failed: the ErrorState "The Recipes could not be loaded." with a Try again that refetches', async () => {
    const refetch = vi.fn()
    state.result = { ...base, error: new Error('x'), refetch, state: 'failed' }
    view()
    expect(screen.getByText('The Recipes could not be loaded.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('empty: "No Recipes yet", "Add your first one, or import a Recipe File." with New Recipe and Import Recipes', async () => {
    state.result = { ...base, isEmpty: true, state: 'empty' }
    view()
    expect(screen.getByRole('heading', { name: 'No Recipes yet' })).toBeInTheDocument()
    expect(screen.getByText('Add your first one, or import a Recipe File.')).toBeInTheDocument()
    const empty = screen.getByRole('heading', { name: 'No Recipes yet' }).closest('.empty-state') as HTMLElement
    expect(within(empty).getByRole('button', { name: 'New Recipe' })).toBeInTheDocument()
    const imp = within(empty).getByRole('button', { name: 'Import Recipes' })
    await userEvent.click(imp)
    expect(screen.getByText('import page')).toBeInTheDocument()
  })

  it('filteredEmpty: "No Recipe matches “lasagne”." and Show all Recipes, which clears the search and the filters', async () => {
    // The hook's state follows the filter it is given, as the real one does: filtered → filteredEmpty, else empty.
    live.byFilter = (f) => ({ ...base, state: f.q || f.tags ? 'filteredEmpty' : 'empty' })
    view('/recipes?tag=roast')
    await userEvent.type(screen.getByRole('searchbox'), 'lasagne')
    expect(screen.getByText('No Recipe matches “lasagne”.')).toBeInTheDocument()
    expect(screen.getByText('Try another word, or show all Recipes.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show all Recipes' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.queryByText(/No Recipe matches/)).toBeNull()
  })

  it('filteredEmpty with a filter and no search word: "No Recipe matches these filters."', () => {
    state.result = { ...base, state: 'filteredEmpty' }
    view('/recipes?tag=roast')
    expect(screen.getByText('No Recipe matches these filters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all Recipes' })).toBeInTheDocument()
  })
})
