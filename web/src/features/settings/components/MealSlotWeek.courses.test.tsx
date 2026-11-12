// CRS D2: the Meal Slots overview shows each slot's Courses under its name ("Main · Side · Dessert (optional) without Sam").
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { thursdayDinnerCourses, tuesdayDinnerCourses } from './courseFixtures'
import { members, mondayLunch } from './fixtures'
import { MealSlotGrid } from './MealSlotGrid'
import { MealSlotWeek } from './MealSlotWeek'

const slots = [tuesdayDinnerCourses, thursdayDinnerCourses, mondayLunch]
const noop = () => {}

describe('MealSlotWeek: Courses line', () => {
  it('writes the Courses of a slot in its group, with (optional) and "without <Member>"', () => {
    render(<MealSlotWeek slots={slots} members={members} canEdit onAdd={noop} onOpen={noop} />)
    expect(within(screen.getByRole('group', { name: 'Tuesday' })).getByText('Main · Side · Dessert (optional) without Sam')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Thursday' })).getByText('Main · Side')).toBeInTheDocument()
  })

  it('writes nothing for a slot that carries no Courses', () => {
    render(<MealSlotWeek slots={[mondayLunch]} members={members} canEdit onAdd={noop} onOpen={noop} />)
    expect(screen.queryByText(/Main/)).toBeNull()
  })
})

describe('MealSlotGrid: Courses line', () => {
  it('writes the Courses of a slot in its cell', () => {
    render(<MealSlotGrid slots={slots} members={members} canEdit onAdd={noop} onOpen={noop} />)
    expect(within(screen.getByRole('cell', { name: 'Dinner on Tuesday' })).getByText('Main · Side · Dessert (optional) without Sam')).toBeInTheDocument()
    expect(within(screen.getByRole('cell', { name: 'Dinner on Thursday' })).getByText('Main · Side')).toBeInTheDocument()
  })
})
