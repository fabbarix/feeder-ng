import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipeMetrics } from './RecipeMetrics'

const props = { yieldText: '4', readyMeal: false, totalMinutes: 25, advanceMinutes: 240 }

describe('RecipeMetrics', () => {
  it('gives the Yield its unit: portions per Batch', () => {
    render(<RecipeMetrics {...props} />)
    expect(screen.getByText('4 portions per Batch')).toBeInTheDocument()
  })
  it('says the Advance Step is extra to the total', () => {
    render(<RecipeMetrics {...props} />)
    expect(screen.getByText('25 min cooking')).toBeInTheDocument()
    expect(screen.getByText('+ 4 h ahead')).toBeInTheDocument()
    expect(screen.queryByText(/^Total/)).toBeNull()
  })
  it('says "No Steps" and shows no ahead line for a Recipe without a timeline', () => {
    render(<RecipeMetrics {...props} totalMinutes={0} advanceMinutes={0} />)
    expect(screen.getByText('No Steps')).toBeInTheDocument()
    expect(screen.queryByText(/ahead/)).toBeNull()
  })
  it('does not say "No Steps" next to the ahead line when the only Step is an Advance Step', () => {
    render(<RecipeMetrics {...props} totalMinutes={0} advanceMinutes={120} />)
    expect(screen.getByText('+ 2 h ahead')).toBeInTheDocument()
    expect(screen.queryByText('No Steps')).toBeNull()
  })
  it('marks a Ready Meal', () => {
    render(<RecipeMetrics {...props} readyMeal />)
    expect(screen.getByText('Ready Meal')).toBeInTheDocument()
  })
})
