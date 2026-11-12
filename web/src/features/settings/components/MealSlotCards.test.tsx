import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MealSlotCards } from './MealSlotCards'
import { dateRows, dinnerCard, lunchCard, twoMembers } from './mealSlotCardFixtures'

function setup(over: Partial<React.ComponentProps<typeof MealSlotCards>> = {}) {
  const props = { cards: [lunchCard, dinnerCard], dateRows, members: twoMembers, canEdit: true, locale: 'en', onEdit: vi.fn(), onFix: vi.fn(), onChangeDate: vi.fn(), onAddOn: vi.fn(), ...over }
  render(<MealSlotCards {...props} />)
  return props
}

describe('MealSlotCards', () => {
  it('says once that everyone eats unless a Meal Slot says otherwise', () => {
    setup()
    expect(screen.getAllByText('Everyone eats unless a Meal Slot says otherwise')).toHaveLength(1)
  })
  it('shows one card per name, in the given order, then the Dates that differ tile', () => {
    setup()
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(regions).toEqual(['Lunch', 'Dinner', 'Dates that differ'])
  })
  it('gives a full-span card the whole row and a half card one column (Bento sizing)', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Dinner' })).toHaveAttribute('data-span', 'full')
    expect(screen.getByRole('region', { name: 'Lunch' })).not.toHaveAttribute('data-span', 'full')
  })
  it('routes the card callbacks', async () => {
    const props = setup()
    await userEvent.click(within(screen.getByRole('region', { name: 'Lunch' })).getByRole('button', { name: 'Change a date for Lunch' }))
    expect(props.onChangeDate).toHaveBeenCalledWith(lunchCard)
    await userEvent.click(within(screen.getByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Edit Dinner' }))
    expect(props.onEdit).toHaveBeenCalledWith(dinnerCard.editSlot)
  })
  it('scales to five cards: five regions plus the dates tile', () => {
    const five = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ ...dinnerCard, key: n.toLowerCase(), name: n }))
    setup({ cards: five })
    expect(screen.getAllByRole('region')).toHaveLength(6)
  })
  it('without any Meal Slot it is an empty state and no household line', () => {
    setup({ cards: [], dateRows: [] })
    expect(screen.getByText('No Meal Slots yet')).toBeInTheDocument()
    expect(screen.queryByText('Everyone eats unless a Meal Slot says otherwise')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Dates that differ' })).toBeNull()
  })
})
