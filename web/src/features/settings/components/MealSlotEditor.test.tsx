import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { members, tuesdayDinner } from './fixtures'
import { MealSlotEditor } from './MealSlotEditor'

describe('MealSlotEditor', () => {
  it('renders nothing when closed', () => {
    render(<MealSlotEditor open={false} members={members} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('adds a Meal Slot with its default Attendance', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Add Meal Slot' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Weekday'), 'Friday')
    await userEvent.type(screen.getByLabelText('Name'), 'Dinner')
    fireEvent.change(screen.getByLabelText('Usual time'), { target: { value: '20:15' } })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Anna' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Increase Portion Factor for Sam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).toHaveBeenCalledWith({
      weekday: 5,
      name: 'Dinner',
      time: '20:15',
      attendance: [
        { memberId: 1, portionFactorOverride: null },
        { memberId: 3, portionFactorOverride: 0.75 },
      ],
    })
  })

  it('needs a name and a time', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} onSave={onSave} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('edits an existing slot', async () => {
    const onSave = vi.fn()
    const onDelete = vi.fn()
    render(<MealSlotEditor open members={members} slot={tuesdayDinner} onSave={onSave} onDelete={onDelete} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Edit Meal Slot' })).toBeInTheDocument()
    expect(screen.getByLabelText('Weekday')).toHaveDisplayValue('Tuesday')
    expect(screen.getByLabelText('Name')).toHaveValue('Dinner')
    expect(screen.getByLabelText('Usual time')).toHaveValue('19:30')
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 2.5')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marco' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ weekday: 2, attendance: [tuesdayDinner.attendance[0], tuesdayDinner.attendance[2]] }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meal Slot' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('shows a server error', () => {
    render(<MealSlotEditor open members={members} error="That weekday already has a Meal Slot with this name." onSave={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/already has a Meal Slot/)
  })
})
