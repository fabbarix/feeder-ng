// A11Y-07 (Change a date), SHORT-02 (Date Attendance footer), SET-10 (the same Attendance rows):
//   - the sheet opens with focus on the Date field, and it stays there when the date's answer arrives (no remount: the form is not keyed on the answer);
//   - the title reads like the field: "Dinner on Thu 12 Nov", never an ISO date;
//   - "Reset to usual Attendance" is an outlined secondary button; it and "Save for this date" are the sheet's footer (one row), not body content;
//   - `memberExtra` reaches the Attendance rows: that is where B9-46's "Eats here anyway" plugs in.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DateAttendance } from '../types'
import { members, thursdayDinner } from './fixtures'
import { DateAttendancePanel, type DateAttendancePanelProps } from './DateAttendancePanel'

const usual: DateAttendance = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5 }
const samOut: DateAttendance = { ...usual, isOverride: true, attendance: thursdayDinner.attendance.slice(0, 2), portionsNeeded: 2 }

function props(over: Partial<DateAttendancePanelProps> = {}): DateAttendancePanelProps {
  return { open: true, slot: thursdayDinner, date: '2026-11-12', attendance: undefined, members, onChangeDate: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), ...over }
}
const dateTrigger = () => screen.getByRole('button', { name: /^Date/ })

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})

describe('the title (A11Y-07)', () => {
  it('words the date like the Date field: "Dinner on Thu 12 Nov"', () => {
    render(<DateAttendancePanel {...props()} />)
    expect(screen.getByRole('dialog', { name: 'Dinner on Thu 12 Nov' })).toBeInTheDocument()
  })
  it('follows the date when it changes', () => {
    const { rerender } = render(<DateAttendancePanel {...props()} />)
    rerender(<DateAttendancePanel {...props({ date: '2026-11-19' })} />)
    expect(screen.getByRole('dialog', { name: 'Dinner on Thu 19 Nov' })).toBeInTheDocument()
  })
})

describe('focus stays put while the data arrives (A11Y-07: no remount)', () => {
  it('opens with focus on the Date field', async () => {
    render(<DateAttendancePanel {...props()} />)
    await waitFor(() => expect(dateTrigger()).toHaveFocus())
  })
  it('after the answer arrives the very same Date trigger is still in the page and still has focus', async () => {
    const { rerender } = render(<DateAttendancePanel {...props()} />)
    await waitFor(() => expect(dateTrigger()).toHaveFocus())
    const before = dateTrigger()
    rerender(<DateAttendancePanel {...props({ attendance: samOut })} />)
    expect(dateTrigger()).toBe(before)
    expect(before).toBeInTheDocument()
    expect(before).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
  })
  it('a pristine form follows the answer: Sam is ticked off once the override arrives', () => {
    const { rerender } = render(<DateAttendancePanel {...props()} />)
    expect(screen.getByRole('checkbox', { name: 'Sam' })).toBeChecked()
    rerender(<DateAttendancePanel {...props({ attendance: samOut })} />)
    expect(screen.getByRole('checkbox', { name: 'Sam' })).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 2')
  })
  it('a form the Admin has already changed keeps their changes when the answer arrives (nothing is thrown away)', async () => {
    const { rerender } = render(<DateAttendancePanel {...props()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marco' }))
    rerender(<DateAttendancePanel {...props({ attendance: usual })} />)
    expect(screen.getByRole('checkbox', { name: 'Marco' })).not.toBeChecked()
  })
  it('a different date starts from that date\'s own Attendance', () => {
    const { rerender } = render(<DateAttendancePanel {...props({ attendance: samOut })} />)
    rerender(<DateAttendancePanel {...props({ date: '2026-11-19', attendance: { ...usual, date: '2026-11-19' } })} />)
    expect(screen.getByRole('checkbox', { name: 'Sam' })).toBeChecked()
  })
})

describe('the footer (SHORT-02)', () => {
  it('"Reset to usual Attendance" is an outlined secondary button and "Save for this date" the primary, both in the sheet\'s footer', () => {
    render(<DateAttendancePanel {...props({ attendance: samOut })} />)
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    expect(footer).not.toBeNull()
    expect(within(footer).getByRole('button', { name: 'Reset to usual Attendance' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(footer).getByRole('button', { name: 'Save for this date' })).toHaveAttribute('data-variant', 'primary')
    expect(document.querySelector('.sheet__body')!.contains(screen.getByRole('button', { name: 'Save for this date' }))).toBe(false)
  })
  it('Reset comes before Save in the footer, and is disabled with no override on the date', () => {
    render(<DateAttendancePanel {...props({ attendance: usual })} />)
    const buttons = [...document.querySelectorAll('.sheet__footer button')].map((b) => b.textContent)
    expect(buttons.indexOf('Reset to usual Attendance')).toBeLessThan(buttons.indexOf('Save for this date'))
    expect(screen.getByRole('button', { name: 'Reset to usual Attendance' })).toBeDisabled()
  })
  it('keeps the one circular Close in the header, since the footer has no Cancel (R-B)', () => {
    render(<DateAttendancePanel {...props({ attendance: usual })} />)
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
  it('Save still saves what the Attendance rows hold, and Reset still resets', async () => {
    const p = props({ attendance: usual })
    render(<DateAttendancePanel {...p} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(p.onSave).toHaveBeenCalledWith(thursdayDinner.attendance.slice(0, 2))
  })
  it('a date off the slot\'s weekday blocks Save, and the message sits under the Date field', () => {
    render(<DateAttendancePanel {...props({ date: '2026-11-11' })} />)
    expect(screen.getByRole('button', { name: 'Save for this date' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('2026-11-11 is not a Thursday')
  })
})

describe('the Attendance rows are the Meal Slot sheet\'s (SET-10) and take memberExtra (B9-46 plugs in here)', () => {
  it('renders each Member as a list row with the stepper in its own cell', () => {
    render(<DateAttendancePanel {...props({ attendance: usual })} />)
    expect(document.querySelectorAll('ul.attendance > li')).toHaveLength(3)
  })
  it('passes memberExtra to the rows, so "Eats here anyway" for an Away Member can sit under the name', () => {
    const memberExtra = (m: { id: number }) => (m.id === 3 ? <span data-testid="eats-anyway">Eats here anyway</span> : null)
    render(<DateAttendancePanel {...props({ attendance: usual })} memberExtra={memberExtra} />)
    expect(screen.getByTestId('eats-anyway').closest('li')).toContainElement(screen.getByRole('checkbox', { name: 'Sam' }))
  })
})
