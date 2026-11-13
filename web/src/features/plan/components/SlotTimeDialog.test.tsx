// B5-F1 (ADR 0014): "Time for Thu Dinner": the shared Dialog with the shared TimeField.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { SlotTimeDialog } from './SlotTimeDialog'

const usual = slot({ date: '2026-11-12', time: '19:30', usualTime: '19:30' })
const own = slot({ date: '2026-11-12', time: '20:15', usualTime: '19:30' })

function setup(s: PlanSlot | null) {
  const h = { onSave: vi.fn(), onBack: vi.fn(), onClose: vi.fn() }
  render(<SlotTimeDialog slot={s} {...h} />)
  return h
}
const hour = () => screen.getByRole('spinbutton', { name: 'Hour' })

describe('SlotTimeDialog', () => {
  it('is closed without a slot', () => {
    setup(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is titled for the slot and date, with the TimeField at the slot\'s time and "Usually 19:30" as helper', () => {
    setup(own)
    const dialog = screen.getByRole('dialog', { name: 'Time for Thu Dinner' })
    expect(within(dialog).getByRole('group', { name: 'Time' })).toBeInTheDocument()
    expect(within(dialog).getByText('Usually 19:30')).toBeInTheDocument()
    expect(hour()).toHaveAttribute('aria-valuenow', '20')
    expect(screen.getByRole('spinbutton', { name: 'Minute' })).toHaveAttribute('aria-valuenow', '15')
  })

  it('Save is off until the time changes, then saves the new HH:MM', async () => {
    const h = setup(usual)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    hour().focus()
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.onSave).toHaveBeenCalledWith('20:30')
  })

  it('"Back to 19:30" shows only when the date has its own time, and asks for the usual time', async () => {
    const h = setup(own)
    await userEvent.click(screen.getByRole('button', { name: 'Back to 19:30' }))
    expect(h.onBack).toHaveBeenCalledTimes(1)
  })

  it('has no Back button for the usual time; Cancel closes', async () => {
    const h = setup(usual)
    expect(screen.queryByRole('button', { name: /Back to/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.onClose).toHaveBeenCalledTimes(1)
  })
})
