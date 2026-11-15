// B9-54 (RES-03, RES 2; mocks/res-03-shop-offline.html): the ticked Line's sheet when a Line was ticked more than once, and when a Tick is waiting.
//   - With two additions the sheet's TITLE states the one thing: "Garlic was ticked twice" (three: "Garlic was ticked 3 times"), with the muted
//     subline "Each Tick added its own Stock Lot · 100 g in all", the circular Close, and the additions as R-E rows, each with its own Take back.
//     One addition keeps the Line's name as the title.
//   - A waiting addition (`syncedAt` null) says "Ticked offline at 10:20 · waiting to sync" under its key; its Take back is named like any other
//     (the flow cancels it from the queue); the state line reads "Waiting to sync · 50 g goes to Stock when it syncs" (muted, Clock) while one waits.
//   - Anyone may take back any hand addition; a Scan's addition has no Take back (unchanged, B9-34).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { lineEntry } from '../lib/lines'
import { lineActions } from '../lib/rows'
import { makeAddition, makeGarlic, makeTick } from '../testData'
import { LineSheet } from './LineSheet'

const sam = makeAddition({ who: 'Sam', mine: false, quantity: 50, clientUuid: 's-1', tickedAt: '2026-11-14T10:12:00Z' })
const mine = makeAddition({ quantity: 50, clientUuid: 'u-1', tickedAt: '2026-11-14T10:20:00Z', syncedAt: '2026-11-14T10:31:00Z' })
const waiting = makeAddition({ quantity: 50, clientUuid: 'u-2', tickedAt: '2026-11-14T10:20:00Z', syncedAt: null })
const entryOf = (additions: ReturnType<typeof makeAddition>[], over = {}) =>
  lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions }), ...over }), 'USD', 'metric')

function setup(entry: ReturnType<typeof entryOf>) {
  const onTakeBack = vi.fn()
  render(<LineSheet entry={entry} actions={lineActions(entry, 'ticked')} onAction={() => {}} onClose={() => {}} onTakeBack={onTakeBack} system="metric" timeZone="UTC" />)
  return { onTakeBack }
}
const dialog = () => screen.getByRole('dialog')

describe('LineSheet: a Line ticked twice (RES 2)', () => {
  it('the title says so, the subline says what each Tick did, and the Close is the circular one', () => {
    setup(entryOf([sam, mine]))
    expect(screen.getByRole('dialog', { name: 'Garlic was ticked twice' })).toBeInTheDocument()
    expect(within(dialog()).getByText('Each Tick added its own Stock Lot · 100 g in all')).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('three additions: "ticked 3 times" and the sum', () => {
    setup(entryOf([sam, mine, makeAddition({ clientUuid: 'u-3', quantity: 50, who: 'Ana', mine: false })]))
    expect(screen.getByRole('dialog', { name: 'Garlic was ticked 3 times' })).toBeInTheDocument()
    expect(within(dialog()).getByText('Each Tick added its own Stock Lot · 150 g in all')).toBeInTheDocument()
  })

  it('one addition keeps the Line\'s name as the title and has no "twice" subline', () => {
    setup(entryOf([mine]))
    expect(screen.getByRole('dialog', { name: 'Garlic' })).toBeInTheDocument()
    expect(within(dialog()).queryByText(/Each Tick added its own Stock Lot/)).toBeNull()
  })

  it('each hand addition has its own Take back; a Scan\'s has none', async () => {
    const scan = makeAddition({ by: 'scan', who: 'Ana', mine: false, quantity: 700, clientUuid: 'x-1' })
    const { onTakeBack } = setup(entryOf([sam, mine, scan]))
    expect(within(dialog()).getByRole('button', { name: "Take back Sam's 50 g" })).toBeInTheDocument()
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Take back your 50 g' }))
    expect(onTakeBack).toHaveBeenCalledWith(expect.anything(), mine)
    expect(within(dialog()).getAllByRole('button', { name: /^Take back/ })).toHaveLength(2)
  })
})

describe('LineSheet: a waiting addition', () => {
  it('its row says "Ticked offline at 10:20 · waiting to sync" and has a Take back like the others', () => {
    setup(entryOf([sam, waiting]))
    const items = within(within(dialog()).getByRole('list', { name: 'Added to Stock' })).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Ticked at 10:12')
    expect(items[1]).toHaveTextContent('Ticked offline at 10:20 · waiting to sync')
    expect(items[1]).toHaveTextContent('+50 g')
    expect(within(items[1]!).getByRole('button', { name: 'Take back your 50 g' })).toBeInTheDocument()
  })

  it('while one waits the state line reads "Waiting to sync · 50 g goes to Stock when it syncs" (muted)', () => {
    setup(entryOf([waiting]))
    const state = within(dialog()).getByText('Waiting to sync · 50 g goes to Stock when it syncs')
    expect(state.closest('[data-tone]')).toHaveAttribute('data-tone', 'muted')
  })

  it('a synced addition keeps "Ticked at …" and the usual state line', () => {
    setup(entryOf([mine]))
    expect(within(dialog()).getByText('Ticked · 50 g added to Stock')).toBeInTheDocument()
    expect(within(dialog()).getByText('Ticked at 10:20')).toBeInTheDocument()
  })
})
