import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { members, mondayLunch, thursdayDinner, tuesdayDinner } from './fixtures'
import { MealSlotWeek } from './MealSlotWeek'

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const slots = [thursdayDinner, mondayLunch, tuesdayDinner]

function setup(over: Partial<React.ComponentProps<typeof MealSlotWeek>> = {}) {
  const props = { slots, members, canEdit: true, onAdd: vi.fn(), onOpen: vi.fn(), ...over }
  render(<MealSlotWeek {...props} />)
  return props
}

describe('MealSlotWeek (5.14: a week of 7 rows, slots as chips)', () => {
  it('shows all seven weekdays, Monday first, including empty ones', () => {
    setup()
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(WEEK)
  })

  it('puts each Meal Slot in its weekday as a chip with its name and 24 h time, earliest first', () => {
    setup({ slots: [{ ...mondayLunch, id: 20, name: 'Breakfast', time: '07:30' }, mondayLunch] })
    const monday = screen.getByRole('group', { name: 'Monday' })
    expect(within(monday).getAllByRole('button', { name: /^(Breakfast|Lunch) / }).map((b) => b.textContent)).toEqual(['Breakfast 07:30', 'Lunch 12:30'])
    expect(within(screen.getByRole('group', { name: 'Tuesday' })).getByRole('button', { name: 'Dinner 19:30' })).toBeInTheDocument()
    expect(screen.queryByText(/AM|PM/)).toBeNull()
  })

  it('says an empty weekday has no Meal Slot', () => {
    setup()
    expect(within(screen.getByRole('group', { name: 'Wednesday' })).getByText('No Meal Slot')).toBeInTheDocument()
  })

  it('opens the tapped Meal Slot', async () => {
    const { onOpen } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Lunch 12:30' }))
    expect(onOpen).toHaveBeenCalledWith(mondayLunch)
  })

  it('gives an Admin an add button per weekday that adds on that weekday', async () => {
    const { onAdd } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add Meal Slot on Friday' }))
    expect(onAdd).toHaveBeenCalledWith(5)
    expect(screen.getAllByRole('button', { name: /^Add Meal Slot on / })).toHaveLength(7)
  })

  it('has no add buttons for a plain User, who can still open a slot to change one date', async () => {
    const { onOpen } = setup({ canEdit: false })
    expect(screen.queryByRole('button', { name: /^Add Meal Slot/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Dinner 19:00' }))
    expect(onOpen).toHaveBeenCalledWith(thursdayDinner)
  })

  it('does not repeat "Edit" / "Change a date" text buttons per slot (QA: 11 repeats)', () => {
    setup()
    expect(screen.queryAllByRole('button', { name: /^(Edit|Change) / })).toHaveLength(0)
  })

  it('invites an Admin to add the first Meal Slot when there are none', () => {
    setup({ slots: [] })
    expect(screen.getByText('No Meal Slots yet')).toBeInTheDocument()
  })
})
