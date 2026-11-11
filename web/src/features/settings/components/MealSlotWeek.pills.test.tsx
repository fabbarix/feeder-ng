import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { members, mondayLunch, thursdayDinner, tuesdayDinner } from './fixtures'
import { MealSlotWeek } from './MealSlotWeek'

function setup(over: Partial<React.ComponentProps<typeof MealSlotWeek>> = {}) {
  const props = { slots: [mondayLunch, tuesdayDinner, thursdayDinner], members, canEdit: true, onAdd: vi.fn(), onOpen: vi.fn(), ...over }
  render(<MealSlotWeek {...props} />)
  return props
}

describe('MealSlotWeek: attendee pills and anchors (R15, mobile and tablet list)', () => {
  it('each Meal Slot shows who attends as pills', () => {
    setup()
    const tuesday = screen.getByRole('group', { name: 'Tuesday' })
    const list = within(tuesday).getByRole('list', { name: 'Attending Dinner on Tuesday' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('a slot nobody attends shows the warning pill, which opens the same sheet as the slot chip', async () => {
    const { onOpen } = setup()
    await userEvent.click(within(screen.getByRole('group', { name: 'Monday' })).getByRole('button', { name: /^Nobody attending/ }))
    expect(onOpen).toHaveBeenCalledWith(mondayLunch)
  })

  it('each Meal Slot has a stable anchor id, so a link can land on it', () => {
    setup()
    for (const id of [10, 11, 12]) expect(document.getElementById(`meal-slot-${id}`)).not.toBeNull()
    expect(document.getElementById('meal-slot-12')).toContainElement(screen.getByRole('button', { name: 'Lunch 12:30' }))
  })
})
