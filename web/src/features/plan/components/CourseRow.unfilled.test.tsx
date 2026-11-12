// CRS G2 (spec 7.4, "On Plan"): an unplanned Course shows a small "Not planned" chip with its cause, on the Course's own row.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, NOBODY, dinner, empty, planned, unfilled } from '../couldnt-fixtures'
import { courseRows } from '../lib/courses'
import type { PlanCourse } from '../types'
import { CourseRow } from './CourseRow'

function rowFor(side: PlanCourse, compact = false) {
  const slot = dinner('2026-11-10', [planned(1, 'Main'), side])
  const row = courseRows(slot).find((r) => r.course.courseId === 2)!
  const onChoose = vi.fn()
  render(
    <ul>
      <CourseRow row={row} slot={slot} today="2026-11-10" compact={compact} onOpen={vi.fn()} onChoose={onChoose} />
    </ul>,
  )
  return { item: screen.getByRole('listitem', { name: 'Side' }), onChoose }
}

describe('CourseRow: an unplanned Course says why', () => {
  it('Excluded: an amber chip and the short reason', () => {
    const { item } = rowFor(empty(2, 'Side', EXCLUDED))
    expect(within(item).getByText('Not planned').closest('.chip')).toHaveAttribute('data-status', 'spoil')
    expect(within(item).getByText('Every Recipe is excluded.')).toBeInTheDocument()
  })

  it('No Recipes for this Course: a blue info chip and its short reason', () => {
    const { item } = rowFor(empty(2, 'Side', NO_COURSE_RECIPES))
    expect(within(item).getByText('Not planned').closest('.chip')).toHaveAttribute('data-status', 'info')
    expect(within(item).getByText('No Recipes for this Course.')).toBeInTheDocument()
  })

  it('never the danger colour', () => {
    const { item } = rowFor(empty(2, 'Side', unfilled('no_candidates', { considered: 3, advanceStep: 3 })))
    expect(item.querySelector('[data-status="danger"]')).toBeNull()
    expect(within(item).getByText('Too late for an Advance Step.')).toBeInTheDocument()
  })

  it('the compact row (Today, the 7-column week) keeps the reason in a title instead of a line', () => {
    const { item } = rowFor(empty(2, 'Side', EXCLUDED), true)
    expect(within(item).queryByText('Every Recipe is excluded.')).not.toBeInTheDocument()
    expect(item.querySelector('[title="Every Recipe is excluded."]')).not.toBeNull()
  })

  it('Nobody attends offers no Choose a Recipe (as a lone slot does): there is nobody to cook for', () => {
    const { item } = rowFor(empty(2, 'Side', NOBODY))
    expect(within(item).getByText('Nobody is set to attend.')).toBeInTheDocument()
    expect(within(item).queryByRole('button', { name: 'Choose a Recipe' })).not.toBeInTheDocument()
  })

  it('every other cause keeps Choose a Recipe for that Course', async () => {
    const { item, onChoose } = rowFor(empty(2, 'Side', NO_COURSE_RECIPES))
    await userEvent.click(within(item).getByRole('button', { name: 'Choose a Recipe' }))
    expect(onChoose).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 4, courseId: 2 })
  })

  it('an empty Course with no reason keeps the plain chip, as before', () => {
    const { item } = rowFor({ ...empty(2, 'Side', EXCLUDED), unfilled: null })
    expect(within(item).getByText('Not planned').closest('.chip')).not.toHaveAttribute('data-status')
  })
})
