import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import type { RecipeLine } from '../types'
import { IngredientLinesList } from './IngredientLinesList'

const lines: RecipeLine[] = [
  { ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: true, note: 'crushed' },
]
const refs = new Map([[7, garlic]])

describe('IngredientLinesList', () => {
  it('lays quantity and name out as separate cells of a two-column grid, not run together', () => {
    const { container } = render(<IngredientLinesList lines={lines} refs={refs} system="metric" />)
    expect(screen.getByText('3 clove')).toBeInTheDocument()
    expect(screen.getByText('garlic')).toBeInTheDocument()
    expect(screen.getByText('garlic')).not.toBe(screen.getByText('3 clove'))
    expect(container.querySelector('ul > li')).toBeNull() // the grid is a description list, no bullets
    expect(container.querySelector('dl')).not.toBeNull()
  })
  it('marks optional lines and shows the note', () => {
    render(<IngredientLinesList lines={lines} refs={refs} system="metric" />)
    expect(screen.getByText('optional')).toBeInTheDocument()
    expect(screen.getByText('crushed')).toBeInTheDocument()
  })
  it('toggles an Ingredient Exclusion with a pressed IconButton', async () => {
    const onToggle = vi.fn()
    render(<IngredientLinesList lines={lines} refs={refs} system="metric" exclusions={{ isExcluded: (id) => id === 7, onToggle }} />)
    const button = screen.getByRole('button', { name: 'Exclude garlic' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(button)
    expect(onToggle).toHaveBeenCalledWith(7)
  })
  it('has no Exclusion buttons when there is no Member', () => {
    render(<IngredientLinesList lines={lines} refs={refs} system="metric" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
