// TG-RW: Tag colours on the Recipes list: the filter, the tiles, and /recipes?tag= (docs/dev/design/tg-rw.md 5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
vi.mock('../hooks/useRecipeTags', () => ({
  useRecipeTags: () => ({ known: [], colourOf: (n: string) => ({ roast: 'tomato', sweet: 'plum' })[n.toLowerCase()] }),
}))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipesScreen } from './RecipesScreen'

const view = (url = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/recipes" element={<RecipesScreen />} /></Routes>
    </MemoryRouter>,
  )
const lastFilter = () => state.filters.at(-1) as RecipeFilter

beforeEach(() => {
  state.filters = []
  state.result = {
    recipes: [summary({ id: 1, name: 'Pancakes', tags: ['sweet', 'roast', 'kids'] }), summary({ id: 2, name: 'Roast tray', tags: ['roast'] })],
    tags: [{ name: 'roast', recipes: 2 }, { name: 'sweet', recipes: 1 }, { name: 'kids', recipes: 1 }],
    isLoading: false, isEmpty: false, error: null,
  }
})

describe('RecipesScreen Tag colours', () => {
  it('colours the Tag filter chips', () => {
    view()
    const filter = screen.getByRole('group', { name: 'All Tags' })
    expect(within(filter).getByRole('button', { name: 'roast' })).toHaveAttribute('data-tag-colour', 'tomato')
    expect(within(filter).getByRole('button', { name: 'sweet' })).toHaveAttribute('data-tag-colour', 'plum')
    expect(within(filter).getByRole('button', { name: 'kids' })).not.toHaveAttribute('data-tag-colour')
  })
  it('shows each tile\'s first two Tags in colour and "+1" for the third', () => {
    view()
    const lists = screen.getAllByRole('list', { name: 'Tags' })
    expect(within(lists[0]!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['sweet', 'roast', '+1'])
    expect(lists[0]!.querySelectorAll('[data-tag-colour]')).toHaveLength(2)
  })
  it('opens already filtered by the Tag in ?tag= (the Recipe detail\'s Tag chips link here)', () => {
    view('/recipes?tag=roast')
    expect(lastFilter().tag).toBe('roast')
    expect(within(screen.getByRole('group', { name: 'All Tags' })).getByRole('button', { name: 'roast' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('has no Tag filter without ?tag=', () => {
    view()
    expect(lastFilter().tag).toBeUndefined()
  })
  it('choosing a Tag chip still filters', async () => {
    view()
    await userEvent.click(within(screen.getByRole('group', { name: 'All Tags' })).getByRole('button', { name: 'sweet' }))
    expect(lastFilter().tag).toBe('sweet')
  })
})
