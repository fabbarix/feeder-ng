// B9-34 (SSP-01, SSP-02, SSP-05, A11Y-07): the Shop row. A ticked row says what the tick did; a "more since your tick" row is an open row
// with an info meta; the compact form is ListRow's own (by its text column), so LineRow takes no `compact` prop; the tick can be busy.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListGroup } from '../../../ui/ListRow'
import { lineEntry, listEntries } from '../lib/lines'
import { makeAddition, makeGarlic, makeLine, makeList, makeTick } from '../testData'
import { LineRow } from './LineRow'

const none = () => {}
function row(entry: ReturnType<typeof lineEntry>, group: 'open' | 'ticked' = 'open', over: Record<string, unknown> = {}) {
  return render(
    <ListGroup label="To get">
      <LineRow entry={entry} group={group} onTick={none} onUntick={none} onOpen={none} {...over} />
    </ListGroup>,
  )
}
const ticked = (tick = makeTick()) => lineEntry(makeGarlic({ ticked: true, quantity: 0, tick }), 'USD', 'metric')
const meta = (c: HTMLElement) => c.querySelector('.list-row__meta') as HTMLElement

describe('LineRow: the ticked row says what reached Stock (SSP-01)', () => {
  it('added Stock: a success meta "+500 g in Stock" with an icon, and no separate compact text', () => {
    const { container } = row(ticked(), 'ticked')
    expect(meta(container)).toHaveAttribute('data-status', 'success')
    expect(meta(container)).toHaveTextContent('+500 g in Stock')
    expect(meta(container).querySelector('svg')).not.toBeNull()
    expect(container.querySelector('.list-row__meta-compact')).toBeNull()
  })

  it('no Stock added: a muted meta (no status) "Not added to Stock", with "No Stock added" as the row\'s compact text', () => {
    const { container } = row(ticked(makeTick({ added: null, additions: [makeAddition({ quantity: null })] })), 'ticked')
    expect(meta(container)).not.toHaveAttribute('data-status')
    expect(meta(container).querySelector('.list-row__meta-text')).toHaveTextContent('Not added to Stock')
    const compact = container.querySelector('.list-row__meta-compact')!
    expect(compact).toHaveTextContent('No Stock added')
    expect(compact).toHaveAttribute('aria-hidden', 'true')
  })

  it('a Scan: "Scanned · 700 g", muted', () => {
    const { container } = row(ticked(makeTick({ by: 'scan', added: 700, additions: [makeAddition({ by: 'scan', quantity: 700 })] })), 'ticked')
    expect(meta(container)).toHaveTextContent('Scanned · 700 g')
    expect(meta(container)).not.toHaveAttribute('data-status')
  })

  it('a Line added twice: "Added twice · Sam 50 g, you 50 g", compact "Twice · 100 g" (B9-43: shorter, it was cut at 375)', () => {
    const tick = makeTick({ additions: [makeAddition({ who: 'Sam', mine: false, quantity: 50 }), makeAddition({ quantity: 50, clientUuid: 'u-2' })] })
    const { container } = row(ticked(tick), 'ticked')
    expect(meta(container).querySelector('.list-row__meta-text')).toHaveTextContent('Added twice · Sam 50 g, you 50 g')
    expect(container.querySelector('.list-row__meta-compact')).toHaveTextContent('Twice · 100 g')
  })

  it('the value stays what the Line needed, and the tick keeps its stable name with aria-pressed', () => {
    const { container } = row(ticked(), 'ticked')
    expect(container.querySelector('.list-row__value')).toHaveTextContent('150 g')
    expect(screen.getByRole('button', { name: 'Tick Garlic', pressed: true })).toBeInTheDocument()
  })

  it('the meta joins the row\'s accessible description (SHOP-18)', () => {
    row(ticked(), 'ticked')
    expect(screen.getByRole('button', { name: 'Garlic' })).toHaveAccessibleDescription(/\+500 g in Stock/)
  })
})

describe('LineRow: "more since your tick" (SSP-02)', () => {
  const chicken = () => listEntries(makeList({ lines: [makeLine({ ingredientId: 5, name: 'Chicken', ticked: true, more: 750, quantity: 750, pack: null, estimatedCostCents: null, tick: makeTick() })] }), 'metric').open[0]!

  it('is an open row: named "Chicken", value 750 g, the info meta, the tick not pressed', () => {
    const { container } = row(chicken())
    expect(container.querySelector('.list-row')).toHaveAttribute('data-state', 'open')
    expect(container.querySelector('.list-row__value')).toHaveTextContent('750 g')
    expect(meta(container)).toHaveAttribute('data-status', 'info')
    expect(meta(container).querySelector('.list-row__meta-text')).toHaveTextContent('More since your tick')
    expect(container.querySelector('.list-row__meta-compact')).toHaveTextContent('More needed')
    expect(screen.getByRole('button', { name: 'Tick Chicken', pressed: false })).toBeInTheDocument()
  })

  it('its description reads "750 g, more since your tick"', () => {
    row(chicken())
    expect(screen.getByRole('button', { name: 'Chicken' })).toHaveAccessibleDescription(/750 g.*more since your tick/i)
  })
})

describe('LineRow: the compact Restock reason is the row\'s own width (SSP-05)', () => {
  it('has no `compact` prop: the short reason is always rendered beside the long one for ListRow to choose by its text column', () => {
    const supply = lineEntry(makeLine({ kind: 'supply', baseUnit: 'ml', restock: { level: 1000, stock: 400 }, need: 1000, available: 400, quantity: 600, pack: null, estimatedCostCents: null }), 'USD', 'metric')
    const { container } = row(supply)
    expect(container.querySelector('.list-row__meta-text')).toHaveTextContent('Below 1 l · 400 ml in Stock')
    expect(container.querySelector('.list-row__meta-compact')).toHaveTextContent('400 ml in Stock')
    expect(container.querySelector('.visually-hidden')).toBeNull() // the b8-polish hidden-full-text pattern is gone
  })
})

describe('LineRow: focus and the busy tick (A11Y-07, SSP-01)', () => {
  it('the row carries its key as data-focus-key, so focus can follow a row that leaves its list', () => {
    const { container } = row(lineEntry(makeGarlic(), 'USD', 'metric'))
    expect(container.querySelector('.list-row')).toHaveAttribute('data-focus-key', 'line:9')
  })

  it('a pending tick cannot be pressed twice: aria-disabled, aria-busy, and a click does nothing', async () => {
    const onTick = vi.fn()
    row(lineEntry(makeGarlic(), 'USD', 'metric'), 'open', { onTick, pending: true })
    const tick = screen.getByRole('button', { name: 'Tick Garlic' })
    expect(tick).toHaveAttribute('aria-busy', 'true')
    expect(tick).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(tick)
    expect(onTick).not.toHaveBeenCalled()
    expect(tick).not.toBeDisabled() // it must keep focus
  })

  it('one tap on the tick ticks with the entry; the row body only opens the sheet', async () => {
    const onTick = vi.fn()
    const onOpen = vi.fn()
    const entry = lineEntry(makeGarlic(), 'USD', 'metric')
    row(entry, 'open', { onTick, onOpen })
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic' }))
    expect(onTick).toHaveBeenCalledExactlyOnceWith(entry)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
