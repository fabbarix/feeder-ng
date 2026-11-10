import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CostTile } from './CostTile'

const base = { unpriced: 0, currency: 'USD', shopName: 'Coop' as string | null, onScan: () => {} }

describe('CostTile', () => {
  it('shows the estimate in the household currency, "est. at <Shop>"', () => {
    render(<CostTile {...base} estimatedCostCents={1350} />)
    expect(screen.getByText('$13.50')).toBeInTheDocument()
    expect(screen.getByText('est. at Coop')).toBeInTheDocument()
    expect(screen.queryByText(/without a price/)).toBeNull()
  })

  it('says only "est." when no Shop is picked', () => {
    render(<CostTile {...base} shopName={null} estimatedCostCents={1350} />)
    expect(screen.getByText('est.')).toBeInTheDocument()
  })

  it('says how many Lines have no Price', () => {
    render(<CostTile {...base} currency="EUR" unpriced={2} estimatedCostCents={1350} />)
    expect(screen.getByText('€13.50')).toBeInTheDocument()
    expect(screen.getByText('2 without a price')).toBeInTheDocument()
  })

  it('QA: with no Price at all there is no amount, no "Estimated cost" and no dash', () => {
    const { container } = render(<CostTile {...base} unpriced={3} estimatedCostCents={0} />)
    expect(container).not.toHaveTextContent('$0.00')
    expect(container).not.toHaveTextContent('—')
    expect(screen.queryByText('Estimated cost')).toBeNull()
    expect(screen.getByText('3 without a price')).toBeInTheDocument()
  })

  it('QA: an empty list shows no "$0.00" either', () => {
    const { container } = render(<CostTile {...base} unpriced={0} estimatedCostCents={0} />)
    expect(container).not.toHaveTextContent('$0.00')
  })

  it('always offers Scan (a small accent-secondary Button)', async () => {
    const onScan = vi.fn()
    render(<CostTile {...base} estimatedCostCents={0} onScan={onScan} />)
    const scan = screen.getByRole('button', { name: 'Scan' })
    expect(scan).toHaveAttribute('data-variant', 'accent-secondary')
    await userEvent.click(scan)
    expect(onScan).toHaveBeenCalledTimes(1)
  })
})
