// DS-SHOP (docs/design/system.md §2, §4): the header metrics are a metric strip (BentoGrid min="metric", auto-fit): "Left to get",
// the estimated total and the Scan tile ("N lines have no Price yet"). Scan is the one primary action; the progress fill is success.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { shopSummary } from '../lib/summary'
import { makeList } from '../testData'
import { ShopMetrics } from './ShopMetrics'

const summary = (over = {}, shop: string | null = 'Coop') => shopSummary(makeList({ progress: { ticked: 2, total: 18 }, estimatedCostCents: 1966, unpricedLines: 13, ...over }), shop)

describe('ShopMetrics', () => {
  it('is a metric strip: a labelled BentoGrid with min="metric"', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    const strip = screen.getByRole('group', { name: 'Summary' })
    expect(strip).toHaveClass('bento-grid')
    expect(strip).toHaveAttribute('data-min', 'metric')
  })

  it('"Left to get" is a progress bar over the Lines, with the number left as its big value', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    const bar = screen.getByRole('progressbar', { name: 'Left to get' })
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '18')
    const value = document.querySelector('.shop-metrics__value[data-metric="left"]')!
    expect(value).toHaveTextContent('16')
    expect(bar.querySelector('.shop-metrics__fill')).toBeInTheDocument()
    expect(screen.getByText('Left to get')).toBeInTheDocument()
  })

  it('the estimated total, with "est. at <Shop>"', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    expect(screen.getByText('Est. total')).toBeInTheDocument()
    expect(document.querySelector('.shop-metrics__value[data-metric="total"]')).toHaveTextContent('$19.66')
    expect(screen.getByText('est. at Coop')).toBeInTheDocument()
  })

  it('has no total tile when nothing is priced (no "$0.00", no dash)', () => {
    const { container } = render(<ShopMetrics summary={summary({ estimatedCostCents: 0 })} onScan={() => {}} />)
    expect(screen.queryByText('Est. total')).toBeNull()
    expect(container).not.toHaveTextContent('$0.00')
    expect(container).not.toHaveTextContent('—')
  })

  it('the Scan tile says how many Lines have no Price yet and holds the Scan button', async () => {
    const onScan = vi.fn()
    render(<ShopMetrics summary={summary()} onScan={onScan} />)
    const tile = screen.getByText('13 lines have no Price yet').closest('.tile') as HTMLElement
    await userEvent.click(within(tile).getByRole('button', { name: 'Scan' }))
    expect(onScan).toHaveBeenCalledOnce()
  })

  it('Scan is the strip\'s one primary (accent solid) action; with every Line priced the tile is just the Scan button', () => {
    render(<ShopMetrics summary={summary({ unpricedLines: 0 })} onScan={() => {}} />)
    expect(screen.queryByText(/have no Price yet|has no Price yet/)).toBeNull()
    const primaries = document.querySelectorAll('button[data-variant="primary"]')
    expect(primaries).toHaveLength(1)
    expect(primaries[0]).toHaveTextContent('Scan')
  })

  it('the "Left to get" tile is an accent container (soft); the others are plain surfaces', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    const left = screen.getByRole('progressbar', { name: 'Left to get' }).closest('.tile')!
    expect(left).toHaveAttribute('data-variant', 'soft')
    expect(screen.getByText('Est. total').closest('.tile')).toHaveAttribute('data-variant', 'surface')
  })

  it('there are at most three tiles, so the strip is one row on a phone', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    expect(screen.getByRole('group', { name: 'Summary' }).querySelectorAll(':scope > .tile').length).toBeLessThanOrEqual(3)
  })
})
