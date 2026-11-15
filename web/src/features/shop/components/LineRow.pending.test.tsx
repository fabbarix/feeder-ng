// B9-54 (RES-03, mocks/res-03-shop-offline.html): a queued Tick looks ticked at once, with the "waiting to sync" state on its row and no toast
// storm. The row: data-sync="pending" (ListRow's own, with the 14 px clock badge on the tick), the tick named "Tick Garlic, waiting to sync" and
// still aria-pressed, the meta "Waiting to sync · 50 g to Stock" (compact "Waiting to sync"). A refused Tick (`sync="failed"` from the screen)
// is an OPEN row with the danger bar and the meta "Tick not synced"; its tick is still "Tick Garlic" and unpressed.
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListGroup } from '../../../ui/ListRow'
import { lineEntry } from '../lib/lines'
import { makeAddition, makeGarlic, makeTick } from '../testData'
import { LineRow } from './LineRow'

const none = () => {}
const waiting = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [makeAddition({ clientUuid: 'w-1', quantity: 50, syncedAt: null })] }) }), 'USD', 'metric')
const open = lineEntry(makeGarlic(), 'USD', 'metric')
function row(entry: ReturnType<typeof lineEntry>, group: 'open' | 'ticked', over: Record<string, unknown> = {}) {
  return render(
    <ListGroup label="To get">
      <LineRow entry={entry} group={group} onTick={none} onUntick={none} onOpen={none} {...over} />
    </ListGroup>,
  )
}

describe('LineRow: a waiting Tick', () => {
  it('is data-sync="pending", with the clock badge on the tick and the muted meta', () => {
    const { container } = row(waiting, 'ticked')
    expect(container.querySelector('li')).toHaveAttribute('data-sync', 'pending')
    expect(container.querySelector('.list-row__control .list-row__sync-badge')).not.toBeNull()
    const meta = container.querySelector('.list-row__meta')!
    expect(meta.querySelector('.list-row__meta-text')).toHaveTextContent('Waiting to sync · 50 g to Stock')
    expect(container.querySelector('.list-row__meta-compact')).toHaveTextContent('Waiting to sync')
    expect(meta).not.toHaveAttribute('data-status', 'success')
  })

  it('its tick is named "Tick Garlic, waiting to sync" and stays pressed (it is ticked)', () => {
    row(waiting, 'ticked')
    const tick = screen.getByRole('button', { name: 'Tick Garlic, waiting to sync' })
    expect(tick).toHaveAttribute('aria-pressed', 'true')
  })

  it('pressing it unticks (Undo of a waiting Tick leaves the queue): onUntick with the entry', async () => {
    const onUntick = vi.fn()
    row(waiting, 'ticked', { onUntick })
    await userEvent.click(screen.getByRole('button', { name: 'Tick Garlic, waiting to sync' }))
    expect(onUntick).toHaveBeenCalledWith(waiting)
  })

  it('a synced ticked row and an open row carry no data-sync and no badge, and keep the plain name', () => {
    const synced = lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick() }), 'USD', 'metric')
    const a = row(synced, 'ticked')
    expect(a.container.querySelector('li')).not.toHaveAttribute('data-sync')
    expect(a.container.querySelector('.list-row__sync-badge')).toBeNull()
    expect(screen.getByRole('button', { name: 'Tick Garlic' })).toBeInTheDocument()
    a.unmount()
    const b = row(open, 'open')
    expect(b.container.querySelector('li')).not.toHaveAttribute('data-sync')
  })
})

describe('LineRow: a refused Tick', () => {
  it('an open row with sync="failed": data-sync="failed", the meta "Tick not synced" in the danger status, the tick still "Tick Garlic", unpressed', () => {
    const { container } = row(open, 'open', { sync: 'failed' })
    expect(container.querySelector('li')).toHaveAttribute('data-sync', 'failed')
    const meta = container.querySelector('.list-row__meta')!
    expect(meta).toHaveAttribute('data-status', 'danger')
    expect(meta.querySelector('.list-row__meta-text')).toHaveTextContent('Tick not synced')
    const tick = screen.getByRole('button', { name: 'Tick Garlic' })
    expect(tick).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('.list-row__sync-badge')).toBeNull()
  })

  it('P38: the name stays unique when the title repeats (the `name` prop is used with the waiting suffix too)', () => {
    row(waiting, 'ticked', { name: '750 g more of Garlic' })
    expect(screen.getByRole('button', { name: 'Tick 750 g more of Garlic, waiting to sync' })).toBeInTheDocument()
  })
})
