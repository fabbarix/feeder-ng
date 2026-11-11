import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import { anna, ben, cara } from '../household.test-helper'
import type { RecipeLine } from '../types'
import { IngredientLinesList } from './IngredientLinesList'

const lines: RecipeLine[] = [
  { ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: true, note: 'crushed' },
]
const dev = { id: 4, name: 'Dev', userId: null }
const eli = { id: 5, name: 'Eli', userId: null }
const refs = new Map([[7, garlic]])

describe('IngredientLinesList', () => {
  it('lays quantity and name out as separate cells of a two-column grid, not run together', () => {
    const { container } = render(<IngredientLinesList lines={lines} refs={refs} system="metric" />)
    expect(screen.getByText('3 clove')).toBeInTheDocument()
    expect(screen.getByText('Garlic')).toBeInTheDocument()
    expect(screen.getByText('Garlic')).not.toBe(screen.getByText('3 clove'))
    expect(container.querySelector('ul > li')).toBeNull() // the grid is a description list, no bullets
    expect(container.querySelector('dl')).not.toBeNull()
  })
  it('marks optional lines and shows the note', () => {
    render(<IngredientLinesList lines={lines} refs={refs} system="metric" />)
    expect(screen.getByText('optional')).toBeInTheDocument()
    expect(screen.getByText('crushed')).toBeInTheDocument()
  })
  it('has no Exclusion buttons when nothing is given', () => {
    render(<IngredientLinesList lines={lines} refs={refs} system="metric" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

const excluders = [anna, ben, cara, dev, eli]
describe('IngredientLinesList: who excludes an Ingredient (PT)', () => {
  const view = (members: (id: number) => typeof excluders, onOpen = vi.fn()) => {
    render(<IngredientLinesList lines={lines} refs={refs} system="metric" excludedBy={{ members, onOpen }} />)
    return onOpen
  }
  it('has an "Exclusions for garlic" button that opens the Dialog for that Ingredient', async () => {
    const onOpen = view(() => [])
    const button = screen.getByRole('button', { name: 'Exclusions for garlic' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).not.toHaveAttribute('aria-pressed')
    await userEvent.click(button)
    expect(onOpen).toHaveBeenCalledWith(7, 'garlic')
  })
  it('shows nothing extra when nobody excludes the Ingredient', () => {
    view(() => [])
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(/^\+\d+$/)).toBeNull()
  })
  it('shows the Avatars of the Members who exclude it', () => {
    view(() => [anna, ben])
    expect(screen.getByRole('img', { name: 'Anna' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ben' })).toBeInTheDocument()
  })
  it('shows three Avatars at most, then +N', () => {
    view(() => excluders)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Dev' })).toBeNull()
  })
  it('shows exactly three Avatars and no +N for three Members', () => {
    view(() => [anna, ben, cara])
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.queryByText(/^\+\d+$/)).toBeNull()
  })
  it('asks for the Members of each line\'s own Ingredient', () => {
    const members = vi.fn().mockReturnValue([])
    view(members)
    expect(members).toHaveBeenCalledWith(7)
  })
})
