// B9-32 (A11Y-08, A11Y-09): the hero's Course rows use the Plan's names, Pin is one toggle, and the icons are an IconSet named "<Course> actions".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import type { PlanCourse } from '../types'
import { CourseRow } from './CourseRow'

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 2 }
const side = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8 }), ...over })

function setup(course = side()) {
  const h = { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn(), onChoose: vi.fn() }
  render(
    <ul>
      <CourseRow row={{ course, key, caption: 'Side' }} slot={courseSlot([planCourse({ meal: courseMeal(1, 'Main') }), course], { name: 'Dinner' })} today="2026-11-10" actions={['swap', 'pin']} {...h} />
    </ul>,
  )
  return h
}

describe('CourseRow names and IconSet', () => {
  it('Swap and Pin name the Recipe, the day and the Meal Slot', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Swap Green beans, Tue 10 Dinner' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pin Green beans, Tue 10 Dinner' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('the actions are an IconSet (a labelled group "Side actions" with 8 px gaps), not a hand-made span', () => {
    setup()
    const group = screen.getByRole('group', { name: 'Side actions' })
    expect(group).toHaveClass('icon-set')
    expect(within(group).getAllByRole('button')).toHaveLength(2)
  })

  it('an empty row\'s Choose button names its Course, day and Meal Slot: "Choose a Recipe for Side, Tue 10 Dinner"', async () => {
    const h = setup(side({ meal: null, unfilled: { reason: 'no_course_recipes', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } as never }))
    await userEvent.click(screen.getByRole('button', { name: 'Choose a Recipe for Side, Tue 10 Dinner' }))
    expect(h.onChoose).toHaveBeenCalledWith(key)
  })
})
