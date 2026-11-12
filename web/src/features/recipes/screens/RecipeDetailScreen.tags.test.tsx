// TG-RW: every Tag of a Recipe on its detail, in colour, each opening the filtered list (docs/dev/design/tg-rw.md 5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { garlic, recipe } from '../fixtures.test-helper'
import { household } from '../household.test-helper'

const h = vi.hoisted(() => ({
  recipe: {} as Record<string, unknown>,
  household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences,
}))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic]]), isLoading: false }) }))
vi.mock('../hooks/useRecipeTags', () => ({
  useRecipeTags: () => ({ known: [], colourOf: (n: string) => ({ roast: 'tomato', quick: 'sage' })[n.toLowerCase()] }),
}))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const Where = () => {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
const show = (tags: string[]) => {
  h.recipe = { recipe: recipe({ tags }), isLoading: false, error: null, setArchived: vi.fn(), remove: vi.fn() }
  render(
    <MemoryRouter initialEntries={['/recipes/3']}>
      <ConfirmProvider>
        <Routes>
          <Route path="/recipes/3" element={<RecipeDetailScreen />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
})

describe('RecipeDetailScreen Tags', () => {
  it('shows every Tag (no "+N"), in the Recipe\'s order, in colour', () => {
    show(['quick', 'roast', 'kids', 'sweet'])
    const list = screen.getByRole('list', { name: 'Tags' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['quick', 'roast', 'kids', 'sweet'])
    expect(within(list).getByRole('button', { name: 'quick' })).toHaveAttribute('data-tag-colour', 'sage')
    expect(within(list).getByRole('button', { name: 'kids' })).not.toHaveAttribute('data-tag-colour')
  })
  it('colours a Tag whose spelling differs from the Tag\'s name (by key)', () => {
    show(['Roast'])
    expect(screen.getByRole('button', { name: 'Roast' })).toHaveAttribute('data-tag-colour', 'tomato')
  })
  it('a Tag opens the Recipes list filtered by it', async () => {
    show(['quick', 'Purée'])
    await userEvent.click(screen.getByRole('button', { name: 'Purée' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/recipes?tag=Pur%C3%A9e')
  })
  it('shows no Tags list for a Recipe without Tags', () => {
    show([])
    expect(screen.queryByRole('list', { name: 'Tags' })).toBeNull()
  })
})
