import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanGrid } from './PlanGrid'

describe('PlanGrid', () => {
  it.each([2, 4, 7] as const)('is a labelled group with %i columns', (columns) => {
    render(<PlanGrid columns={columns}><p>a day</p></PlanGrid>)
    const grid = screen.getByRole('group', { name: 'Plan' })
    expect(grid).toHaveAttribute('data-columns', String(columns))
    expect(grid).toHaveTextContent('a day')
  })
})
