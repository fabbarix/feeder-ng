import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../testData'
import { ShoppingBody } from './ShoppingBody'

// b8-polish (docs/dev/design/b8-polish.md 2): ShoppingBody takes `compact` from the screen (a hook decides). A compact Supply row
// shows "400 ml in Stock" and keeps the full "Below 1 l · 400 ml in Stock" for assistive technology; food hints and wide rows are untouched.
const base = { system: 'metric' as const, shopName: 'Coop', onTick: () => {}, onUntick: () => {}, onOpenLine: () => {}, onScan: () => {} }
const list = () =>
  makeList({
    lines: [makeLine({ ingredientId: 20, name: 'Washing-up liquid', baseUnit: 'ml', kind: 'supply', restock: { level: 1000, stock: 400 }, need: 1000, available: 400, quantity: 600, pack: null, estimatedCostCents: null })],
    progress: { ticked: 0, total: 1 },
  })
const supplies = () => within(screen.getByRole('list', { name: 'Supplies' }))

describe('ShoppingBody: compact Restock reason', () => {
  it('without compact the row reads "Below 1 l · 400 ml in Stock"', () => {
    render(<ShoppingBody {...base} list={list()} />)
    expect(supplies().getByText('Below 1 l · 400 ml in Stock')).not.toHaveClass('visually-hidden')
    // B9-13: the short form is still there as the row's compact meta, shown by ListRow only while its text column is under 12 rem
    expect(supplies().getByText('400 ml in Stock')).toHaveClass('list-row__meta-compact')
  })
  it('with compact the meta shows "400 ml in Stock" and its accessible text is the full "Below 1 l · 400 ml in Stock"', () => {
    render(<ShoppingBody {...base} list={list()} compact />)
    const meta = supplies().getByText('400 ml in Stock')
    expect(meta.closest('.list-row__meta')).toHaveAttribute('data-status', 'info')
    expect(supplies().getByText('Below 1 l · 400 ml in Stock')).toHaveClass('visually-hidden')
    expect(meta).toHaveAttribute('aria-hidden', 'true')
  })
  it('a Not needed Supply row follows the same width: compact, with the full text for assistive technology', async () => {
    const line = list().lines[0]!
    render(<ShoppingBody {...base} list={makeList({ lines: [], notNeeded: [line], progress: { ticked: 0, total: 0 } })} compact />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    const notNeeded = within(screen.getByRole('list', { name: 'Not needed' }))
    expect(notNeeded.getByText('400 ml in Stock')).toBeInTheDocument()
    expect(notNeeded.getByText('Below 1 l · 400 ml in Stock')).toHaveClass('visually-hidden')
    expect(notNeeded.getByText('400 ml in Stock')).toHaveAttribute('aria-hidden', 'true')
  })
})
