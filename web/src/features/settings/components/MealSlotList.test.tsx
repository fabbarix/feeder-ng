import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { members, mondayLunch, thursdayDinner, tuesdayDinner } from './fixtures'
import { MealSlotList } from './MealSlotList'

const slots = [thursdayDinner, tuesdayDinner, mondayLunch]
const noop = () => {}

describe('MealSlotList', () => {
  it('groups slots under weekday headings in week order, skipping empty weekdays', () => {
    render(<MealSlotList slots={slots} members={members} canEdit onAdd={noop} onEdit={noop} onEditDate={noop} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Monday', 'Tuesday', 'Thursday'])
  })

  it('shows name, usual time and portions for each slot', () => {
    render(<MealSlotList slots={slots} members={members} canEdit onAdd={noop} onEdit={noop} onEditDate={noop} />)
    const tuesday = screen.getByRole('group', { name: 'Tuesday' })
    expect(within(tuesday).getByText('Dinner')).toBeInTheDocument()
    expect(within(tuesday).getByText('19:30')).toBeInTheDocument()
    expect(within(tuesday).getByText('2.5 portions')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Monday' })).getByText('0 portions')).toBeInTheDocument()
  })

  it('lets an Admin add and edit, and anyone change a date', async () => {
    const onAdd = vi.fn()
    const onEdit = vi.fn()
    const onEditDate = vi.fn()
    render(<MealSlotList slots={slots} members={members} canEdit onAdd={onAdd} onEdit={onEdit} onEditDate={onEditDate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add Meal Slot' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Dinner on Tuesday' }))
    await userEvent.click(screen.getByRole('button', { name: 'Change Dinner on a date (Thursday)' }))
    expect(onAdd).toHaveBeenCalled()
    expect(onEdit).toHaveBeenCalledWith(tuesdayDinner)
    expect(onEditDate).toHaveBeenCalledWith(thursdayDinner)
  })

  it('a plain User cannot add or edit but can still change a date', async () => {
    const onEditDate = vi.fn()
    render(<MealSlotList slots={slots} members={members} canEdit={false} onAdd={noop} onEdit={noop} onEditDate={onEditDate} />)
    expect(screen.queryByRole('button', { name: 'Add Meal Slot' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Change Lunch on a date (Monday)' }))
    expect(onEditDate).toHaveBeenCalledWith(mondayLunch)
  })

  it('invites the Admin to add the first Meal Slot', () => {
    render(<MealSlotList slots={[]} members={members} canEdit onAdd={noop} onEdit={noop} onEditDate={noop} />)
    expect(screen.getByText(/no Meal Slots yet/i)).toBeInTheDocument()
  })
})
