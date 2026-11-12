// Beta.5 F7: the Recipe detail shows the same line in its facts.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipeMetrics } from './RecipeMetrics'

const props = { yieldText: '4', readyMeal: false, totalMinutes: 25, advanceMinutes: 0 }

describe('RecipeMetrics last cooked', () => {
  it('shows the line it is given', () => {
    render(<RecipeMetrics {...props} lastCooked="Last cooked Tue" />)
    expect(screen.getByText('Last cooked Tue')).toBeInTheDocument()
  })
  it('shows "Not cooked yet"', () => {
    render(<RecipeMetrics {...props} lastCooked="Not cooked yet" />)
    expect(screen.getByText('Not cooked yet')).toBeInTheDocument()
  })
  it('shows nothing about it when not given', () => {
    render(<RecipeMetrics {...props} />)
    expect(screen.queryByText(/cooked/i)).toBeNull()
  })
})
