// b8-recipes: filter the Recipes list by several Tags, a Recipe must carry every one (docs/design/recipes-filter.md, docs/dev/design/b8-recipes.md 3).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices, summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'

const state = vi.hoisted(() => ({ filters: [] as unknown[] }))
vi.mock('../hooks/useRecipes', () => ({
  useRecipes: (f: unknown) => {
    state.filters.push(f)
    return { recipes: [summary({ id: 1, name: 'Fish pie', tags: ['fish', 'oven'] })], tags: [], isLoading: false, isEmpty: false, error: null }
  },
}))
vi.mock('../hooks/useRecipeTags', () => ({
  useRecipeTags: () => ({
    known: [{ name: 'fish', recipes: 3 }, { name: 'oven', recipes: 2 }, { name: 'quick', recipes: 4 }, { name: 'roast', recipes: 1 }],
    isLoading: false,
    colourOf: (n: string) => (n === 'fish' ? 'teal' : n === 'roast' ? 'tomato' : undefined),
  }),
}))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const Where = () => {
  const l = useLocation()
  return <output data-testid="where">{l.search}</output>
}
const view = (url = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/recipes" element={<><RecipesScreen /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter
const where = () => screen.getByTestId('where').textContent ?? ''
const filtersButton = () => screen.getByRole('button', { name: /^Filters/ })
const tagList = () => screen.getByRole('listbox', { name: 'Filter by Tag' })
const chipLine = () => screen.getByRole('group', { name: 'Active filters' })

beforeEach(() => {
  state.filters = []
})

describe('RecipesScreen: several Tags', () => {
  it('opens with every ?tag= in force: the list is asked for all of them', () => {
    view('/recipes?tag=fish&tag=oven')
    expect(lastFilter().tags).toEqual(['fish', 'oven'])
  })
  it('a single ?tag=fish URL still filters by that one Tag', () => {
    view('/recipes?tag=fish')
    expect(lastFilter().tags).toEqual(['fish'])
  })
  it('shows one removable chip per Tag on the active-filter line, each in its colour', () => {
    view('/recipes?course=1&tag=fish&tag=roast&tag=oven')
    const chips = within(chipLine()).getAllByRole('button')
    expect(chips.map((c) => c.getAttribute('aria-label') ?? c.textContent)).toEqual([
      'Remove Course: Main',
      'Remove Tag: fish',
      'Remove Tag: roast',
      'Remove Tag: oven',
    ])
    expect(screen.getByRole('button', { name: 'Remove Tag: fish' })).toHaveAttribute('data-tag-colour', 'teal')
    expect(screen.getByRole('button', { name: 'Remove Tag: roast' })).toHaveAttribute('data-tag-colour', 'tomato')
  })
  it('the Filters count adds up the Course and every Tag', () => {
    view('/recipes?course=1&tag=fish&tag=oven&tag=quick')
    expect(screen.getByRole('button', { name: 'Filters, 4 active' })).toBeInTheDocument()
  })
  it('choosing a second Tag in the panel adds it, keeps the first and keeps the panel open', async () => {
    view('/recipes?tag=fish')
    await userEvent.click(filtersButton())
    await userEvent.click(within(tagList()).getByRole('option', { name: 'oven' }))
    expect(where()).toBe('?tag=fish&tag=oven')
    expect(lastFilter().tags).toEqual(['fish', 'oven'])
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    expect(within(tagList()).getByRole('option', { name: 'fish' })).toHaveAttribute('aria-selected', 'true')
    expect(within(tagList()).getByRole('option', { name: 'oven' })).toHaveAttribute('aria-selected', 'true')
  })
  it('choosing a selected Tag again removes just that Tag', async () => {
    view('/recipes?tag=fish&tag=oven')
    await userEvent.click(filtersButton())
    await userEvent.click(within(tagList()).getByRole('option', { name: 'fish' }))
    expect(where()).toBe('?tag=oven')
    expect(lastFilter().tags).toEqual(['oven'])
  })
  it('a chip removes its own Tag and leaves the others', async () => {
    view('/recipes?course=1&tag=fish&tag=oven')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tag: fish' }))
    expect(where()).toBe('?course=1&tag=oven')
    expect(lastFilter()).toMatchObject({ course: 1, tags: ['oven'] })
    expect(screen.queryByRole('button', { name: 'Remove Tag: fish' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Tag: oven' })).toBeInTheDocument()
  })
  it('removing the last Tag chip leaves no Tag filter', async () => {
    view('/recipes?tag=fish')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tag: fish' }))
    expect(where()).toBe('')
    expect(lastFilter().tags).toBeUndefined()
  })
  it('Clear filters drops every Tag and the Course, keeps Kind', async () => {
    view('/recipes?kind=base&course=1&tag=fish&tag=oven')
    await userEvent.click(filtersButton())
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(where()).toBe('?kind=base')
    expect(lastFilter().tags).toBeUndefined()
  })
  it('Base recipes take the same Tags', () => {
    view('/recipes?kind=base&tag=fish&tag=oven')
    expect(lastFilter()).toMatchObject({ kind: 'base', tags: ['fish', 'oven'] })
  })
  it('a repeat by key counts once (the URL may carry a hand-typed duplicate)', () => {
    view('/recipes?tag=fish&tag=FISH')
    expect(lastFilter().tags).toEqual(['fish'])
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
  })
})
