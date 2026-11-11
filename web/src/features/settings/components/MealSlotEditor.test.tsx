import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { pickOption, toggleOptions } from '../test-utils'
import { members, tuesdayDinner } from './fixtures'
import { MealSlotEditor } from './MealSlotEditor'

const hour = () => screen.getByRole('spinbutton', { name: 'Hour' })

async function typeTime(digits: string) {
  hour().focus()
  await userEvent.keyboard(digits)
}

describe('MealSlotEditor', () => {
  it('renders nothing when closed', () => {
    render(<MealSlotEditor open={false} members={members} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no native control: no <select>, no time input', () => {
    render(<MealSlotEditor open members={members} onSave={() => {}} onClose={() => {}} />)
    expect(document.querySelector('select, input[type=time], input[type=number]')).toBeNull()
  })

  it('adds a Meal Slot for several weekdays at once (QA)', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Add Meal Slot' })).toBeInTheDocument()
    await toggleOptions(/Weekdays/, ['Friday', 'Monday', 'Wednesday'])
    expect(screen.getByRole('combobox', { name: /Weekdays/ })).toHaveTextContent('Monday, Wednesday, Friday')
    await userEvent.type(screen.getByLabelText('Name'), 'Dinner')
    await typeTime('2015')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marco' })) // opt out: everyone starts checked
    await userEvent.click(screen.getByRole('button', { name: 'Increase Portion Factor for Sam' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    const attendance = [
      { memberId: 1, portionFactorOverride: null },
      { memberId: 3, portionFactorOverride: 0.75 },
    ]
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith([
      { weekday: 1, name: 'Dinner', time: '20:15', attendance },
      { weekday: 3, name: 'Dinner', time: '20:15', attendance },
      { weekday: 5, name: 'Dinner', time: '20:15', attendance },
    ])
  })

  it('R13: a new Meal Slot opens with every Member attending, and saves them all if nothing is changed', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} defaultWeekdays={[2]} onSave={onSave} onClose={() => {}} />)
    for (const name of ['Anna', 'Marco', 'Sam']) expect(screen.getByRole('checkbox', { name })).toBeChecked()
    await userEvent.type(screen.getByLabelText('Name'), 'Dinner')
    await typeTime('1930')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({
        weekday: 2,
        attendance: [
          { memberId: 1, portionFactorOverride: null },
          { memberId: 2, portionFactorOverride: null },
          { memberId: 3, portionFactorOverride: null },
        ],
      }),
    ])
  })

  it('R13: editing a Meal Slot nobody attends keeps it that way', () => {
    render(<MealSlotEditor open members={members} slot={{ ...tuesdayDinner, attendance: [] }} onSave={() => {}} onClose={() => {}} />)
    for (const name of ['Anna', 'Marco', 'Sam']) expect(screen.getByRole('checkbox', { name })).not.toBeChecked()
  })

  it('starts with the weekday the add button was on (defaultWeekdays)', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} defaultWeekdays={[5]} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByRole('combobox', { name: /Weekdays/ })).toHaveTextContent('Friday')
    await userEvent.type(screen.getByLabelText('Name'), 'Lunch')
    await typeTime('1230')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ weekday: 5, name: 'Lunch', time: '12:30' })])
  })

  it('needs at least one weekday', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} onSave={onSave} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Dinner')
    await typeTime('1930')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one weekday/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('needs a name and a time', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} onSave={onSave} onClose={() => {}} />)
    await toggleOptions(/Weekdays/, ['Monday'])
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('edits one existing slot with a single-choice Weekday (no multi-select)', async () => {
    const onSave = vi.fn()
    const onDelete = vi.fn()
    render(<MealSlotEditor open members={members} slot={tuesdayDinner} onSave={onSave} onDelete={onDelete} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Edit Meal Slot' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Weekdays/ })).toBeNull()
    expect(screen.getByRole('combobox', { name: /Weekday/ })).toHaveTextContent('Tuesday')
    expect(screen.getByLabelText('Name')).toHaveValue('Dinner')
    expect(hour()).toHaveValue('19')
    expect(screen.getByRole('spinbutton', { name: 'Minute' })).toHaveValue('30')
    expect(screen.getByRole('status')).toHaveTextContent('Portions needed: 2.5')
    await pickOption(/Weekday/, 'Wednesday')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marco' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ weekday: 3, attendance: [tuesdayDinner.attendance[0], tuesdayDinner.attendance[2]] }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meal Slot' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('offers "Change a date" only when editing, for the one-date Attendance', async () => {
    const onChangeDate = vi.fn()
    const { rerender } = render(<MealSlotEditor open members={members} onSave={() => {}} onClose={() => {}} onChangeDate={onChangeDate} />)
    expect(screen.queryByRole('button', { name: 'Change a date' })).toBeNull()
    rerender(<MealSlotEditor open members={members} slot={tuesdayDinner} onSave={() => {}} onClose={() => {}} onChangeDate={onChangeDate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Change a date' }))
    expect(onChangeDate).toHaveBeenCalled()
  })

  it('shows a server error', () => {
    render(<MealSlotEditor open members={members} error="That weekday already has a Meal Slot with this name." onSave={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/already has a Meal Slot/)
  })
})
