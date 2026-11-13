// hf-recipes-filter: the Recipes list filter header (docs/design/recipes-filter.md): two one-line rows (Search + Filters, Kind +
// Sort), the Filters panel with Course and a searchable Tag list, the active filter chips, Clear, and the URL round trip.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../../../ui/lib/viewport.test-helper'
import { courseChoices, summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'

const TAGS = [
  'beef', 'breakfast', 'budget', 'chicken', 'comfort', 'curry', 'dairy-free', 'easy', 'family', 'fish', 'freezer', 'gluten-free',
  'grill', 'kids', 'leftovers', 'lunchbox', 'one-pot', 'pasta', 'pork', 'quick', 'rice', 'roast', 'salad', 'slow cooker',
  'soup', 'spicy', 'sweet', 'vegetarian',
]
const state = vi.hoisted(() => ({
  filters: [] as unknown[],
  result: {} as Record<string, unknown>,
  known: [] as { name: string; recipes: number }[],
}))
vi.mock('../hooks/useRecipes', () => ({
  useRecipes: (f: unknown) => {
    state.filters.push(f)
    return state.result
  },
}))
vi.mock('../hooks/useRecipeTags', () => ({
  useRecipeTags: () => ({ known: state.known, isLoading: false, colourOf: (n: string) => (n === 'fish' ? 'teal' : n === 'roast' ? 'tomato' : undefined) }),
}))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const Where = () => {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
const Detail = () => {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  )
}
const view = (url = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/recipes" element={<><RecipesScreen /><Where /></>} />
        <Route path="/recipes/:id" element={<><Detail /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter
const where = () => screen.getByTestId('where').textContent ?? ''
const params = () => new URLSearchParams(where().split('?')[1] ?? '')
const filtersButton = () => screen.getByRole('button', { name: /^Filters/ })
const openFilters = () => userEvent.click(filtersButton())
const panel = () => screen.getByRole('dialog', { name: 'Filters' })

beforeEach(() => {
  state.filters = []
  state.known = TAGS.map((name, i) => ({ name, recipes: (i % 5) + 1 }))
  state.result = {
    recipes: [summary({ id: 1, name: 'Fish pie', tags: ['fish'] }), summary({ id: 2, name: 'Roast tray', tags: ['roast'] })],
    tags: [], isLoading: false, isEmpty: false, error: null,
  }
})
afterEach(() => vi.unstubAllGlobals())

describe.each([390, 834, 1024, 1440, 1920])('the header at %i px', (width) => {
  beforeEach(() => stubViewportWidth(width))

  it('row 1 is the search and the Filters button, row 2 is Kind and Sort, and nothing else', () => {
    const { container } = view()
    const rows = container.querySelectorAll('.recipe-filters__row')
    expect(rows).toHaveLength(2)
    const [search, viewRow] = [...rows] as HTMLElement[]
    expect(search).toHaveClass('recipe-filters__search-row')
    expect(within(search!).getByRole('searchbox', { name: 'Search Recipes' })).toBeInTheDocument()
    expect(within(search!).getByRole('button', { name: 'Filters' })).toBeInTheDocument()
    expect(viewRow).toHaveClass('recipe-filters__view-row')
    expect(within(viewRow!).getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument()
    expect(within(viewRow!).getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
  })

  it('shows no Tag and no Course in the header, however many Tags there are', () => {
    const { container } = view()
    for (const slot of container.querySelectorAll<HTMLElement>('.list-page__search, .list-page__filters')) {
      expect(within(slot).queryByRole('button', { name: 'fish' })).toBeNull()
      expect(within(slot).queryByRole('button', { name: 'Main' })).toBeNull()
      expect(slot.querySelectorAll('.chip')).toHaveLength(0)
    }
    expect(screen.queryByRole('group', { name: 'All Tags' })).toBeNull()
    expect(container.querySelector('.tag-chips')).toBeNull()
  })

  it('has no visible "Kind" or "Sort" label (they are accessible names only)', () => {
    const { container } = view()
    const labels = container.querySelectorAll('.recipe-filters__view-row .ui-field__label')
    expect([...labels].map((l) => l.textContent)).toEqual(['Kind', 'Sort'])
    for (const label of labels) expect(label).toHaveClass('visually-hidden')
  })

  it('a filter adds one line of chips under row 2', () => {
    const { container } = view('/recipes?course=1&tag=fish')
    const line = screen.getByRole('group', { name: 'Active filters' })
    expect(line.previousElementSibling).toBe(container.querySelector('.recipe-filters__view-row'))
    expect(within(line).getAllByRole('button').map((b) => b.textContent)).toEqual(['Main', 'fish'])
  })
})

describe('finding and choosing a Tag', () => {
  it('opens the Filters panel and finds a Tag by name among 28', async () => {
    view()
    await openFilters()
    expect(within(panel()).getAllByRole('option')).toHaveLength(28)
    await userEvent.type(within(panel()).getByRole('combobox', { name: 'Search Tags' }), 'slow')
    const options = within(panel()).getAllByRole('option')
    expect(options).toHaveLength(1)
    await userEvent.click(options[0]!)
    expect(lastFilter().tag).toBe('slow cooker')
    expect(params().get('tag')).toBe('slow cooker')
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Tag: slow cooker' })).toBeInTheDocument()
  })
  it('lists the chosen Tag first when the panel opens again', async () => {
    view('/recipes?tag=roast')
    await openFilters()
    const first = within(panel()).getAllByRole('option')[0]!
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveTextContent('roast')
  })
  it('an empty search says nothing matches', async () => {
    view()
    await openFilters()
    await userEvent.type(within(panel()).getByRole('combobox', { name: 'Search Tags' }), 'zzz')
    expect(within(panel()).getByText("No Tag matches 'zzz'")).toBeInTheDocument()
  })
})

describe('the Course filter in the URL', () => {
  it('choosing a Course puts ?course= in the URL and asks the list for it', async () => {
    view()
    await openFilters()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Side' }))
    expect(params().get('course')).toBe('2')
    expect(lastFilter().course).toBe(2)
    expect(screen.getByRole('button', { name: 'Remove Course: Side' })).toBeInTheDocument()
  })
  it('opens filtered by ?course=', () => {
    view('/recipes?course=4')
    expect(lastFilter().course).toBe(4)
    expect(screen.getByRole('button', { name: 'Remove Course: Dessert' })).toBeInTheDocument()
  })
  it('ignores a ?course= that is not one of the household\'s Courses', () => {
    view('/recipes?course=77')
    expect(lastFilter().course).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })
  it('on Base recipes the Course is neither sent nor shown', () => {
    view('/recipes?kind=base&course=2&tag=fish')
    expect(lastFilter().course).toBeUndefined()
    expect(lastFilter().tag).toBe('fish')
    expect(screen.queryByRole('button', { name: /Remove Course/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
  })
})

describe('the active filter chips', () => {
  it('a chip removes its filter; the other stays', async () => {
    view('/recipes?course=1&tag=fish')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Tag: fish' }))
    expect(lastFilter().tag).toBeUndefined()
    expect(lastFilter().course).toBe(1)
    expect(params().has('tag')).toBe(false)
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeInTheDocument()
  })
  it('removing the last chip removes the line', async () => {
    view('/recipes?course=1')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Course: Main' }))
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull()
    expect(where()).toBe('/recipes')
  })
  it('the Tag chip wears the Tag colour, the Course chip is neutral', () => {
    view('/recipes?course=1&tag=fish')
    expect(screen.getByRole('button', { name: 'Remove Tag: fish' })).toHaveAttribute('data-tag-colour', 'teal')
    expect(screen.getByRole('button', { name: 'Remove Course: Main' })).not.toHaveAttribute('data-tag-colour')
  })
})

describe('Clear filters', () => {
  it('drops the Course and the Tag, keeps Kind and Sort, and keeps the panel open', async () => {
    view('/recipes?sort=last_cooked_asc&course=1&tag=fish')
    await openFilters()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Clear filters' }))
    expect(params().get('sort')).toBe('last_cooked_asc')
    expect(params().has('course')).toBe(false)
    expect(params().has('tag')).toBe(false)
    expect(lastFilter()).toMatchObject({ course: undefined, tag: undefined, sort: 'last_cooked_asc' })
    expect(panel()).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'Clear filters' })).toBeDisabled()
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull()
  })
})

describe('the URL round trip', () => {
  it('a link with every parameter opens the list exactly so', () => {
    view('/recipes?kind=plannable&sort=last_cooked_desc&course=2&tag=roast')
    expect(lastFilter()).toMatchObject({ course: 2, tag: 'roast', sort: 'last_cooked_desc' })
    expect(screen.getByRole('radio', { name: 'Recipes' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Most recent')
  })
  it('the back button from a Recipe brings the filters back', async () => {
    view('/recipes?course=1')
    await openFilters()
    await userEvent.click(within(panel()).getByRole('option', { name: 'fish' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: /Fish pie/ }))
    expect(where()).toBe('/recipes/1')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(params().get('course')).toBe('1')
    expect(params().get('tag')).toBe('fish')
    expect(lastFilter()).toMatchObject({ course: 1, tag: 'fish' })
    expect(screen.getByRole('button', { name: 'Remove Tag: fish' })).toBeInTheDocument()
  })
  it('changing a filter replaces the history entry (Back leaves the list, as before)', async () => {
    view('/recipes')
    await openFilters()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Main' }))
    await userEvent.click(within(panel()).getByRole('option', { name: 'fish' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: /Fish pie/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(where()).toBe('/recipes?course=1&tag=fish')
  })
})

describe('the panel on a phone and from 768 px', () => {
  it('is a bottom sheet at 390 px', async () => {
    stubViewportWidth(390)
    view()
    await openFilters()
    expect(panel().tagName).toBe('DIALOG')
  })
  it('is a popover at 1024 px', async () => {
    stubViewportWidth(1024)
    view()
    await openFilters()
    expect(panel().tagName).not.toBe('DIALOG')
  })
})
