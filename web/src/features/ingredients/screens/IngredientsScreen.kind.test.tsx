// H5: /ingredients is food only: the list hook is asked for food and the New Ingredient sheet is fixed to food.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { garlicJSON } from '../supply.test-helper'

const seen: Array<string | undefined> = []
vi.mock('../hooks/useIngredients', () => ({
  useIngredients: (_q: string, kind?: string) => {
    seen.push(kind)
    return { ingredients: [garlicJSON], isEmpty: false, isLoading: false, error: null, create: vi.fn() }
  },
}))
vi.mock('../hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => 'metric' }))

import { IngredientsScreen } from './IngredientsScreen'

describe('IngredientsScreen is food only (decision D5)', () => {
  it('asks the hook for food', () => {
    render(<RouterProvider router={createMemoryRouter([{ path: '/ingredients', element: <IngredientsScreen /> }], { initialEntries: ['/ingredients'] })} />)
    expect(seen.at(-1)).toBe('food')
  })
  it('opens the New Ingredient sheet fixed to food: no Food | Supply choice', async () => {
    render(<RouterProvider router={createMemoryRouter([{ path: '/ingredients', element: <IngredientsScreen /> }], { initialEntries: ['/ingredients'] })} />)
    await userEvent.click(screen.getByRole('button', { name: 'New Ingredient' }))
    expect(screen.queryByRole('radiogroup', { name: 'Kind' })).toBeNull()
    expect(screen.getByLabelText(/Shelf Life/)).toBeInTheDocument()
  })
})
