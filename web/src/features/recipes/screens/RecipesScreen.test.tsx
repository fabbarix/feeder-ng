import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'

const state = vi.hoisted(() => ({ filters: [] as unknown[], result: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipes', () => ({
  useRecipes: (f: unknown) => {
    state.filters.push(f)
    return state.result
  },
}))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const view = () =>
  render(
    <MemoryRouter initialEntries={['/recipes']}>
      <Routes>
        <Route path="/recipes" element={<RecipesScreen />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter

beforeEach(() => {
  state.filters = []
  state.result = {
    recipes: [summary({ id: 1, name: 'Pancakes' }), summary({ id: 2, name: 'Roast tray' })],
    tags: [{ name: 'roast', recipes: 1 }, { name: 'sweet', recipes: 1 }],
    isLoading: false, isEmpty: false, error: null,
  }
})

describe('RecipesScreen', () => {
  it('has one h1, one primary New Recipe action and a More overflow (not five equal pills)', async () => {
    view()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Import' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy Agent Prompt' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'New Recipe' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes/new')
  })

  it('searches with a SearchField', async () => {
    view()
    const box = screen.getByRole('searchbox', { name: 'Search Recipes' })
    await userEvent.type(box, 'pie')
    expect(lastFilter().q).toBe('pie')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(lastFilter().q).toBeUndefined()
  })

  it('filters by Tag with one group of filter Chips', async () => {
    view()
    const group = screen.getByRole('group', { name: 'All Tags' })
    expect(group).toContainElement(screen.getByRole('button', { name: 'roast' }))
    await userEvent.click(screen.getByRole('button', { name: 'roast' }))
    expect(lastFilter().tag).toBe('roast')
  })

  it('opens the overflow: Import, Export, Copy Agent Prompt and Show archived', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    // R2-1 (G-01): a Menu popover; links are menuitems.
    expect(screen.getByRole('menuitem', { name: /Import/ })).toHaveAttribute('href', '/recipes/import')
    expect(screen.getByRole('menuitem', { name: /Export/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Show archived' }))
    expect(lastFilter().archived).toBe('all')
  })

  it('lists a tile per Recipe and opens one', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: /Roast tray/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes/2')
  })

  it('shows the empty state with a New Recipe action, the no-match text, and the error state', () => {
    state.result = { recipes: [], tags: [], isLoading: false, isEmpty: true, error: null }
    const { unmount } = view()
    expect(screen.getByText('No Recipes yet. Add your first one.')).toBeInTheDocument()
    unmount()
    state.result = { recipes: [], tags: [], isLoading: false, isEmpty: false, error: null }
    const second = view()
    expect(screen.getByText('No Recipe matches.')).toBeInTheDocument()
    second.unmount()
    state.result = { recipes: [], tags: [], isLoading: false, isEmpty: false, error: new Error('x') }
    view()
    expect(screen.getByRole('alert')).toHaveTextContent('The Recipes could not be loaded.')
  })

  it('shows a Skeleton, not bare text, while loading', async () => {
    state.result = { recipes: [], tags: [], isLoading: true, isEmpty: false, error: null }
    view()
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(await screen.findByRole('status', {}, { timeout: 1500 })).toHaveAttribute('aria-busy', 'true')
  })
})
