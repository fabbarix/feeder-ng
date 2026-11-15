// B9-43 (SSP-13, SSP-14; mocks/ssp-13-line-sheet.html): the open Line's sheet. Two R-E rows (a DetailList named "Line"): To get and
// Estimated at <Shop>; "Change the Price" under them (outlined secondary, price icon) or "No Product yet: scan one in the Shop"; the "For"
// list of Planned Meals as rows; the footer "Get something else…" and "Not needed"; one line saying what Not needed leaves short. One Close
// (the circular one), no Cancel, no primary (the one primary is Scan).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { lineEntry } from '../lib/lines'
import { lineActions } from '../lib/rows'
import { makeLine, makeOnion, makePast } from '../testData'
import { LineSheet, type LineSheetProps } from './LineSheet'

const onion = lineEntry(makeOnion(), 'USD', 'metric')
const open = (entry = onion, over: Partial<LineSheetProps> = {}) => {
  const onAction = vi.fn()
  const onChangePrice = vi.fn()
  const onClose = vi.fn()
  render(<LineSheet entry={entry} actions={lineActions(entry, 'open')} onAction={onAction} onClose={onClose} onChangePrice={onChangePrice} shopName="Coop" {...over} />)
  return { onAction, onChangePrice, onClose, dialog: screen.getByRole('dialog', { name: 'Onion' }) }
}
const rowsOf = (list: HTMLElement) => within(list).getAllByRole('listitem')

describe('LineSheet, open Line: To get and Estimated (SSP-13)', () => {
  it('a list named "Line" of two DetailRows: "To get · 94 pieces" with "16 × Onion pack (6 pieces)", "Estimated at Coop · $47.84" with the Price\'s date', () => {
    const { dialog } = open()
    const list = within(dialog).getByRole('list', { name: 'Line' })
    expect(list).toHaveClass('detail-list')
    const [toGet, estimated] = rowsOf(list)
    expect(toGet!.querySelector('.detail-row__label')).toHaveTextContent('To get')
    expect(toGet!.querySelector('.detail-row__state')).toHaveTextContent('94 pieces')
    expect(toGet!.querySelector('.detail-row__detail')).toHaveTextContent('16 × Onion pack (6 pieces)')
    expect(estimated!.querySelector('.detail-row__label')).toHaveTextContent('Estimated at Coop')
    expect(estimated!.querySelector('.detail-row__state')).toHaveTextContent('$47.84')
    expect(estimated!.querySelector('.detail-row__detail')).toHaveTextContent('$2.99 a pack, 14 Nov · not bought here yet')
  })

  it('with Any Shop the key is just "Estimated"', () => {
    const { dialog } = open(onion, { shopName: null })
    expect(within(dialog).getByRole('list', { name: 'Line' })).toHaveTextContent(/Estimated(?! at)/)
    expect(dialog).not.toHaveTextContent('Estimated at')
  })

  it('no Price: "No Price yet", never a dash or $0.00', () => {
    const e = lineEntry(makeOnion({ estimatedCostCents: null }), 'USD', 'metric')
    const { dialog } = open(e)
    expect(dialog).toHaveTextContent('No Price yet')
    expect(dialog).not.toHaveTextContent('—')
    expect(dialog).not.toHaveTextContent('$0.00')
  })
})

describe('LineSheet, open Line: Change the Price (SSP-13)', () => {
  it('is an outlined secondary button with the price icon, after the rows and before "For"; it hands the entry to onChangePrice', async () => {
    const { dialog, onChangePrice } = open()
    const button = within(dialog).getByRole('button', { name: 'Change the Price' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    expect(button.querySelector('svg')).not.toBeNull()
    const rows = within(dialog).getByRole('list', { name: 'Line' })
    expect(rows.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'For' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    await userEvent.click(button)
    expect(onChangePrice).toHaveBeenCalledExactlyOnceWith(onion)
  })

  it('a Line with no Product says "No Product yet: scan one in the Shop" instead of the button', () => {
    const e = lineEntry(makeOnion({ pack: null }), 'USD', 'metric')
    const { dialog } = open(e)
    expect(within(dialog).queryByRole('button', { name: 'Change the Price' })).toBeNull()
    expect(within(dialog).getByText('No Product yet: scan one in the Shop')).toBeInTheDocument()
  })

  it('there is no button when the screen gives no handler (the sheet is read-only)', () => {
    const { dialog } = open(onion, { onChangePrice: undefined })
    expect(within(dialog).queryByRole('button', { name: 'Change the Price' })).toBeNull()
  })
})

describe('LineSheet, open Line: "For" (SSP-14)', () => {
  it('a heading "For" and a list named "For" of rows: key "Mon Lunch", detail = the Recipe; no state (the server sends no amount per meal)', () => {
    const { dialog } = open()
    expect(within(dialog).getByRole('heading', { name: 'For' })).toBeInTheDocument()
    const list = within(dialog).getByRole('list', { name: 'For' })
    expect(list).toHaveClass('detail-list')
    const rows = rowsOf(list)
    expect(rows).toHaveLength(3)
    expect(rows[0]!.querySelector('.detail-row__label')).toHaveTextContent('Mon Lunch')
    expect(rows[0]!.querySelector('.detail-row__detail')).toHaveTextContent('Onion and potato frittata')
    expect(rows[0]!.querySelector('.detail-row__state')).toBeNull()
  })

  it('more than five: five rows and "and 3 more" under them', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${10 + i}`, mealSlotId: 3, mealSlotName: 'Dinner', courseName: 'Main', recipeName: `Recipe ${i}` }))
    const { dialog } = open(lineEntry(makeOnion({ plannedMeals: many }), 'USD', 'metric'))
    expect(rowsOf(within(dialog).getByRole('list', { name: 'For' }))).toHaveLength(5)
    expect(within(dialog).getByText('and 3 more')).toBeInTheDocument()
  })

  it('no Planned Meals: no "For" section at all', () => {
    const { dialog } = open(lineEntry(makeOnion({ plannedMeals: [] }), 'USD', 'metric'))
    expect(within(dialog).queryByRole('heading', { name: 'For' })).toBeNull()
    expect(within(dialog).queryByRole('list', { name: 'For' })).toBeNull()
  })
})

describe('LineSheet, open Line: the footer (SSP-14 Option A)', () => {
  it('"Get something else…" then "Not needed", both outlined secondaries; each runs its action', async () => {
    const { dialog, onAction } = open()
    const buttons = within(dialog).getAllByRole('button').filter((b) => ['Get something else…', 'Not needed'].includes(b.textContent ?? ''))
    expect(buttons.map((b) => b.textContent)).toEqual(['Get something else…', 'Not needed'])
    expect(buttons.every((b) => b.getAttribute('data-variant') === 'secondary')).toBe(true)
    await userEvent.click(buttons[0]!)
    await userEvent.click(buttons[1]!)
    expect(onAction.mock.calls.map((c) => c[0])).toEqual(['get-something-else', 'not-needed'])
  })

  it('under them one line: "Not needed leaves these 3 Planned Meals short of Onion."', () => {
    const { dialog } = open()
    const note = within(dialog).getByText('Not needed leaves these 3 Planned Meals short of Onion.')
    const notNeeded = within(dialog).getByRole('button', { name: 'Not needed' })
    expect(notNeeded.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the consequence is not shown on a Not needed Line (nothing to leave short: it is already off the list)', () => {
    const entry = lineEntry(makeOnion(), 'USD', 'metric')
    render(<LineSheet entry={entry} actions={lineActions(entry, 'not-needed')} onAction={() => {}} onClose={() => {}} />)
    expect(screen.queryByText(/Not needed leaves/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Get something else…' })).toBeNull()
  })

  it('one Close, the circular one, and no Cancel; no primary button (that is Scan)', () => {
    const { dialog } = open()
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(dialog.querySelectorAll('button[data-variant="primary"]')).toHaveLength(0)
  })

  it('the unconfirmed-meals sentence is still said here, once', () => {
    const entry = lineEntry(makeOnion({ pastPlannedMeals: [makePast()] }), 'USD', 'metric')
    render(<LineSheet entry={entry} actions={lineActions(entry, 'open')} onAction={() => {}} onClose={() => {}} />)
    expect(screen.getAllByText('Includes Tue Dinner, not marked Cooked yet')).toHaveLength(1)
  })

  it('a plain Line (no Product details beyond the pack) still opens: the old facts are the rows', () => {
    const entry = lineEntry(makeLine(), 'USD', 'metric')
    render(<LineSheet entry={entry} actions={lineActions(entry, 'open')} onAction={() => {}} onClose={() => {}} shopName="Coop" />)
    const dialog = screen.getByRole('dialog', { name: 'Passata' })
    expect(within(dialog).getByRole('list', { name: 'Line' })).toHaveTextContent('1.4 kg')
    expect(within(dialog).getByRole('list', { name: 'Line' })).toHaveTextContent('2 × Mutti 700 g')
    expect(within(dialog).getByRole('list', { name: 'Line' })).toHaveTextContent('$3.18')
  })
})
