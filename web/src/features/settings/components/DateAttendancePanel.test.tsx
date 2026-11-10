import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DateAttendance } from '../types'
import { members, thursdayDinner } from './fixtures'
import { DateAttendancePanel } from './DateAttendancePanel'

const usual: DateAttendance = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5 }
const away: DateAttendance = { ...usual, isOverride: true, attendance: thursdayDinner.attendance.slice(0, 2), portionsNeeded: 2 }

function setup(over: Partial<React.ComponentProps<typeof DateAttendancePanel>> = {}) {
  const props = {
    open: true, slot: thursdayDinner, date: '2026-11-12', attendance: usual, members,
    onChangeDate: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), ...over,
  }
  render(<DateAttendancePanel {...props} />)
  return props
}

describe('DateAttendancePanel', () => {
  it('is titled with the slot and date and starts from the date\'s Attendance', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Dinner on 2026-11-12' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 2.5')
    expect(screen.getByText(/only this date/i)).toBeInTheDocument()
  })

  it('records Sam being away on this date only', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 2')
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith(thursdayDinner.attendance.slice(0, 2))
  })

  it('resets an override to the usual Attendance', async () => {
    const { onReset } = setup({ attendance: away })
    expect(screen.getByRole('checkbox', { name: 'Sam' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Reset to usual Attendance' }))
    expect(onReset).toHaveBeenCalled()
  })

  it('has nothing to reset when the date follows the usual Attendance', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Reset to usual Attendance' })).toBeDisabled()
  })

  it('changing the date (DateField calendar) asks for that date', async () => {
    const { onChangeDate } = setup()
    expect(document.querySelector('input[type=date]')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Date/ }))
    await userEvent.click(screen.getByRole('button', { name: '19 November 2026' }))
    expect(onChangeDate).toHaveBeenCalledWith('2026-11-19')
  })

  it('warns when the date is not on the slot\'s weekday and blocks saving', () => {
    setup({ date: '2026-11-11', attendance: undefined })
    expect(screen.getByRole('alert')).toHaveTextContent('2026-11-11 is not a Thursday')
    expect(screen.getByRole('button', { name: 'Save for this date' })).toBeDisabled()
  })

  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
