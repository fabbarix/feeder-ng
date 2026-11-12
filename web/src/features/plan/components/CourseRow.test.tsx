// CRS F: one Course row of a slot block (spec 7.5). Keyboard and ARIA: real buttons, named, in a list.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CourseRowModel } from '../lib/courses'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import type { PlanCourse } from '../types'
import { CourseRow, type CourseAction } from './CourseRow'

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 2 }
const sideCourse = (over: Partial<PlanCourse> = {}) =>
  planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8 }), ...over })
const rowOf = (course: PlanCourse, caption: string | null = 'Side'): CourseRowModel => ({ course, key, caption })

function setup(course = sideCourse(), over: { today?: string; actions?: CourseAction[]; caption?: string | null; compact?: boolean } = {}) {
  const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn(), onChoose: vi.fn() }
  const slot = courseSlot([planCourse({ meal: courseMeal(1, 'Main') }), course])
  render(
    <ul>
      <CourseRow row={rowOf(course, over.caption === undefined ? 'Side' : over.caption)} slot={slot} today={over.today ?? '2026-11-10'} actions={over.actions} compact={over.compact} {...handlers} />
    </ul>,
  )
  return handlers
}

describe('CourseRow', () => {
  it('is a list item named by the Course, with the caption and the Recipe name as a button', () => {
    setup()
    const item = screen.getByRole('listitem', { name: 'Side' })
    expect(within(item).getByText('Side')).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: /Green beans/ })).toBeInTheDocument()
  })

  it('with no caption (a lone row) shows no Course name at all', () => {
    setup(sideCourse(), { caption: null })
    expect(screen.queryByText('Side')).not.toBeInTheDocument()
  })

  it('shows "Dessert · without Sam" as given', () => {
    setup(sideCourse(), { caption: 'Side · without Sam' })
    expect(screen.getByText('Side · without Sam')).toBeInTheDocument()
  })

  it('tapping the Recipe name opens the Planned Meal sheet of that Course', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: /Green beans/ }))
    expect(h.onOpen).toHaveBeenCalledWith(key)
  })

  it('offers Swap by default, labelled, and nothing else', async () => {
    const h = setup()
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Swap' }))
    expect(h.onSwap).toHaveBeenCalledWith(key)
  })

  it('offers Swap, Pin and Mark as Cooked for a planned meal when asked, each reporting that Course', async () => {
    const h = setup(sideCourse(), { actions: ['swap', 'pin', 'cooked'] })
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))
    expect(h.onPin).toHaveBeenCalledWith(key)
    await userEvent.click(screen.getByRole('button', { name: 'Mark as Cooked' }))
    expect(h.onMarkCooked).toHaveBeenCalledWith(key)
  })

  it('a Pinned meal offers Unpin instead of Pin', async () => {
    const h = setup(sideCourse({ meal: courseMeal(2, 'Side', { pinned: true }) }), { actions: ['pin'] })
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unpin' }))
    expect(h.onUnpin).toHaveBeenCalledWith(key)
  })

  it('Mark as Cooked is not offered for a future date', () => {
    setup(sideCourse(), { today: '2026-11-09', actions: ['swap', 'pin', 'cooked'] })
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
  })

  it('a Cooked or Not cooked Course is muted and has no buttons besides its name', () => {
    setup(sideCourse({ meal: courseMeal(2, 'Side', { state: 'cooked' }) }), { actions: ['swap', 'pin', 'cooked'] })
    expect(screen.getByRole('listitem', { name: 'Side' }).querySelector('[data-state="cooked"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Swap' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
  })

  it('an empty Course is the dashed Not planned block with Choose a Recipe for that Course', async () => {
    const h = setup(sideCourse({ meal: null }))
    const item = screen.getByRole('listitem', { name: 'Side' })
    expect(item.querySelector('[data-unfilled]')).not.toBeNull()
    await userEvent.click(within(item).getByRole('button', { name: 'Choose a Recipe' }))
    expect(h.onChoose).toHaveBeenCalledWith(key)
  })

  it('a relaxed pick with nothing else to say shows its relaxed chip, neutral (no status)', () => {
    setup(sideCourse({ meal: courseMeal(2, 'Side', { relaxed: true, why: [{ code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 8 }] }) }))
    const chip = screen.getByText('Again soon: had Sun').closest('.chip')!
    expect(chip).toHaveAttribute('data-kind', 'why')
    expect(chip).not.toHaveAttribute('data-status')
  })

  it('Tab walks through the Recipe name, then Swap, Pin and Mark as Cooked; Enter and Space press them', async () => {
    const h = setup(sideCourse(), { actions: ['swap', 'pin', 'cooked'] })
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /Green beans/ })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Swap' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(h.onSwap).toHaveBeenCalledTimes(1)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Pin' })).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(h.onPin).toHaveBeenCalledTimes(1)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Mark as Cooked' })).toHaveFocus()
  })

  it('the compact row (Today hero, 7-column week) keeps the same names and a smaller layout hook', () => {
    setup(sideCourse(), { compact: true })
    expect(screen.getByRole('listitem', { name: 'Side' })).toHaveAttribute('data-compact', 'true')
  })
})
