// B9-38 (SHORT-02, PC-10, PLAN-13): Who's eating opened from Plan and Today. The title is "Who's eating" under the context line
// "Thu 12 Nov · Dinner"; the sheet's commit is in its footer, always in reach: "Reset to usual" (outlined; named "Reset to usual
// Attendance"; disabled with no date override) and "Save for this date" (primary). The sheet keeps its one round Close (no Cancel).
import { render, screen, within } from '@testing-library/react'
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
  it('holds Reset to usual (outlined) then Save for this date (primary) in one row; the body has neither', () => {
    const { footer, body } = setup()
    expect(footer.querySelectorAll('.form-actions')).toHaveLength(1)
    const buttons = [...footer.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Reset to usual', 'Save for this date'])
    expect(within(footer).getByRole('button', { name: 'Reset to usual Attendance' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(footer).getByRole('button', { name: 'Save for this date' })).toHaveAttribute('data-variant', 'primary')
    expect(within(body).queryByRole('button', { name: 'Save for this date' })).toBeNull()
    expect(within(body).queryByRole('button', { name: 'Reset to usual Attendance' })).toBeNull()
  })

  it('Reset to usual is disabled with no date override and enabled with one', async () => {
    const first = setup()
    expect(within(first.footer).getByRole('button', { name: 'Reset to usual Attendance' })).toBeDisabled()
    document.body.innerHTML = ''
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
