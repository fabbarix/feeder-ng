import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { garlic } from '../fixtures.test-helper'
import { recipe } from '../fixtures.test-helper'
import { StepsList } from './StepsList'

const steps = recipe().steps
const refs = new Map([[7, garlic]])

describe('StepsList', () => {
  it('numbers the Steps as rows with a number badge and the kind in a meta line', () => {
    const { container } = render(<StepsList steps={steps} refs={refs} />)
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
    expect(screen.getByText('Roast')).toBeInTheDocument()
    expect(screen.getByText('Passive · 40 min')).toBeInTheDocument()
    expect(screen.getByText('Advance Step · 4 h before')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: '[data-step-number]' })).toBeInTheDocument()
  })
  it('shows what the Step uses', () => {
    render(<StepsList steps={steps} refs={refs} />)
    expect(screen.getByText('Uses 2 clove garlic')).toBeInTheDocument()
  })
  it('shows the Step photo at a bounded size', () => {
    const { container } = render(<StepsList steps={steps} refs={refs} />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('src', '/api/images/abc')
    expect(img.closest('.recipe-thumb')).not.toBeNull() // RecipeThumb: object-fit cover, width 100 %
  })
})
