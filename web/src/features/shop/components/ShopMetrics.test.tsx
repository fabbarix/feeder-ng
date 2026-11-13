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
  })

  it('round 2: the tile reads "16 of 18 left", with the meta line "2 ticked \u00b7 until Sun 15"', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    const tile = screen.getByRole('progressbar', { name: 'Left to get' }).closest('.tile')!
    expect(tile.querySelector('.shop-metrics__value[data-metric="left"]')).toHaveTextContent('16')
    expect(tile.querySelector('.shop-metrics__unit')).toHaveTextContent('of 18 left')
    expect(tile.querySelector('.shop-metrics__meta')).toHaveTextContent('2 ticked \u00b7 until Sun 15')
  })

  it('round 2: the fill width is the summary\'s percent, not computed here (a summary that says 40 shows 40)', () => {
    render(<ShopMetrics summary={{ ...summary(), percent: 40 }} onScan={() => {}} />)
    expect(document.querySelector('.shop-metrics__fill')!.getAttribute('style')).toMatch(/\b40%/)
  })

  it('round 2: with nothing ticked the bar is still there as a full-width empty track (fill 0%)', () => {
    render(<ShopMetrics summary={summary({ progress: { ticked: 0, total: 18 } })} onScan={() => {}} />)
    const bar = screen.getByRole('progressbar', { name: 'Left to get' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar.querySelector('.shop-metrics__fill')!.getAttribute('style')).toMatch(/\b0%/)
  })

  it('round 2: with no Price anywhere the Scan tile still has its caption and a Scan button that fills the tile', () => {
    render(<ShopMetrics summary={summary({ estimatedCostCents: 0, unpricedLines: 12 })} onScan={() => {}} />)
    const tile = screen.getByText('12 Lines have no Price yet').closest('.tile') as HTMLElement
    expect(tile).toHaveClass('shop-metrics__scan-tile')
    const caption = tile.querySelector('.shop-metrics__caption')!
    const button = within(tile).getByRole('button', { name: 'Scan' })
    expect(button).toHaveClass('shop-metrics__scan')
    expect(caption.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
    const tile = screen.getByText('13 Lines have no Price yet').closest('.tile') as HTMLElement
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

  it('no metric tile is an accent container (system.md 2): all are plain surfaces', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    const left = screen.getByRole('progressbar', { name: 'Left to get' }).closest('.tile')!
    expect(left).toHaveAttribute('data-variant', 'surface')
    expect(screen.getByText('Est. total').closest('.tile')).toHaveAttribute('data-variant', 'surface')
  })

  it('there are at most three tiles, so the strip is one row on a phone', () => {
    render(<ShopMetrics summary={summary()} onScan={() => {}} />)
    expect(screen.getByRole('group', { name: 'Summary' }).querySelectorAll(':scope > .tile').length).toBeLessThanOrEqual(3)
  })
})
