// SET-15: the Removed Meal Slots tile. A labelled section, one sentence said once (muted), R-E rows (ListRow: key, value, detail, `actions`),
// "Put back" an outlined secondary button for an Admin only, named after its whole row.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RemovedMealSlotGroup } from '../lib/removedMealSlots'
import { RemovedMealSlots, type RemovedMealSlotsProps } from './RemovedMealSlots'

const snack: RemovedMealSlotGroup = { ids: [41, 42, 43, 44, 45], name: 'Snack', weekdays: [1, 2, 3, 4, 5], time: '16:30', removedAt: '2026-11-14T12:00:00Z', cookedCount: 6, notCookedCount: 0 }
const brunch: RemovedMealSlotGroup = { ids: [51], name: 'Brunch', weekdays: [7], time: '11:00', removedAt: '2026-11-02T12:00:00Z', cookedCount: 3, notCookedCount: 1 }

function setup(over: Partial<RemovedMealSlotsProps> = {}) {
  const props = { groups: [brunch, snack], canRestore: true, locale: 'en', onPutBack: vi.fn(), ...over }
  render(<RemovedMealSlots {...props} />)
  return props
}

describe('RemovedMealSlots', () => {
  it('draws nothing without a removed Meal Slot that holds history', () => {
    const { container } = render(<RemovedMealSlots groups={[]} canRestore onPutBack={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('is a section named "Removed Meal Slots" whose heading is the name (a titled ListGroup)', () => {
    setup()
    const section = screen.getByRole('region', { name: 'Removed Meal Slots' })
    expect(within(section).getByRole('heading', { name: /^Removed Meal Slots/ })).toBeInTheDocument()
  })
  it('says once, muted, that the Cooked meals stay in the history', () => {
    setup()
    const note = screen.getByText('Their Cooked meals stay in the history, so Last cooked and Cool-down still count them.')
    expect(note).toHaveClass('rm-note')
    expect(screen.getAllByText(/Their Cooked meals stay/)).toHaveLength(1)
  })
  it('lists one row per group, newest removal first, each with title, detail and value', () => {
    setup()
    const rows = within(screen.getByRole('region', { name: 'Removed Meal Slots' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Snack · Mon to Fri')
    expect(rows[0]).toHaveTextContent('16:30 · removed 14 Nov')
    expect(rows[0]).toHaveTextContent('6 Cooked')
    expect(rows[1]).toHaveTextContent('Brunch · Sun')
    expect(rows[1]).toHaveTextContent('11:00 · removed 2 Nov')
  })
  it('counts the Cooked and the Not cooked meals apart (open product question; pinned in lib/removedMealSlots)', () => {
    setup()
    expect(screen.getByText('3 Cooked · 1 Not cooked')).toBeInTheDocument()
  })
  it('an Admin gets an outlined secondary "Put back <name> · <days>" on each row', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Put back Snack · Mon to Fri' })
    expect(button).toHaveAttribute('data-variant', 'secondary')
    expect(button).toHaveAttribute('data-size', 'sm') // the SET-15 mock's small button (main session, B9-42 follow-up)
    expect(button).toHaveTextContent('Put back')
    expect(screen.getByRole('button', { name: 'Put back Brunch · Sun' })).toBeInTheDocument()
  })
  it('the button sits in the row\'s actions slot, not in a tertiary text link', () => {
    setup()
    expect(screen.getByRole('button', { name: /^Put back Snack/ }).closest('.list-row__actions')).not.toBeNull()
  })
  it('a plain User sees the tile and the rows without any button', () => {
    setup({ canRestore: false })
    expect(screen.getByRole('region', { name: 'Removed Meal Slots' })).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('pressing Put back hands over that row (all its ids)', async () => {
    const { onPutBack } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Put back Snack · Mon to Fri' }))
    expect(onPutBack).toHaveBeenCalledTimes(1)
    expect((onPutBack as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({ name: 'Snack', ids: [41, 42, 43, 44, 45] })
  })
  it('while a row is being put back its button is busy and the other buttons are disabled', () => {
    setup({ busyKey: '41-42-43-44-45' })
    expect(screen.getByRole('button', { name: 'Put back Snack · Mon to Fri' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Put back Brunch · Sun' })).toBeDisabled()
  })
})
