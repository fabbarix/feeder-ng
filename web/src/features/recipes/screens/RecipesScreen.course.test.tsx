// CRS E2: the Course filter and the Course chips on the Recipes list (docs/dev/design/crs-e2.md 5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices, summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'

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

const view = () =>
  render(
    <MemoryRouter initialEntries={['/recipes']}>
      <Routes>
        <Route path="/recipes" element={<RecipesScreen />} />
      </Routes>
    </MemoryRouter>,
  )
// hf-recipes-filter: the Course filter lives in the Filters panel (docs/design/recipes-filter.md).
const openFilters = () => userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
const lastFilter = () => state.filters.at(-1) as RecipeFilter

beforeEach(() => {
  state.filters = []
  state.courses = courseChoices
  state.result = {
    recipes: [
      summary({ id: 1, name: 'Pancakes', courseIds: [1], wholeMeal: true }),
      summary({ id: 2, name: 'Rice', courseIds: [1, 2], wholeMeal: false }),
      summary({ id: 3, name: 'Trifle', courseIds: [4], wholeMeal: true }),
    ],
    tags: [], isLoading: false, isEmpty: false, error: null,
  }
})

describe('RecipesScreen Course filter', () => {
  it('has the Course filter group in the Filters panel with All Courses pressed, and no Course in the filter', async () => {
    view()
    expect(screen.queryByRole('group', { name: 'Filter by Course' })).toBeNull()
    await openFilters()
    const group = screen.getByRole('group', { name: 'Filter by Course' })
    expect(within(group).getByRole('button', { name: 'All Courses' })).toHaveAttribute('aria-pressed', 'true')
    expect(lastFilter().course).toBeUndefined()
  })
  it('filtering by a Course asks the list for it', async () => {
    view()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    expect(lastFilter().course).toBe(2)
    expect(screen.getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('All Courses clears it', async () => {
    view()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    await userEvent.click(screen.getByRole('button', { name: 'All Courses' }))
    expect(lastFilter().course).toBeUndefined()
  })
  it('keeps the other filters when the Course changes', async () => {
    view()
    await userEvent.type(screen.getByRole('searchbox'), 'rice')
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: 'Side' }))
    expect(lastFilter()).toMatchObject({ q: 'rice', course: 2, archived: 'no' })
  })
  it('has no Course filter while the household has a single Course', async () => {
    state.courses = courseChoices.slice(0, 1)
    view()
    await openFilters()
    expect(screen.queryByRole('group', { name: 'Filter by Course' })).toBeNull()
  })
})

describe('RecipesScreen Course chips', () => {
  it('names each Recipe\'s Courses on its tile, in household order', () => {
    view()
    const lists = screen.getAllByRole('list', { name: 'Courses' })
    expect(lists.map((l) => within(l).getAllByRole('listitem').map((li) => li.textContent))).toEqual([
      ['Main', 'Whole meal'],
      ['Main', 'Side'],
      ['Dessert'],
    ])
  })
  it('shows Whole meal only for a Whole meal Recipe whose Courses include the main Course', () => {
    view()
    expect(screen.getAllByText('Whole meal')).toHaveLength(1)
  })
})
