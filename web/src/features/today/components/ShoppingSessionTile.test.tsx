// B9-44 (TB-12, decision TB 5, mock tb-12-b-resume): "Shopping at Coop": a full-row soft tile, first on Today, with the Scan session's
// meta, Back to Scan (primary) and Done shopping (secondary, a button with a fill and an outline).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShoppingSessionTile } from './ShoppingSessionTile'

const T0 = Date.parse('2026-11-13T10:00:00Z')
const session = { shopId: 7, shopName: 'Coop', scanned: 7, lastScanAt: T0 - 4 * 60_000 }
const view = (over: Partial<Parameters<typeof ShoppingSessionTile>[0]> = {}) =>
  render(<ShoppingSessionTile session={session} linesToGet={11} now={new Date(T0)} onBack={() => {}} onDone={() => {}} {...over} />)

describe('ShoppingSessionTile', () => {
  it('is a section named "Shopping at Coop" by its h2, a full-row soft tile', () => {
    const { container } = view()
    const section = screen.getByRole('region', { name: 'Shopping at Coop' })
    expect(within(section).getByRole('heading', { level: 2, name: 'Shopping at Coop' })).toBeInTheDocument()
    expect(section).toHaveAttribute('data-variant', 'soft')
    expect(section).toHaveAttribute('data-span', 'full')
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
  })

  it('has a neutral badge in its header and no count, no link', () => {
    const { container } = view()
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'neutral')
    expect(container.querySelector('.tile-header .chip')).toBeNull()
    expect(container.querySelector('.tile-header__action')).toBeNull()
  })

  it('says what was scanned, what is left and when the last Scan was', () => {
    view()
    expect(screen.getByText('7 scanned · 11 Lines to get · last Scan 4 min ago')).toBeInTheDocument()
  })

  it('Back to Scan is the primary, Done shopping a secondary button; there is one primary', async () => {
    const onBack = vi.fn()
    const onDone = vi.fn()
    view({ onBack, onDone })
    const back = screen.getByRole('button', { name: 'Back to Scan' })
    const done = screen.getByRole('button', { name: 'Done shopping' })
    expect(back).toHaveAttribute('data-variant', 'primary')
    expect(done).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
    await userEvent.click(done)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('button[data-variant="primary"]')).toHaveLength(1)
  })

  it('the relative time updates without being announced (the meta is not a live region)', () => {
    const { container } = view()
    expect(container.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull()
  })
})
