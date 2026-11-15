// B9-43 (SSP-09; mocks/ssp-09-complete.html): "Shopping List complete" is a success STATUS tile (bordered; accent containers are for selected
// filters and the dark hero only). Its summary is three R-E rows on the success tint (a DetailList named "This shop"); under them one
// primary at most: "Put away 17 Stock Lots" when some of this list's Stock Lots are Not sorted, else "Read the receipt" (after a Scan
// session, when the assistant can read it), else no button. When both apply Read the receipt is the outlined secondary.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CelebrationTile, type CelebrationTileProps } from './CelebrationTile'

function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('prefers-reduced-motion'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
}
afterEach(() => vi.unstubAllGlobals())

const props = (over: Partial<CelebrationTileProps> = {}): CelebrationTileProps => ({
  summary: { lines: 20, spentCents: 1079, lotsAdded: 23 },
  currency: 'USD',
  shopName: 'Coop',
  unsorted: 17,
  canReadReceipt: true,
  onPutAway: () => {},
  onReadReceipt: () => {},
  ...over,
})
const show = (over: Partial<CelebrationTileProps> = {}) => {
  motion(false)
  return render(<CelebrationTile {...props(over)} />)
}
const tile = () => screen.getByRole('status')
const rows = () => within(within(tile()).getByRole('list', { name: 'This shop' })).getAllByRole('listitem')

describe('CelebrationTile: the tile', () => {
  it('is a success status tile (bordered), role status, titled "Shopping List complete", with the celebration icon', () => {
    show()
    expect(tile()).toHaveAttribute('data-variant', 'status')
    expect(tile()).toHaveAttribute('data-status', 'success')
    expect(within(tile()).getByRole('heading', { name: 'Shopping List complete' })).toBeInTheDocument()
    expect(tile().querySelector('svg')).not.toBeNull()
  })

  it('is not a soft (accent) tile any more', () => {
    show()
    expect(tile()).not.toHaveAttribute('data-variant', 'soft')
  })

  it('animates unless the User prefers reduced motion', () => {
    motion(false)
    const { unmount } = render(<CelebrationTile {...props()} />)
    expect(tile()).toHaveAttribute('data-celebrate')
    unmount()
    motion(true)
    render(<CelebrationTile {...props()} />)
    expect(tile()).not.toHaveAttribute('data-celebrate')
  })
})

describe('CelebrationTile: the three rows (R-E, a DetailList in the success tone)', () => {
  it('"Lines ticked · 20", "Spent at Coop · $10.79", "Stock Lots added · 23", in this order', () => {
    show()
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Lines ticked\s*20/),
      expect.stringMatching(/^Spent at Coop\s*\$10\.79/),
      expect.stringMatching(/^Stock Lots added\s*23/),
    ])
    expect(within(tile()).getByRole('list', { name: 'This shop' })).toHaveAttribute('data-tone', 'success')
    expect(within(tile()).getByRole('list', { name: 'This shop' })).toHaveClass('detail-list')
  })

  it('the figures are the rows\' states (right-aligned DetailRow state), the keys are the labels', () => {
    show()
    const [lines] = rows()
    expect(lines!.querySelector('.detail-row__label')).toHaveTextContent('Lines ticked')
    expect(lines!.querySelector('.detail-row__state')).toHaveTextContent('20')
  })

  it('the Stock Lots row says "17 not sorted into a Storage Place yet" as its muted detail, only when some are', () => {
    show()
    expect(rows()[2]!.querySelector('.detail-row__detail')).toHaveTextContent('17 not sorted into a Storage Place yet')
    document.body.innerHTML = ''
    show({ unsorted: 0 })
    expect(rows()[2]!.querySelector('.detail-row__detail')).toBeNull()
  })

  it('one Stock Lot not sorted reads "1 not sorted into a Storage Place yet"', () => {
    show({ unsorted: 1, summary: { lines: 3, spentCents: 0, lotsAdded: 1 } })
    expect(rows().at(-1)!).toHaveTextContent('1 not sorted into a Storage Place yet')
    expect(rows().at(-1)!).toHaveTextContent('Stock Lot added')
  })

  it('the "Spent" row is left out when nothing was spent (no "$0.00")', () => {
    show({ summary: { lines: 20, spentCents: 0, lotsAdded: 23 } })
    expect(rows().map((r) => r.querySelector('.detail-row__label')?.textContent)).toEqual(['Lines ticked', 'Stock Lots added'])
    expect(tile()).not.toHaveTextContent('$0.00')
  })

  it('with Any Shop picked the Spent row reads just "Spent" (there is no Shop to name)', () => {
    show({ shopName: null })
    expect(rows()[1]!.querySelector('.detail-row__label')).toHaveTextContent(/^Spent$/)
  })

  it('"Lines ticked" is capitalised: no lowercase "20 lines" fact is left', () => {
    show()
    expect(tile()).not.toHaveTextContent(/\d+ lines?\b/)
  })
})

describe('CelebrationTile: the buttons (one primary at most)', () => {
  const buttons = () => within(tile()).queryAllByRole('button')
  const primaries = () => tile().querySelectorAll('button[data-variant="primary"]')

  it('Some Stock Lots Not sorted: "Put away 17 Stock Lots" is the primary and "Read the receipt" an outlined secondary after it', async () => {
    const onPutAway = vi.fn()
    const onReadReceipt = vi.fn()
    show({ onPutAway, onReadReceipt })
    expect(buttons().map((b) => b.textContent)).toEqual(['Put away 17 Stock Lots', 'Read the receipt'])
    expect(primaries()).toHaveLength(1)
    expect(buttons()[0]).toHaveAttribute('data-variant', 'primary')
    expect(buttons()[1]).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(buttons()[0]!)
    await userEvent.click(buttons()[1]!)
    expect(onPutAway).toHaveBeenCalledOnce()
    expect(onReadReceipt).toHaveBeenCalledOnce()
  })

  it('"Put away 1 Stock Lot" (singular)', () => {
    show({ unsorted: 1 })
    expect(buttons()[0]).toHaveTextContent('Put away 1 Stock Lot')
    expect(buttons()[0]).not.toHaveTextContent('Lots')
  })

  it('nothing to put away: "Read the receipt" becomes the primary', () => {
    show({ unsorted: 0 })
    expect(buttons().map((b) => b.textContent)).toEqual(['Read the receipt'])
    expect(buttons()[0]).toHaveAttribute('data-variant', 'primary')
  })

  it('no Scan session or no assistant: only Put away, and it is the primary', () => {
    show({ canReadReceipt: false })
    expect(buttons().map((b) => b.textContent)).toEqual(['Put away 17 Stock Lots'])
    expect(buttons()[0]).toHaveAttribute('data-variant', 'primary')
  })

  it('neither: no button at all', () => {
    show({ unsorted: 0, canReadReceipt: false })
    expect(buttons()).toHaveLength(0)
    expect(tile().querySelector('.celebration-tile__actions')).toBeNull()
  })

  it('the buttons sit after the title and the rows in the DOM (reachable in order after the title)', () => {
    show()
    const order = [...tile().querySelectorAll('h2, ul, button')].map((e) => e.tagName)
    expect(order).toEqual(['H2', 'UL', 'BUTTON', 'BUTTON'])
    expect(tile().querySelector('.celebration-tile__actions')).not.toBeNull()
  })

  it('a missing unsorted count (the screen did not pass one) is no Put away button', () => {
    show({ unsorted: undefined })
    expect(buttons().map((b) => b.textContent)).toEqual(['Read the receipt'])
  })
})
