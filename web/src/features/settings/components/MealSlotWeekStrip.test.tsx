import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MealSlotWeekStrip } from './MealSlotWeekStrip'
import { dinnerCard, lunchCard } from './mealSlotCardFixtures'

function setup(card = dinnerCard, over: Partial<React.ComponentProps<typeof MealSlotWeekStrip>> = {}) {
  const props = { name: card.name, cells: card.week, canEdit: true, locale: 'en', onEdit: vi.fn(), onAddOn: vi.fn(), ...over }
  render(<MealSlotWeekStrip {...props} />)
  return props
}

describe('MealSlotWeekStrip', () => {
  it('is a group named "<name> by weekday" with seven days in the given order, each with its short name', () => {
    setup()
    const strip = screen.getByRole('group', { name: 'Dinner by weekday' })
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) expect(within(strip).getByText(d)).toBeInTheDocument()
  })
  it('marks a day that differs for assistive technology as well as by the dot', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Dinner on Wednesday, 19:30' })).toHaveAccessibleDescription(/differs/i)
    expect(screen.getByRole('button', { name: 'Dinner on Tuesday, 19:30' })).not.toHaveAccessibleDescription(/differs/i)
  })
  it('free days are "+ add" buttons for an Admin and nothing for a plain User', () => {
    setup(lunchCard)
    expect(screen.getAllByRole('button', { name: /^Add Lunch on / })).toHaveLength(6)
  })
  it('a plain User gets no buttons at all', () => {
    setup(lunchCard, { canEdit: false })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('opens the tapped day', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Dinner on Monday, 19:30' }))
    expect(props.onEdit).toHaveBeenCalledWith(dinnerCard.week[0] && 'slot' in dinnerCard.week[0] ? dinnerCard.week[0].slot : undefined)
  })
})
