// ds-plan (option B, ADR 0016): the week grid is a BentoGrid min="day": two columns on a tablet, one on a phone, no count.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanGrid } from './PlanGrid'

describe('PlanGrid', () => {
  it('is a labelled group "Plan" sized by min="day", with no column count', () => {
    render(<PlanGrid><p>a day</p></PlanGrid>)
    const grid = screen.getByRole('group', { name: 'Plan' })
    expect(grid).toHaveAttribute('data-min', 'day')
    expect(grid).not.toHaveAttribute('data-columns')
    expect(grid).toHaveClass('bento-grid')
    expect(grid).toHaveTextContent('a day')
  })
})
