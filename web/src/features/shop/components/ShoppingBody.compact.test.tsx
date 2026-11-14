import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../testData'
import { ShoppingBody } from './ShoppingBody'

// b8-polish (docs/dev/design/b8-polish.md 2): ShoppingBody takes `compact` from the screen (a hook decides). A compact Supply row
// shows "400/1000 ml" and keeps the full "400 of 1000 ml" for assistive technology; food hints and wide rows are untouched.
const base = { system: 'metric' as const, shopName: 'Coop', onTick: () => {}, onUntick: () => {}, onOpenLine: () => {}, onScan: () => {} }
const list = () =>
  makeList({
    lines: [makeLine({ ingredientId: 20, name: 'Washing-up liquid', baseUnit: 'ml', kind: 'supply', restock: { level: 1000, stock: 400 }, need: 1000, available: 400, quantity: 600, pack: null, estimatedCostCents: null })],
    progress: { ticked: 0, total: 1 },
  })
const supplies = () => within(screen.getByRole('list', { name: 'Supplies' }))

describe('ShoppingBody: compact Restock reason', () => {
  it('without compact the row reads "400 of 1000 ml"', () => {
    render(<ShoppingBody {...base} list={list()} />)
    expect(supplies().getByText('400 of 1000 ml')).not.toHaveClass('visually-hidden')
    expect(supplies().queryByText('400/1000 ml')).toBeNull()
  })
  it('with compact the meta shows "400/1000 ml" and its accessible text is the full "400 of 1000 ml"', () => {
    render(<ShoppingBody {...base} list={list()} compact />)
    const meta = supplies().getByText('400/1000 ml')
    expect(meta.closest('.list-row__meta')).toHaveAttribute('data-status', 'info')
    expect(supplies().getByText('400 of 1000 ml')).toHaveClass('visually-hidden')
    expect(meta).toHaveAttribute('aria-hidden', 'true')
  })
  it('a Not needed Supply row follows the same width: compact, with the full text for assistive technology', async () => {
    const line = list().lines[0]!
    render(<ShoppingBody {...base} list={makeList({ lines: [], notNeeded: [line], progress: { ticked: 0, total: 0 } })} compact />)
    await userEvent.click(screen.getByRole('button', { name: 'Not needed (1)' }))
    const notNeeded = within(screen.getByRole('list', { name: 'Not needed' }))
    expect(notNeeded.getByText('400/1000 ml')).toBeInTheDocument()
    expect(notNeeded.getByText('400 of 1000 ml')).toHaveClass('visually-hidden')
    expect(notNeeded.getByText('400/1000 ml')).toHaveAttribute('aria-hidden', 'true')
  })
})
