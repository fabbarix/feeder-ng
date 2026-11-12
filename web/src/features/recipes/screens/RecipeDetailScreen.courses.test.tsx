// CRS E2: Course chips on the Recipe detail (docs/dev/design/crs-e2.md 5).
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '../../../ui'
import { courseChoices, garlic, recipe } from '../fixtures.test-helper'
import { household } from '../household.test-helper'

const h = vi.hoisted(() => ({
  recipe: {} as Record<string, unknown>,
  household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences,
}))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: new Map([[7, garlic]]), isLoading: false }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: courseChoices, isPending: false, isError: false }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const view = () =>
  render(
    <MemoryRouter initialEntries={['/recipes/3']}>
      <ConfirmProvider>
        <Routes>
          <Route path="/recipes/:id" element={<RecipeDetailScreen />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  )
const show = (over: Parameters<typeof recipe>[0]) => {
  h.recipe = { recipe: recipe(over), isLoading: false, error: null, setArchived: vi.fn(), remove: vi.fn() }
  view()
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
})

describe('RecipeDetailScreen Courses', () => {
  it('shows the Courses as chips, in the Recipe\'s order', () => {
    show({ courses: [{ id: 1, name: 'Main' }, { id: 2, name: 'Side' }] })
    const list = screen.getByRole('list', { name: 'Courses' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Main', 'Side'])
  })
  it('adds the Whole meal chip for a Whole meal Recipe in the main Course', () => {
    show({ courses: [{ id: 1, name: 'Main' }], wholeMeal: true })
    expect(within(screen.getByRole('list', { name: 'Courses' })).getByText('Whole meal')).toBeInTheDocument()
  })
  it('has no Whole meal chip when the Recipe is not in the main Course, whatever its stored value', () => {
    show({ courses: [{ id: 2, name: 'Side' }], wholeMeal: true })
    expect(screen.queryByText('Whole meal')).toBeNull()
  })
  it('has no Whole meal chip when the stored value is false', () => {
    show({ courses: [{ id: 1, name: 'Main' }], wholeMeal: false })
    expect(screen.queryByText('Whole meal')).toBeNull()
  })
})
