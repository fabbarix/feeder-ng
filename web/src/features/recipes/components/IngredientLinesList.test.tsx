import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
