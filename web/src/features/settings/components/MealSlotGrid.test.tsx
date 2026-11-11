import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { members, mondayLunch, thursdayDinner, tuesdayDinner } from './fixtures'
import { MealSlotGrid } from './MealSlotGrid'

const slots = [mondayLunch, tuesdayDinner, thursdayDinner]
function setup(over: Partial<React.ComponentProps<typeof MealSlotGrid>> = {}) {
  const props = { slots, members, canEdit: true, onAdd: vi.fn(), onOpen: vi.fn(), ...over }
  render(<MealSlotGrid {...props} />)
  return props
}

describe('MealSlotGrid (R15: desktop week, days as columns, slots as rows)', () => {
  it('is a table with a column header per weekday, Monday first, and a row header per Meal Slot name', () => {
    setup()
    const table = screen.getByRole('table', { name: 'Meal Slots by weekday' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent).filter(Boolean)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Lunch', 'Dinner'])
  })

  it('puts a slot in its day cell with its time and attendee pills', () => {
    setup()
    const cell = screen.getByRole('cell', { name: /Dinner.*Tuesday/ })
    expect(within(cell).getByRole('button', { name: 'Dinner 19:30' })).toBeInTheDocument()
    expect(within(cell).getByRole('list', { name: 'Attending Dinner on Tuesday' })).toBeInTheDocument()
  })

  it('shows "Nobody attending" in the cell of a slot nobody attends', () => {
    setup()
    expect(within(screen.getByRole('cell', { name: /Lunch.*Monday/ })).getByRole('button', { name: /^Nobody attending/ })).toBeInTheDocument()
  })

  it('an empty cell is empty for a plain User and offers an add button to an Admin', async () => {
    const { onAdd } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add Dinner on Wednesday' }))
    expect(onAdd).toHaveBeenCalledWith(3)
  })
  it('a plain User gets no add buttons', () => {
    setup({ canEdit: false })
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
  })

  it('every slot cell carries its anchor id', () => {
    setup()
    for (const s of slots) expect(document.getElementById(`meal-slot-${s.id}`)).not.toBeNull()
  })

  it('opens the tapped slot', async () => {
    const { onOpen } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Lunch 12:30' }))
    expect(onOpen).toHaveBeenCalledWith(mondayLunch)
  })

  it('weekStart 7 starts on Sunday', () => {
    setup({ weekStart: 7 })
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent).filter(Boolean)[0]).toBe('Sun')
  })
})
