// B9-38 (SHORT-02, PC-10, PLAN-13): Who's eating opened from Plan and Today. The title is "Who's eating" under the context line
// "Thu 12 Nov · Dinner"; the sheet's commit is in its footer, always in reach: "Reset" (outlined; named "Reset to usual Attendance";
// disabled with no date override) and "Save" (primary; named "Save for this date"), one row at every size (user decision, which
// replaces the visible "Reset to usual" first pinned here). The body says once what Reset does. One round Close (no Cancel).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DateAttendance } from '../types'
import { DateAttendancePanel } from './DateAttendancePanel'
import { members, thursdayDinner } from './fixtures'

const usual: DateAttendance = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5, guests: 0 }

function setup(over: Partial<React.ComponentProps<typeof DateAttendancePanel>> = {}) {
  const props = { open: true, slot: thursdayDinner, date: '2026-11-12', attendance: usual, members, dateReadOnly: true, onChangeDate: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), ...over }
  render(<DateAttendancePanel {...props} />)
  return { ...props, dialog: within(screen.getByRole('dialog')), footer: document.querySelector('.sheet__footer') as HTMLElement, body: document.querySelector('.sheet__body') as HTMLElement }
}

describe("Who's eating: the header", () => {
  it('the context line above the title "Who\'s eating", both in the dialog\'s name', () => {
    setup()
    const dlg = screen.getByRole('dialog')
    expect(dlg.querySelector('.sheet__context')).toHaveTextContent('Thu 12 Nov · Dinner')
    expect(dlg).toHaveAccessibleName("Thu 12 Nov · Dinner Who's eating")
    expect(within(dlg).getByRole('heading', { name: "Who's eating" })).toBeInTheDocument()
  })

  it('no ISO date anywhere, and one Close with no Cancel', () => {
    const { dialog } = setup()
    expect(screen.getByRole('dialog').textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(dialog.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(dialog.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})

describe("Who's eating: the footer", () => {
  it('holds Reset (outlined) then Save (primary) in one row; the body has neither, and says once what Reset does', () => {
    const { footer, body } = setup()
    expect(footer.querySelectorAll('.form-actions')).toHaveLength(1)
    const buttons = [...footer.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Reset', 'Save'])
    expect(within(body).getAllByText(/Reset goes back to the usual Attendance\./)).toHaveLength(1)
    expect(within(footer).getByRole('button', { name: 'Reset to usual Attendance' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(footer).getByRole('button', { name: 'Save for this date' })).toHaveAttribute('data-variant', 'primary')
    expect(within(body).queryByRole('button', { name: 'Save for this date' })).toBeNull()
    expect(within(body).queryByRole('button', { name: 'Reset to usual Attendance' })).toBeNull()
  })

  it('Reset to usual is disabled with no date override and enabled with one', async () => {
    const first = setup()
    expect(within(first.footer).getByRole('button', { name: 'Reset to usual Attendance' })).toBeDisabled()
    cleanup() // unmount the first sheet (clearing document.body under a mounted portal breaks React's own cleanup)
    const second = setup({ attendance: { ...usual, isOverride: true } })
    const reset = within(second.footer).getByRole('button', { name: 'Reset to usual Attendance' })
    expect(reset).toBeEnabled()
    await userEvent.click(reset)
    expect(second.onReset).toHaveBeenCalledTimes(1)
  })

  it('Save for this date saves, and its label stays on one line', async () => {
    const { footer, onSave } = setup()
    const save = within(footer).getByRole('button', { name: 'Save for this date' })
    expect(save).toHaveAttribute('data-one-line')
    await userEvent.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('at most 3 controls in the footer', () => {
    expect(setup().footer.querySelectorAll('button').length).toBeLessThanOrEqual(3)
  })
})
