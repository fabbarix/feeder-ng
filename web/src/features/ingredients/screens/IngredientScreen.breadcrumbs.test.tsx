// R11a: Ingredient detail: Ingredients > name above the h1; no inline back link in any state.
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { IngredientDetail } from '../types'

const base: IngredientDetail = { id: 7, name: 'garlic', baseUnit: 'g', shelfLifeDays: 30, conversions: [], references: {} }
const hook = { ingredient: base as IngredientDetail | undefined, isLoading: false, error: null as Error | null, referenceCount: 0 }
vi.mock('../hooks/useIngredient', () => ({ useIngredient: () => hook }))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))
vi.mock('../../products', () => ({ IngredientProducts: () => <p>products tile</p> }))
vi.mock('../../recipes/components/IngredientExclusionList', () => ({ IngredientExclusionList: () => <p>exclusion list</p> }))

import { IngredientScreen } from './IngredientScreen'

const setup = () => {
  const router = createMemoryRouter([{ path: '/ingredients/:id', element: <IngredientScreen /> }], { initialEntries: ['/ingredients/7'] })
  return render(<RouterProvider router={router} />)
}
const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' })

beforeEach(() => {
  hook.ingredient = base
  hook.error = null
  hook.isLoading = false
})

describe('IngredientScreen breadcrumbs', () => {
  it('shows Ingredients > Garlic (the displayed name) above the h1, in a PageHeader', () => {
    const { container } = setup()
    expect(trail().querySelector('a[href="/ingredients"]')).toHaveTextContent('Ingredients')
    expect(trail().querySelector('[aria-current="page"]')).toHaveTextContent('Garlic')
    expect(container.querySelector('.page-header')).toContainElement(trail())
    const h1 = screen.getByRole('heading', { level: 1, name: 'Garlic' })
    expect(trail().compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a missing Ingredient keeps the trail with the GLOSSARY fallback and no inline back link', () => {
    hook.ingredient = undefined
    hook.error = new ApiError(404, 'not_found', 'x')
    setup()
    expect(trail().querySelector('a[href="/ingredients"]')).toHaveTextContent('Ingredients')
    expect(trail().querySelector('[aria-current="page"]')).toHaveTextContent('Ingredient')
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href') === '/ingredients')).toHaveLength(1)
  })
})
