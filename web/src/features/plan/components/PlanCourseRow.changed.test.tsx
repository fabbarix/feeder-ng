// B9-26 (PC-01): a row another meal's edit changed keeps an info bar and the meta "was Lentil soup" (the bar is B9-32's CSS; here the
// contract: `data-changed`, the "was" text with its icon, and the row's accessible name). The row reads its mark from ReplanMarksContext
// (the Plan screen provides `review.marks`), so nothing is passed down through DayTile and MealTile (B9-32's).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CourseRowModel } from '../lib/courses'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import { ReplanMarksContext } from '../hooks/useReplanReview'
import { markKey } from '../lib/replan'
import { PlanCourseRow } from './PlanCourseRow'

const key = { date: '2026-11-17', mealSlotId: 2, courseId: 1 }
function setup(changedWas?: string) {
  const course = planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 2, recipeName: 'Chicken curry' }) })
  const row: CourseRowModel = { course, key, caption: null }
  const slot = courseSlot([course], { date: '2026-11-17', mealSlotId: 2 })
  const h = { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn() }
  const view = render(
    <MemoryRouter>
      <ul>
        <ReplanMarksContext.Provider value={changedWas ? { [markKey(key)]: changedWas, '2026-11-18/3/1': 'was Stew' } : {}}>
          <PlanCourseRow row={row} slot={slot} today="2026-11-14" {...h} />
        </ReplanMarksContext.Provider>
      </ul>
    </MemoryRouter>,
  )
  return view.container.querySelector('li')!
}

describe('PlanCourseRow: a changed row (PC-01)', () => {
  it('carries data-changed and says "was Lentil soup" with the ArrowsClockwise icon, decorative', () => {
    const li = setup('was Lentil soup')
    expect(li).toHaveAttribute('data-changed')
    const was = li.querySelector('.plan-row__was')!
    expect(was).toHaveTextContent('was Lentil soup')
    expect(was.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('"was ..." is part of the row\'s accessible name', () => {
    setup('was Lentil soup')
    expect(screen.getByRole('button', { name: /Chicken curry.*was Lentil soup/ })).toBeInTheDocument()
  })

  it('a mark for another cell is not this row\'s', () => {
    const li = setup('was Lentil soup')
    expect(li.querySelectorAll('.plan-row__was')).toHaveLength(1)
  })

  it('a row nothing changed has neither the attribute nor the text', () => {
    const li = setup()
    expect(li).not.toHaveAttribute('data-changed')
    expect(li.querySelector('.plan-row__was')).toBeNull()
    expect(screen.getByRole('button', { name: 'Chicken curry' })).toBeInTheDocument()
  })

  it('a cell that was empty says "was not planned"', () => {
    setup('was not planned')
    expect(document.querySelector('.plan-row__was')).toHaveTextContent('was not planned')
  })
})
