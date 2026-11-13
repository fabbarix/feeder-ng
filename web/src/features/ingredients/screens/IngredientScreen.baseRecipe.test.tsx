import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngredientDetail } from '../types'

// BR-D: the Ingredient page of a Base recipe's Ingredient: the badge and link, the name and the batch / portion conversions read-only.
const base: IngredientDetail = {
  id: 30, name: 'Béchamel', baseUnit: 'ml', shelfLifeDays: 4, references: {},
  conversions: [{ unit: 'batch', toBase: 1000 }, { unit: 'portion', toBase: 250 }, { unit: 'jar', toBase: 400 }],
  baseRecipe: { id: 3, name: 'Béchamel', archived: false },
}
const hook = {
  ingredient: base as IngredientDetail | undefined, isLoading: false, error: null as Error | null, referenceCount: 0,
  rename: vi.fn().mockResolvedValue({}), setBaseUnit: vi.fn().mockResolvedValue({}), setShelfLife: vi.fn().mockResolvedValue({}), setFrozenShelfLife: vi.fn().mockResolvedValue({}),
  setConversion: vi.fn().mockResolvedValue({}), removeConversion: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue(undefined),
}
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))
vi.mock('./../components/MergeSheet', () => ({ MergeSheet: () => null }))

import { IngredientScreen } from './IngredientScreen'

const setup = () => {
  const router = createMemoryRouter(
    [{ path: '/recipes/:id', element: <p>recipe page</p> }, { path: '/ingredients/:id', element: <IngredientScreen /> }],
    { initialEntries: ['/ingredients/30'] },
  )
  render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  hook.ingredient = base
})

describe('IngredientScreen: a Base recipe\'s Ingredient', () => {
  it('shows the badge and a link to the Base recipe', async () => {
    setup()
    expect(screen.getByText('Base recipe')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Open Béchamel (Base recipe)' }))
    expect(screen.getByText('recipe page')).toBeInTheDocument()
  })
  it('has no Rename; the name follows the Base recipe, and says so', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
    expect(screen.getByText('Rename the Base recipe to rename this Ingredient.')).toBeInTheDocument()
  })
  it('shows the batch and portion conversions read-only ("Set by the Base recipe"), and others as before', () => {
    setup()
    expect(screen.getByText('1 batch = 1000 ml')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove batch' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove portion' })).toBeNull()
    expect(screen.getAllByText('Set by the Base recipe')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Remove jar' })).toBeInTheDocument()
  })
  it('a plain Ingredient is unchanged: Rename and every Remove stay', () => {
    hook.ingredient = { ...base, baseRecipe: null, name: 'milk', conversions: [{ unit: 'batch', toBase: 1000 }] }
    setup()
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove batch' })).toBeInTheDocument()
    expect(screen.queryByText('Base recipe')).toBeNull()
  })
  it('an archived Base recipe is badged as such', () => {
    hook.ingredient = { ...base, baseRecipe: { id: 3, name: 'Béchamel', archived: true } }
    setup()
    expect(screen.getByText('Base recipe, archived')).toBeInTheDocument()
  })
})
