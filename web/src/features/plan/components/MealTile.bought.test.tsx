// B5-BOW: the Bought chip on a day-tile meal and on a Course row, only when the row has no other chip.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, favourite, meal, planCourse, slot } from '../test-utils'
import type { BoughtInfo } from '../lib/bought'
import type { CourseRowModel } from '../lib/courses'
import { CourseRow } from './CourseRow'
import { MealTile } from './MealTile'

const bought: BoughtInfo = { ingredients: [{ id: 1, name: 'chicken thighs' }] }
const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn() }

describe('MealTile: Bought chip', () => {
  it('shows a neutral Bought chip when the meal has no other chip', () => {
    render(<MealTile slot={slot({ meal: meal({ bought }) })} today="2026-11-10" {...handlers} />)
    const chip = screen.getByText('Bought').closest('.chip')
    expect(chip).toHaveAttribute('data-kind', 'why')
    expect(chip?.querySelector('svg')).not.toBeNull()
  })
  it('shows only the one chip it had when the meal has another', () => {
    render(<MealTile slot={slot({ meal: meal({ bought, why: [favourite('Anna')] }) })} today="2026-11-10" {...handlers} />)
    expect(screen.getByText("Anna's favourite")).toBeInTheDocument()
    expect(screen.queryByText('Bought')).not.toBeInTheDocument()
  })
  it('shows no Bought chip for a meal that is not Bought', () => {
    render(<MealTile slot={slot({ meal: meal({ bought: null }) })} today="2026-11-10" {...handlers} />)
    expect(screen.queryByText('Bought')).not.toBeInTheDocument()
  })
})

describe('CourseRow: Bought chip', () => {
  const key = { date: '2026-11-10', mealSlotId: 2, courseId: 2 }
  const rowFor = (over: Parameters<typeof courseMeal>[2]) => {
    const course = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', ...over }) })
    const row: CourseRowModel = { course, key, caption: 'Side' }
    render(
      <ul>
        <CourseRow row={row} slot={courseSlot([planCourse({ meal: courseMeal(1, 'Main') }), course])} today="2026-11-10" onOpen={vi.fn()} />
      </ul>,
    )
    return within(screen.getByRole('listitem', { name: 'Side' }))
  }
  it('shows the Bought chip when the row has no other chip', () => {
    expect(rowFor({ bought }).getByText('Bought')).toBeInTheDocument()
  })
  it('shows no Bought chip when the row has another chip', () => {
    const row = rowFor({ bought, pinned: true })
    expect(row.getByText('Pinned')).toBeInTheDocument()
    expect(row.queryByText('Bought')).not.toBeInTheDocument()
  })
})
