// B5-F1 (ADR 0014, beta5-plan 2.2): Guests and the portions preview on the Date Attendance sheet; the read-only date of Who's eating.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DateAttendance } from '../types'
import { DateAttendancePanel } from './DateAttendancePanel'
import { members, thursdayDinner } from './fixtures'

const usual: DateAttendance = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5, guests: 0 }

function setup(over: Partial<React.ComponentProps<typeof DateAttendancePanel>> = {}) {
  const props = { open: true, slot: thursdayDinner, date: '2026-11-12', attendance: usual, members, onChangeDate: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), ...over }
  render(<DateAttendancePanel {...props} />)
  return props
}
const guests = () => screen.getByRole('spinbutton', { name: 'Guests' })

describe('DateAttendancePanel: Guests', () => {
  it('has a Guests stepper with its helper, at the date\'s Guests', () => {
    setup({ attendance: { ...usual, guests: 2 } })
    expect(guests()).toHaveAttribute('aria-valuenow', '2')
    expect(guests()).toHaveAttribute('aria-valuemin', '0')
    expect(guests()).toHaveAttribute('aria-valuemax', '20')
    expect(screen.getByText('Each Guest eats one standard portion of every Course.')).toBeInTheDocument()
  })

  it('previews the portions of each Course with the Guests', async () => {
    setup()
    expect(screen.getByText('2.5 portions of each Course')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Guests' }))
    await userEvent.click(screen.getByRole('button', { name: 'Increase Guests' }))
    expect(screen.getByText('4.5 portions of each Course')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    expect(screen.getByText('4 portions of each Course')).toBeInTheDocument()
  })

  it('stops at 20 and at 0', async () => {
    setup({ attendance: { ...usual, guests: 20 } })
    expect(screen.getByRole('button', { name: 'Increase Guests' })).toBeDisabled()
  })

  it('saves the Guests with the Attendance as a third argument', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Guests' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith(thursdayDinner.attendance, undefined, 1)
  })

  it('leaves the Guests out of the call when they did not change (as before)', async () => {
    const { onSave } = setup({ attendance: { ...usual, guests: 2 } })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    expect(onSave).toHaveBeenCalledWith(thursdayDinner.attendance.slice(0, 2))
  })

  it('U1: with nobody and no Guest it says the date is Not served; a Guest takes the note away', async () => {
    setup()
    for (const name of ['Anna', 'Marco', 'Sam']) await userEvent.click(screen.getByRole('checkbox', { name }))
    expect(screen.getByText('Nobody is eating, so this date is Not served.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Increase Guests' }))
    expect(screen.queryByText('Nobody is eating, so this date is Not served.')).not.toBeInTheDocument()
  })

  it('Reset to usual Attendance is enabled for a date that has Guests (it drops them too)', () => {
    setup({ attendance: { ...usual, guests: 2 } })
    expect(screen.getByRole('button', { name: 'Reset to usual Attendance' })).toBeEnabled()
  })
})

describe('DateAttendancePanel: a date that is not editable (opened from Plan or Today)', () => {
  it('shows the date in the title and has no date picker', () => {
    setup({ dateReadOnly: true })
    expect(screen.getByRole('dialog', { name: "Who's eating Dinner on 2026-11-12" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Date/ })).not.toBeInTheDocument()
  })

  it('Settings keeps the picker', () => {
    setup()
    expect(screen.getByRole('button', { name: /Date/ })).toBeInTheDocument()
  })
})
