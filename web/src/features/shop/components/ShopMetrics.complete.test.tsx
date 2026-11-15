// B9-43 (SSP-09): with every Line ticked the metric strip's Scan becomes an outlined secondary with the caption "Every Line is ticked"
// (the complete tile owns the one primary). Otherwise Scan stays the strip's primary.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { shopSummary } from '../lib/summary'
import { makeList } from '../testData'
import { ShopMetrics } from './ShopMetrics'

const done = () => shopSummary(makeList({ complete: true, progress: { ticked: 20, total: 20 }, unpricedLines: 3 }), 'Coop')
const open = () => shopSummary(makeList({ complete: false, progress: { ticked: 2, total: 20 }, unpricedLines: 3 }), 'Coop')

describe('shopSummary: complete', () => {
  it('follows the list\'s complete flag', () => {
    expect(done().complete).toBe(true)
    expect(open().complete).toBe(false)
  })
})

describe('ShopMetrics when the Shopping List is complete (SSP-09)', () => {
  it('Scan is an outlined secondary button, and the caption is "Every Line is ticked" (not the unpriced count)', () => {
    render(<ShopMetrics summary={done()} onScan={() => {}} />)
    const scanTile = screen.getByRole('button', { name: 'Scan' }).closest('.tile') as HTMLElement
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(scanTile).getByText('Every Line is ticked')).toBeInTheDocument()
    expect(scanTile).not.toHaveTextContent('have no Price yet')
  })

  it('there is no primary button in the strip then', () => {
    render(<ShopMetrics summary={done()} onScan={() => {}} />)
    expect(document.querySelectorAll('button[data-variant="primary"]')).toHaveLength(0)
  })

  it('while Lines are open Scan is still the strip\'s one primary', () => {
    render(<ShopMetrics summary={open()} onScan={() => {}} />)
    expect(screen.getByRole('button', { name: 'Scan' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.queryByText('Every Line is ticked')).toBeNull()
  })
})
