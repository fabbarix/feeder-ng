// TG-RW: Tag colours on the Recipes list: the filter, the tiles, and /recipes?tag= (docs/dev/design/tg-rw.md 5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summary } from '../fixtures.test-helper'
import type { RecipeFilter } from '../types'

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
  useRecipeTags: () => ({ known: state.known, isLoading: false, colourOf: (n: string) => ({ roast: 'tomato', sweet: 'plum' })[n.toLowerCase()] }),
}))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const Where = () => <output data-testid="where">{useLocation().search}</output>
const view = (url = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/recipes" element={<><RecipesScreen /><Where /></>} /></Routes>
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter

beforeEach(() => {
  state.filters = []
  state.known = [{ name: 'roast', recipes: 2 }, { name: 'sweet', recipes: 1 }, { name: 'kids', recipes: 1 }]
  state.result = {
    recipes: [summary({ id: 1, name: 'Pancakes', tags: ['sweet', 'roast', 'kids'] }), summary({ id: 2, name: 'Roast tray', tags: ['roast'] })],
    tags: [{ name: 'roast', recipes: 2 }, { name: 'sweet', recipes: 1 }, { name: 'kids', recipes: 1 }],
    isLoading: false, isEmpty: false, error: null,
  }
})

const openFilters = () => userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
const tagList = () => screen.getByRole('listbox', { name: 'Filter by Tag' })

// hf-recipes-filter: the Tag filter moved from a row of chips into the Filters panel (docs/design/recipes-filter.md).
describe('RecipesScreen Tag colours', () => {
  it('colours each Tag of the Filters panel with its dot', async () => {
    view()
    await openFilters()
    const dot = (name: string) => within(tagList()).getByRole('option', { name }).querySelector('.tag-dot')
    expect(dot('roast')).toHaveAttribute('data-tag-colour', 'tomato')
    expect(dot('sweet')).toHaveAttribute('data-tag-colour', 'plum')
    expect(dot('kids')).not.toHaveAttribute('data-tag-colour')
  })
  it('shows each tile\'s first two Tags in colour and "+1" for the third', () => {
    view()
    const lists = screen.getAllByRole('list', { name: 'Tags' })
    expect(within(lists[0]!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['sweet', 'roast', '+1'])
    expect(lists[0]!.querySelectorAll('[data-tag-colour]')).toHaveLength(2)
  })
  it('opens already filtered by the Tag in ?tag= (the Recipe detail\'s Tag chips link here)', async () => {
    view('/recipes?tag=roast')
    expect(lastFilter().tag).toBe('roast')
    expect(screen.getByRole('button', { name: 'Remove Tag: roast' })).toHaveAttribute('data-tag-colour', 'tomato')
    await openFilters()
    expect(within(tagList()).getByRole('option', { name: 'roast' })).toHaveAttribute('aria-selected', 'true')
  })
  it('has no Tag filter without ?tag=', () => {
    view()
    expect(lastFilter().tag).toBeUndefined()
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull()
  })
  it('choosing a Tag in the panel still filters', async () => {
    view()
    await openFilters()
    await userEvent.click(within(tagList()).getByRole('option', { name: 'sweet' }))
    expect(lastFilter().tag).toBe('sweet')
  })
})

describe('RecipesScreen Tag filter order and URL', () => {
  const nameOf = (o: HTMLElement) => {
    const by = o.getAttribute('aria-labelledby')
    return (by ? document.getElementById(by)?.textContent : null) ?? o.getAttribute('aria-label') ?? o.textContent
  }
  const optionNames = () => within(tagList()).getAllByRole('option').map(nameOf)
  it('lists the Tags by name (accents and case ignored): "Édamame" before "sweet"', async () => {
    state.known = [{ name: 'sweet', recipes: 1 }, { name: 'Édamame', recipes: 1 }]
    view()
    await openFilters()
    expect(optionNames()).toEqual(['Édamame', 'sweet'])
  })
  it('choosing a Tag puts ?tag= in the URL; choosing it again removes it', async () => {
    view()
    await openFilters()
    await userEvent.click(within(tagList()).getByRole('option', { name: 'sweet' }))
    expect(screen.getByTestId('where')).toHaveTextContent('?tag=sweet')
    await userEvent.click(within(tagList()).getByRole('option', { name: 'sweet' }))
    expect(screen.getByTestId('where').textContent).toBe('')
    expect(lastFilter().tag).toBeUndefined()
  })
  it('a name that needs escaping round-trips', async () => {
    state.known = [{ name: 'fish & chips', recipes: 1 }]
    view()
    await openFilters()
    await userEvent.click(within(tagList()).getByRole('option', { name: 'fish & chips' }))
    expect(screen.getByTestId('where').textContent).toBe('?tag=fish+%26+chips')
    expect(lastFilter().tag).toBe('fish & chips')
  })
})
