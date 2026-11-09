import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CostTile } from './CostTile'

describe('CostTile', () => {
  it('shows the estimate in the household currency', () => {
    render(<CostTile costCents={1350} unpriced={0} currency="USD" />)
    expect(screen.getByText('Estimated cost')).toBeInTheDocument()
    expect(screen.getByText('$13.50')).toBeInTheDocument()
    expect(screen.queryByText(/without a price/)).toBeNull()
  })

  it('says how many Lines have no Price', () => {
    render(<CostTile costCents={1350} unpriced={2} currency="EUR" />)
    expect(screen.getByText('€13.50')).toBeInTheDocument()
    expect(screen.getByText('2 without a price')).toBeInTheDocument()
  })

  it('shows a dash when nothing is priced', () => {
    render(<CostTile costCents={0} unpriced={3} currency="USD" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows zero for an empty list', () => {
    render(<CostTile costCents={0} unpriced={0} currency="USD" />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })
})
