// Beta.5 F7: the Sort select on the Recipes list, ?sort= in the URL, remembered on the device (Q24), and the
// "Last cooked" line on each tile.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { summary } from '../fixtures.test-helper'
import { RECIPE_SORT_KEY } from '../lib/sortChoice'
import type { RecipeFilter } from '../types'

const state = vi.hoisted(() => ({ filters: [] as unknown[], result: {} as Record<string, unknown> }))
vi.mock('../hooks/useRecipes', () => ({
  useRecipes: (f: unknown) => {
    state.filters.push(f)
    return state.result
  },
}))
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const Where = () => <p data-testid="where">{useLocation().search}</p>
const view = (url = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/recipes" element={<RecipesScreen />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter
const sortBox = () => screen.getByRole('combobox', { name: /Sort/ })
const pick = async (name: string) => {
  await userEvent.click(sortBox())
  await userEvent.click(screen.getByRole('option', { name }))
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
  state.filters = []
  state.result = {
    recipes: [
      summary({ id: 1, name: 'Chilli', lastCookedOn: '2026-11-11' }),
      summary({ id: 2, name: 'Borscht', lastCookedOn: null }),
      summary({ id: 3, name: 'Apple pie', lastCookedOn: '2026-10-03' }),
    ],
    tags: [], isLoading: false, isEmpty: false, error: null,
  }
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RecipesScreen Sort', () => {
  it('has a Sort select, by Name to begin with, with no sort in the URL', () => {
    view()
    expect(sortBox()).toHaveTextContent('Name')
    expect(lastFilter().sort).toBe('name')
    expect(screen.getByTestId('where').textContent).toBe('')
  })
  it('choosing a last cooked sort asks the list for it and puts it in the URL', async () => {
    view()
    await pick('Last cooked: longest ago first')
    expect(lastFilter().sort).toBe('last_cooked_asc')
    expect(new URLSearchParams(screen.getByTestId('where').textContent ?? '').get('sort')).toBe('last_cooked_asc')
    // hf-recipes-filter: the closed trigger shows the short label; the long one stays in the option list.
    expect(sortBox()).toHaveTextContent(/^Longest ago$/)
    await userEvent.click(sortBox())
    expect(screen.getByRole('option', { name: 'Last cooked: longest ago first' })).toHaveAttribute('aria-selected', 'true')
  })
  it('remembers the choice on the device', async () => {
    view()
    await pick('Last cooked: most recent first')
    expect(window.localStorage.getItem(RECIPE_SORT_KEY)).toBe('last_cooked_desc')
  })
  it('opens on the sort in the URL', async () => {
    view('/recipes?sort=last_cooked_desc')
    expect(lastFilter().sort).toBe('last_cooked_desc')
    expect(sortBox()).toHaveTextContent(/^Most recent$/)
    await userEvent.click(sortBox())
    expect(screen.getByRole('option', { name: 'Last cooked: most recent first' })).toHaveAttribute('aria-selected', 'true')
  })
  it('opens on the remembered sort when the URL has none, and shows it in the URL', () => {
    window.localStorage.setItem(RECIPE_SORT_KEY, 'last_cooked_asc')
    view()
    expect(lastFilter().sort).toBe('last_cooked_asc')
    expect(new URLSearchParams(screen.getByTestId('where').textContent ?? '').get('sort')).toBe('last_cooked_asc')
  })
  it('keeps the Tag filter in the URL when the sort changes', async () => {
    view('/recipes?tag=roast')
    await pick('Last cooked: longest ago first')
    const params = new URLSearchParams(screen.getByTestId('where').textContent ?? '')
    expect(params.get('tag')).toBe('roast')
    expect(params.get('sort')).toBe('last_cooked_asc')
    expect(lastFilter().tags).toEqual(['roast'])
  })
  it('puts the Sort select beside the search, not in a native select', () => {
    const { container } = view()
    expect(container.querySelector('select')).toBeNull()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })
})

describe('RecipesScreen Last cooked on the tiles', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 12, 10, 0) }))
  it('says when each Recipe was last cooked, or that it was not yet', () => {
    view()
    const tile = (name: string) => screen.getByRole('button', { name }).closest('.recipe-tile') as HTMLElement
    expect(within(tile('Chilli')).getByText('Last cooked yesterday')).toBeInTheDocument()
    expect(within(tile('Apple pie')).getByText('Last cooked 3 Oct')).toBeInTheDocument()
    expect(within(tile('Borscht')).getByText('Not cooked yet')).toBeInTheDocument()
  })
})
