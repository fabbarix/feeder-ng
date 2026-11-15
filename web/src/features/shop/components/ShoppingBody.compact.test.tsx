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

describe('ShoppingBody: the compact Restock reason is the row\'s own (B9-34, SSP-05)', () => {
  it('without compact the row reads "Below 1 l · 400 ml in Stock"', () => {
    render(<ShoppingBody {...base} list={list()} />)
    expect(supplies().getByText('Below 1 l · 400 ml in Stock')).not.toHaveClass('visually-hidden')
    // B9-13: the short form is still there as the row's compact meta, shown by ListRow only while its text column is under 12 rem
    expect(supplies().getByText('400 ml in Stock')).toHaveClass('list-row__meta-compact')
  })
  it('a Not needed Supply row carries the same two texts; the row\'s own width picks one', async () => {
    const line = list().lines[0]!
    render(<ShoppingBody {...base} list={makeList({ lines: [], notNeeded: [line], progress: { ticked: 0, total: 0 } })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    const notNeeded = within(screen.getByRole('list', { name: 'Not needed' }))
    expect(notNeeded.getByText('400 ml in Stock')).toBeInTheDocument()
    // B9-34 (SSP-05): ListRow chooses by its own text column; the body has no `compact` prop and no b8-polish hidden text
    expect(notNeeded.getByText('Below 1 l · 400 ml in Stock')).not.toHaveClass('visually-hidden')
    expect(notNeeded.getByText('400 ml in Stock')).toHaveClass('list-row__meta-compact')
    expect(notNeeded.getByText('400 ml in Stock')).toHaveAttribute('aria-hidden', 'true')
  })
})
