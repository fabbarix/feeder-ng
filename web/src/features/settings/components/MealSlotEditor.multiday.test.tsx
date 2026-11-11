import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { members, mondayLunch, tuesdayDinner } from './fixtures'
import { MealSlotEditor } from './MealSlotEditor'
import type { MealSlot } from '../types'

const dinner = (id: number, weekday: number): MealSlot => ({ ...tuesdayDinner, id, weekday })
const all: MealSlot[] = [dinner(9, 1), tuesdayDinner, dinner(11, 3), dinner(12, 4), mondayLunch]
const group = (name: string) => screen.getByRole('group', { name })
const pressed = (name: string) => within(group(name)).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'))
const summary = () => within(screen.getByRole('list', { name: 'What will change' }))

function edit(over: Partial<React.ComponentProps<typeof MealSlotEditor>> = {}) {
  const onApply = vi.fn()
  const onSave = vi.fn()
  render(<MealSlotEditor open members={members} slot={tuesdayDinner} slots={all} onSave={onSave} onApply={onApply} onClose={() => {}} {...over} />)
  return { onApply, onSave }
}
async function typeTime(digits: string) {
  screen.getByRole('spinbutton', { name: 'Hour' }).focus()
  await userEvent.keyboard(digits)
}

describe('MealSlotEditor, editing: apply to several days (R15)', () => {
  it('replaces the Weekday dropdown with "Apply to" chips, defaulting to the day being edited', () => {
    edit()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(pressed('Apply to')).toEqual(['Tuesday'])
  })

  it('offers the quick picks "All days with Dinner", "Weekdays" and "Weekend"', async () => {
    edit()
    await userEvent.click(screen.getByRole('button', { name: 'All days with Dinner' }))
    expect(pressed('Apply to')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday'])
    expect(screen.getByRole('button', { name: 'All days with Dinner' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Weekdays' }))
    expect(pressed('Apply to')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    await userEvent.click(screen.getByRole('button', { name: 'Weekend' }))
    expect(pressed('Apply to')).toEqual(['Saturday', 'Sunday'])
    expect(screen.getByRole('button', { name: 'All days with Dinner' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('summarises before saving: what is updated and which days are skipped', async () => {
    edit()
    expect(summary().getByText('Update Dinner on Tue')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Weekdays' }))
    expect(summary().getByText('Update Dinner on Mon, Tue, Wed, Thu')).toBeInTheDocument()
    expect(summary().getByText('Fri skipped: no Dinner')).toBeInTheDocument()
  })

  it('saves ONE batch request with the original name, the chosen weekdays and only the changed fields', async () => {
    const { onApply, onSave } = edit()
    await userEvent.click(screen.getByRole('button', { name: 'Monday' }))
    await userEvent.click(screen.getByRole('button', { name: 'Wednesday' }))
    await typeTime('2000')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith({ match: 'Dinner', weekdays: [1, 2, 3], set: { time: '20:00' } })
  })

  it('a rename and an Attendance change travel together; the match is the old name', async () => {
    const { onApply } = edit()
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Supper')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Marco' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onApply).toHaveBeenCalledWith({
      match: 'Dinner',
      weekdays: [2],
      set: { name: 'Supper', attendance: [tuesdayDinner.attendance[0], tuesdayDinner.attendance[2]] },
    })
  })

  it('saving with nothing changed says so and sends nothing', async () => {
    const { onApply } = edit()
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing to change/i)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('needs at least one weekday', async () => {
    const { onApply } = edit()
    await userEvent.click(screen.getByRole('button', { name: 'Tuesday' }))
    await typeTime('2000')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one weekday/i)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('still offers "Change a date" and "Remove Meal Slot"', async () => {
    const onDelete = vi.fn()
    edit({ onDelete, onChangeDate: () => {} })
    expect(screen.getByRole('button', { name: 'Change a date' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meal Slot' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('weekStart 7 lays the chips out from Sunday', () => {
    edit({ weekStart: 7 })
    expect(within(group('Apply to')).getAllByRole('button')[0]).toHaveAccessibleName('Sunday')
  })
})

describe('MealSlotEditor, adding: weekday chips instead of the Weekdays dropdown (R15)', () => {
  it('shows "Days" chips with the add button\'s weekday pressed and the quick picks Every day / Weekdays / Weekend', async () => {
    render(<MealSlotEditor open members={members} defaultWeekdays={[5]} onSave={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(pressed('Days')).toEqual(['Friday'])
    await userEvent.click(screen.getByRole('button', { name: 'Weekend' }))
    expect(pressed('Days')).toEqual(['Saturday', 'Sunday'])
    await userEvent.click(screen.getByRole('button', { name: 'Every day' }))
    expect(pressed('Days')).toHaveLength(7)
  })

  it('saves one input per chosen weekday, as before', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} defaultWeekdays={[5]} onSave={onSave} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Weekend' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Brunch')
    await typeTime('1100')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ weekday: 6, name: 'Brunch', time: '11:00' }),
      expect.objectContaining({ weekday: 7, name: 'Brunch', time: '11:00' }),
    ])
  })

  it('needs at least one weekday', async () => {
    const onSave = vi.fn()
    render(<MealSlotEditor open members={members} onSave={onSave} onClose={() => {}} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Brunch')
    await typeTime('1100')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one weekday/i)
    expect(onSave).not.toHaveBeenCalled()
  })
})
