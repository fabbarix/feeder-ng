// B9-34 (SSP-18, RES-03): the ticked Line's sheet is not a dead end (mocks/ssp-18-ticked-sheet.html). A state line, the additions as
// R-E rows (each hand addition with its own outlined Take back), Change amount and Untick in the footer, one note. Close is the circular
// button. The open Line's sheet (B9-43's) is unchanged here. Anyone may take back any hand addition (user decision).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { extraEntry, lineEntry } from '../lib/lines'
import { lineActions } from '../lib/rows'
import { makeAddition, makeExtra, makeGarlic, makeTick } from '../testData'
import { LineSheet } from './LineSheet'

const sam = makeAddition({ who: 'Sam', mine: false, quantity: 50, clientUuid: 's-1', tickedAt: '2026-11-14T10:20:00Z' })
const mine = makeAddition({ quantity: 50, clientUuid: 'u-1', tickedAt: '2026-11-14T10:12:00Z' })
const entryOf = (tick = makeTick()) => lineEntry(makeGarlic({ ticked: true, quantity: 0, tick }), 'USD', 'metric')

function setup(entry = entryOf(), over: Partial<React.ComponentProps<typeof LineSheet>> = {}) {
  const onAction = vi.fn()
  const onTakeBack = vi.fn()
  const onClose = vi.fn()
  const view = render(<LineSheet entry={entry} actions={lineActions(entry, 'ticked')} onAction={onAction} onClose={onClose} onTakeBack={onTakeBack} system="metric" timeZone="UTC" {...over} />)
  const rerender = (next: typeof entry) => view.rerender(<LineSheet entry={next} actions={lineActions(next, 'ticked')} onAction={onAction} onClose={onClose} onTakeBack={onTakeBack} system="metric" timeZone="UTC" />)
  return { onAction, onTakeBack, onClose, rerender }
}
// B9-54: a Line ticked twice titles its sheet "Garlic was ticked twice", so the one dialog is found without its name
const dialog = () => screen.getByRole('dialog')

describe('LineSheet, ticked: the state line', () => {
  it('"Ticked · 500 g added to Stock" in the success tone, and under it "The Line needed 150 g."', () => {
    setup()
    const state = within(dialog()).getByText('Ticked · 500 g added to Stock')
    expect(state.closest('[data-tone]')).toHaveAttribute('data-tone', 'success')
    expect(within(dialog()).getByText('The Line needed 150 g.')).toBeInTheDocument()
  })

  it('"Ticked · Not added to Stock" when the tick added nothing', () => {
    setup(entryOf(makeTick({ added: null, additions: [makeAddition({ quantity: null })] })))
    expect(within(dialog()).getByText('Ticked · Not added to Stock')).toBeInTheDocument()
  })

  it('"Ticked by a Scan" for a Scan\'s tick', () => {
    setup(entryOf(makeTick({ by: 'scan', added: 700, additions: [makeAddition({ by: 'scan', who: 'Sam', mine: false, quantity: 700 })] })))
    expect(within(dialog()).getByText('Ticked by a Scan')).toBeInTheDocument()
  })

  it('Close is the circular Close button', () => {
    setup()
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})

describe('LineSheet, ticked: the additions (R-E rows)', () => {
  it('a list named "Added to Stock": key = who ("You"), state = "+500 g", detail = "Ticked at 10:12"', () => {
    setup()
    const list = within(dialog()).getByRole('list', { name: 'Added to Stock' })
    const item = within(list).getAllByRole('listitem')
    expect(item).toHaveLength(1)
    expect(item[0]).toHaveTextContent('You')
    expect(item[0]).toHaveTextContent('+500 g')
    expect(item[0]).toHaveTextContent('Ticked at 10:12')
  })

  it('two additions: both rows, oldest first, each with its Take back named for its amount ("Take back your 50 g", "Take back Sam\'s 50 g")', () => {
    setup(entryOf(makeTick({ additions: [mine, sam] })))
    const items = within(within(dialog()).getByRole('list', { name: 'Added to Stock' })).getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('You'), expect.stringContaining('Sam')])
    expect(within(dialog()).getByRole('button', { name: 'Take back your 50 g' })).toBeInTheDocument()
    expect(within(dialog()).getByRole('button', { name: "Take back Sam's 50 g" })).toBeInTheDocument()
  })

  it('Take back hands the entry and the addition to onTakeBack; it is an outlined secondary button', async () => {
    const entry = entryOf(makeTick({ additions: [mine, sam] }))
    const { onTakeBack } = setup(entry)
    const button = within(dialog()).getByRole('button', { name: "Take back Sam's 50 g" })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(button)
    expect(onTakeBack).toHaveBeenCalledExactlyOnceWith(entry, sam)
  })

  it('a Scan\'s addition reads "Sam scanned" with its amount, and has no Take back (it is undone from that User\'s Scanned list)', () => {
    const scan = makeAddition({ by: 'scan', who: 'Sam', mine: false, quantity: 700, clientUuid: 's-2' })
    setup(entryOf(makeTick({ by: 'scan', added: 700, additions: [scan] })))
    const item = within(within(dialog()).getByRole('list', { name: 'Added to Stock' })).getByRole('listitem')
    expect(item).toHaveTextContent('Sam scanned')
    expect(item).toHaveTextContent('+700 g')
    expect(within(dialog()).queryByRole('button', { name: /^Take back/ })).toBeNull()
  })

  it('a tick that added nothing has no additions list', () => {
    setup(entryOf(makeTick({ added: null, additions: [makeAddition({ quantity: null })] })))
    expect(within(dialog()).queryByRole('list', { name: 'Added to Stock' })).toBeNull()
  })

  it('the times follow the Household zone', () => {
    setup(entryOf(), { timeZone: 'Europe/Rome' })
    expect(within(dialog()).getByText('Ticked at 11:12')).toBeInTheDocument()
  })
})

describe('LineSheet, ticked: the footer', () => {
  it('Change amount and Untick Garlic are outlined secondaries; each runs its action', async () => {
    const { onAction } = setup()
    const change = within(dialog()).getByRole('button', { name: 'Change amount' })
    const untick = within(dialog()).getByRole('button', { name: 'Untick Garlic' })
    expect(change).toHaveAttribute('data-variant', 'secondary')
    expect(untick).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(change)
    await userEvent.click(untick)
    expect(onAction.mock.calls.map((c) => c[0])).toEqual(['change-amount', 'untick'])
  })

  it('one muted note says the difference between Take back and Untick', () => {
    setup()
    expect(within(dialog()).getByText('Take back removes what is left of that Stock Lot. Untick takes back every addition.')).toBeInTheDocument()
  })

  it('no Change amount when the viewer added nothing by hand (the actions say so)', () => {
    setup(entryOf(makeTick({ additions: [sam] })))
    expect(within(dialog()).queryByRole('button', { name: 'Change amount' })).toBeNull()
    expect(within(dialog()).getByRole('button', { name: 'Untick Garlic' })).toBeInTheDocument()
  })

  it('a ticked free-text extra: its state line, no list, Untick by name, and Delete', () => {
    const entry = extraEntry(makeExtra({ ticked: true, tick: makeTick({ added: null, additions: [makeAddition({ quantity: null })] }) }), 'metric')
    render(<LineSheet entry={entry} actions={lineActions(entry, 'ticked')} onAction={() => {}} onClose={() => {}} onTakeBack={() => {}} system="metric" timeZone="UTC" />)
    const sheet = screen.getByRole('dialog', { name: 'toilet paper' })
    expect(within(sheet).getByText('Ticked · Not added to Stock')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Untick toilet paper' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Delete toilet paper' })).toBeInTheDocument()
  })
})

describe('LineSheet, ticked: focus (SSP-18 accessibility)', () => {
  it('after Take back, focus goes to the next addition\'s Take back, else to Change amount', async () => {
    const both = entryOf(makeTick({ additions: [sam, mine] }))
    const { rerender } = setup(both)
    await userEvent.click(within(dialog()).getByRole('button', { name: "Take back Sam's 50 g" }))
    // the screen refreshes the list: Sam's addition is gone
    rerender(entryOf(makeTick({ additions: [mine] })))
    expect(within(dialog()).getByRole('button', { name: 'Take back your 50 g' })).toHaveFocus()
    // the last addition is taken back too: Change amount is left (the viewer's own addition is still a hand tick of 0)
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Take back your 50 g' }))
    rerender(entryOf(makeTick({ added: null, additions: [{ ...mine, quantity: null }] })))
    expect(within(dialog()).getByRole('button', { name: 'Change amount' })).toHaveFocus()
  })
})
