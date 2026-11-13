import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices, summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'

// BR-D: the Recipes list's kind: Recipes · Base recipes (?kind=base), Base recipes hidden by default.
const state = vi.hoisted(() => ({ filters: [] as unknown[], result: {} as Record<string, unknown>, courses: [] as unknown[] }))
vi.mock('../hooks/useRecipes', () => ({
  useRecipes: (f: unknown) => {
    state.filters.push(f)
    return state.result
  },
}))
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: state.courses, isPending: false, isError: false }) }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const Where = () => {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
const view = (entry = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/recipes" element={<><RecipesScreen /><Where /></>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter
const bechamel = summary({ id: 9, name: 'Béchamel', baseRecipe: true, yield: 1, yieldUnit: 'l', usedByCount: 3, courseIds: [], tags: [] })

beforeEach(() => {
  state.filters = []
  state.courses = courseChoices
  state.result = {
    recipes: [summary({ id: 1, name: 'Pancakes' }), summary({ id: 2, name: 'Roast tray' })],
    tags: [], isLoading: false, isEmpty: false, error: null,
  }
})

describe('RecipesScreen: kind control', () => {
  it('shows Recipes by default: the control reads Recipes, no Base recipe is asked for', () => {
    view()
    expect(screen.getByRole('radio', { name: 'Recipes' })).toBeChecked()
    expect(lastFilter().kind === undefined || lastFilter().kind === 'plannable').toBe(true)
  })

  it('switching to Base recipes puts ?kind=base in the URL and asks the list for them', async () => {
    view()
    await userEvent.click(screen.getByRole('radio', { name: 'Base recipes' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes?kind=base')
    expect(lastFilter().kind).toBe('base')
    expect(screen.getByRole('radio', { name: 'Base recipes' })).toBeChecked()
  })

  it('opens on Base recipes from the URL, and going back to Recipes drops the parameter', async () => {
    view('/recipes?kind=base')
    expect(screen.getByRole('radio', { name: 'Base recipes' })).toBeChecked()
    expect(lastFilter().kind).toBe('base')
    await userEvent.click(screen.getByRole('radio', { name: 'Recipes' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/recipes$/)
  })

  it('keeps the Tag filter in the URL beside the kind', async () => {
    view('/recipes?tag=sauce')
    await userEvent.click(screen.getByRole('radio', { name: 'Base recipes' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes?tag=sauce&kind=base')
  })
})

describe('RecipesScreen: Base recipes', () => {
  beforeEach(() => {
    state.result = { recipes: [bechamel], tags: [], isLoading: false, isEmpty: false, error: null }
  })

  it('hides the sort (and sends none) and the Course filter', () => {
    view('/recipes?kind=base')
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Filter by Course' })).toBeNull()
    expect(lastFilter().sort).toBeUndefined()
    expect(lastFilter().course).toBeUndefined()
  })

  it('keeps the sort and the Course filter on Recipes', () => {
    view()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Filter by Course' })).toBeInTheDocument()
  })

  it('shows the Yield and "Used in 3 Recipes" on the tile and opens the Base recipe', async () => {
    view('/recipes?kind=base')
    expect(screen.getByText('Yield 1 l')).toBeInTheDocument()
    expect(screen.getByText('Used in 3 Recipes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Béchamel/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes/9')
  })

  it('says "Not used yet" for a Base recipe nobody calls for', () => {
    state.result = { recipes: [{ ...bechamel, usedByCount: 0 }], tags: [], isLoading: false, isEmpty: false, error: null }
    view('/recipes?kind=base')
    expect(screen.getByText('Not used yet')).toBeInTheDocument()
  })

  it('has its own empty state, not the Recipes one', () => {
    state.result = { recipes: [], tags: [], isLoading: false, isEmpty: true, error: null }
    view('/recipes?kind=base')
    expect(screen.getByText(/No Base recipes yet/)).toBeInTheDocument()
    expect(screen.queryByText('No Recipes yet. Add your first one.')).toBeNull()
  })
})
