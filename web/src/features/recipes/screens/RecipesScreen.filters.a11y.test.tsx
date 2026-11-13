// hf-recipes-filter: keyboard and screen-reader behaviour of the Recipes filter header (docs/design/recipes-filter.md 8).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseChoices, summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'

const state = vi.hoisted(() => ({ filters: [] as unknown[] }))
vi.mock('../hooks/useRecipes', () => ({
  useRecipes: (f: unknown) => {
    state.filters.push(f)
    return { recipes: [summary({ id: 1, name: 'Fish pie' })], tags: [], isLoading: false, isEmpty: false, error: null }
  },
}))
vi.mock('../hooks/useRecipeTags', () => ({
  useRecipeTags: () => ({
    known: [{ name: 'fish', recipes: 3 }, { name: 'roast', recipes: 1 }, { name: 'sweet', recipes: 2 }],
    isLoading: false,
    colourOf: () => undefined,
  }),
}))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const view = (url = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/recipes" element={<RecipesScreen />} />
      </Routes>
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter
const filtersButton = () => screen.getByRole('button', { name: /^Filters/ })

beforeEach(() => {
  state.filters = []
})

describe('names and states', () => {
  it('the Filters button says it opens a dialog and how many filters are on', () => {
    view('/recipes?course=1&tag=fish')
    const button = screen.getByRole('button', { name: 'Filters, 2 active' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
  it('while open, the button is expanded and controls the panel, a dialog named "Filters"', async () => {
    view()
    await userEvent.click(filtersButton())
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(filtersButton()).toHaveAttribute('aria-expanded', 'true')
    expect(filtersButton()).toHaveAttribute('aria-controls', dialog.id)
  })
  it('Kind is a radiogroup "Kind", Sort a combobox "Sort", the search a searchbox "Search Recipes"', () => {
    view()
    expect(screen.getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search Recipes' })).toBeInTheDocument()
  })
  it('the active chips are a group "Active filters" of buttons that say what they remove', () => {
    view('/recipes?course=2&tag=roast')
    const group = screen.getByRole('group', { name: 'Active filters' })
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Remove Course: Side', 'Remove Tag: roast'])
  })
  it('the Tag options are named by the Tag and described by their count', async () => {
    view()
    await userEvent.click(filtersButton())
    expect(screen.getByRole('option', { name: 'fish' })).toHaveAccessibleDescription('3 Recipes')
  })
})

describe('keyboard', () => {
  it('tabs Search, Filters, Kind, Sort, then the chips', async () => {
    view('/recipes?course=1&tag=fish')
    screen.getByRole('searchbox', { name: 'Search Recipes' }).focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('radio', { name: 'Recipes' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Remove Course: Main' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Remove Tag: fish' })).toHaveFocus()
  })
  it('Enter opens the panel on the first Course chip; Escape closes it and returns focus to the button', async () => {
    view()
    filtersButton().focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'All Courses' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
    expect(filtersButton()).toHaveFocus()
  })
  it('a Tag can be found and chosen without the mouse', async () => {
    view()
    filtersButton().focus()
    await userEvent.keyboard('{Enter}')
    screen.getByRole('combobox', { name: 'Search Tags' }).focus()
    await userEvent.keyboard('swe{ArrowDown}{Enter}')
    expect(lastFilter().tag).toBe('sweet')
    expect(screen.getByRole('option', { name: 'sweet' })).toHaveAttribute('aria-selected', 'true')
  })
  it('Done closes the panel and returns focus to the button', async () => {
    view()
    await userEvent.click(filtersButton())
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
    expect(filtersButton()).toHaveFocus()
  })
  it('removing a chip moves focus to the next chip', async () => {
    view('/recipes?course=1&tag=fish')
    screen.getByRole('button', { name: 'Remove Course: Main' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Remove Tag: fish' })).toHaveFocus()
  })
  it('removing the last chip moves focus to the Filters button', async () => {
    view('/recipes?tag=fish')
    screen.getByRole('button', { name: 'Remove Tag: fish' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus()
  })
  it('Clear filters, once disabled, leaves focus on Done', async () => {
    view('/recipes?tag=fish')
    await userEvent.click(filtersButton())
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus()
  })
})
