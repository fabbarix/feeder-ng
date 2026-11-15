// B9-32 (A11Y-08, system.md §5.1): the slot menu's trigger is "More for <day> <Meal Slot>" when the caller gives the day, so seven
// "Dinner actions" become seven different names. Without a day (Today's hero until B9-39) it stays "<Slot> actions".
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import { SlotMenu } from './SlotMenu'

const main = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main') })
const side = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })
const h = { onMarkAllCooked: vi.fn(), onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() }
const view = (dayLabel?: string) =>
  render(
    <MemoryRouter>
      <SlotMenu slot={courseSlot([main, side])} today="2026-11-10" dayLabel={dayLabel} {...h} />
    </MemoryRouter>,
  )

describe('SlotMenu names', () => {
  it('with a day: "More for Tue 10 Dinner"', () => {
    view('Tue 10')
    expect(screen.getByRole('button', { name: 'More for Tue 10 Dinner' })).toHaveAttribute('aria-haspopup', 'menu')
  })
  it('without a day: "Dinner actions" as before', () => {
    view()
    expect(screen.getByRole('button', { name: 'Dinner actions' })).toBeInTheDocument()
  })
})
