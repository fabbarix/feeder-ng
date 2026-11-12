// Beta.5 F7: the Recipe detail shows when it was last cooked, in its facts.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
vi.mock('../hooks/useRecipeTags', () => ({ useRecipeTags: () => ({ known: [], colourOf: () => undefined }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ choices: [], isPending: false, isError: false }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const show = (lastCookedOn: string | null) => {
  h.recipe = { recipe: recipe({ lastCookedOn }), isLoading: false, error: null, setArchived: vi.fn(), remove: vi.fn() }
  render(
    <MemoryRouter initialEntries={['/recipes/3']}>
      <ConfirmProvider>
        <Routes>
          <Route path="/recipes/3" element={<RecipeDetailScreen />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 12, 10, 0) })
})
afterEach(() => vi.useRealTimers())

describe('RecipeDetailScreen Last cooked', () => {
  it('says when it was last cooked', () => {
    show('2026-11-10')
    expect(screen.getByText('Last cooked Tue')).toBeInTheDocument()
  })
  it('says it was cooked today', () => {
    show('2026-11-12')
    expect(screen.getByText('Last cooked today')).toBeInTheDocument()
  })
  it('says "Not cooked yet" for a Recipe never cooked', () => {
    show(null)
    expect(screen.getByText('Not cooked yet')).toBeInTheDocument()
  })
})
