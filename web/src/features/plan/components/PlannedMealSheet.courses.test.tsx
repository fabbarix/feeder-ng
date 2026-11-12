// CRS F (spec 7.5, ADR 0009): the Planned Meal sheet is per Course; a relaxed pick explains itself and offers the fix.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { PlanCourse, PlanSlot, Why } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

const members = [
  { id: 1, name: 'Sam', colour: '#3366cc' },
  { id: 2, name: 'Ada', colour: '#81b29a' },
]
const cool = { code: 'cooldown_relaxed' as const, date: '2026-11-08', recipeId: 8 }
const main = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken', portions: 4 }), ...over })
const side = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8, portions: 2 }), ...over })

function setup(s: PlanSlot, courseId: number) {
  const h = {
    onClose: vi.fn(), onCook: vi.fn(), onMarkCooked: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn(),
    onMarkRecipes: vi.fn(), onAddRecipes: vi.fn(), onReviewVarietyRules: vi.fn(),
  }
  render(<PlannedMealSheet open slot={s} today="2026-11-10" courseId={courseId} {...h} />)
  return { ...h, dialog: within(screen.getByRole('dialog')) }
}

/** React's useId hands out `_r_0_`, `_r_1_`, … per render; only the counter differs between the two renders, so compare with it normalised. */
const withoutGeneratedIds = (html: string) => html.replace(/_r_[0-9a-z]+_/g, '_r_#_')

describe('one Course looks exactly as before (regression guard)', () => {
  it('a single Course in `courses` gives the same sheet as a slot without `courses`', () => {
    const m = meal({ recipeName: 'Chicken curry', why: [{ code: 'favourite', members: ['Anna'] }] })
    const handlers = { onClose: () => {}, onCook: () => {}, onMarkCooked: () => {}, onSwap: () => {}, onPin: () => {}, onUnpin: () => {}, onChoose: () => {} }
    const before = render(<PlannedMealSheet open slot={slot({ meal: m })} courseId={1} today="2026-11-10" {...handlers} />)
    const old = withoutGeneratedIds(screen.getByRole('dialog').innerHTML)
    before.unmount()
    render(<PlannedMealSheet open slot={courseSlot([planCourse({ courseId: 1, meal: m })])} courseId={1} today="2026-11-10" {...handlers} />)
    expect(withoutGeneratedIds(screen.getByRole('dialog').innerHTML)).toBe(old)
  })
})

describe('PlannedMealSheet for a Course', () => {
  const two = () => courseSlot([main(), side({ optOutMemberIds: [1] })], { attendance: members })

  it('is titled by the Course\'s Recipe and its header names the slot and the Course', () => {
    const h = setup(two(), 2)
    expect(screen.getByRole('dialog', { name: 'Green beans' })).toBeInTheDocument()
    expect(h.dialog.getByText(/Tue Dinner · Side/)).toBeInTheDocument()
  })

  it('shows the Course\'s portions, not the slot\'s or the main Course\'s', () => {
    const h = setup(two(), 2)
    expect(h.dialog.getByText(/2 portions/)).toBeInTheDocument()
    expect(h.dialog.queryByText(/4 portions/)).not.toBeInTheDocument()
  })

  it('the Attendance avatars are the Course\'s attendees: the slot\'s without those who opt out', () => {
    const h = setup(two(), 2)
    expect(h.dialog.getByRole('img', { name: 'Ada' })).toBeInTheDocument()
    expect(h.dialog.queryByRole('img', { name: 'Sam' })).not.toBeInTheDocument()
  })

  it('the main Course keeps everybody', () => {
    const h = setup(two(), 1)
    expect(h.dialog.getByRole('img', { name: 'Ada' })).toBeInTheDocument()
    expect(h.dialog.getByRole('img', { name: 'Sam' })).toBeInTheDocument()
  })

  it('every action carries the key with the Course', async () => {
    const h = setup(two(), 2)
    const key = { date: '2026-11-10', mealSlotId: 2, courseId: 2 }
    await userEvent.click(h.dialog.getByRole('button', { name: 'Swap' }))
    await userEvent.click(h.dialog.getByRole('button', { name: 'Pin' }))
    await userEvent.click(h.dialog.getByRole('button', { name: 'Mark as Cooked' }))
    await userEvent.click(h.dialog.getByRole('button', { name: 'Choose a Recipe' }))
    expect(h.onSwap).toHaveBeenCalledWith(key)
    expect(h.onPin).toHaveBeenCalledWith(key)
    expect(h.onMarkCooked).toHaveBeenCalledWith(key)
    expect(h.onChoose).toHaveBeenCalledWith(key)
  })

  it('Cook is for the slot (the timeline): the key has no Course', async () => {
    const h = setup(two(), 2)
    await userEvent.click(h.dialog.getByRole('button', { name: 'Cook' }))
    expect(h.onCook).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 })
  })
})

describe('a relaxed pick explains itself (ADR 0009)', () => {
  const relaxedSide = (why: Why[] = [cool]) => courseSlot([main(), side({ meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8, relaxed: true, why }) })])

  it('always shows the relaxed chip and, under the chips, the line with its fix', async () => {
    const h = setup(relaxedSide(), 2)
    expect(h.dialog.getByText('Again soon: had Sun')).toBeInTheDocument()
    expect(h.dialog.getByText('Few Side Recipes, so this comes round sooner. Add Side Recipes for more variety.')).toBeInTheDocument()
    await userEvent.click(h.dialog.getByRole('button', { name: 'Mark Recipes as Side' }))
    expect(h.onMarkRecipes).toHaveBeenCalledWith(2)
  })

  it('the main Course offers Add Recipes', async () => {
    const s = courseSlot([main({ meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken', relaxed: true, why: [cool] }) }), side()])
    const h = setup(s, 1)
    await userEvent.click(h.dialog.getByRole('button', { name: 'Add Recipes' }))
    expect(h.onAddRecipes).toHaveBeenCalledTimes(1)
  })

  it('only a Variety Rule gave way: Review Variety Rules', async () => {
    const h = setup(relaxedSide([{ code: 'variety_relaxed', tag: 'fish', value: 3 }]), 2)
    expect(h.dialog.getByText('Few Recipes without fish fit here, so this breaks a Variety Rule.')).toBeInTheDocument()
    await userEvent.click(h.dialog.getByRole('button', { name: 'Review Variety Rules' }))
    expect(h.onReviewVarietyRules).toHaveBeenCalledTimes(1)
  })

  it('a strict pick has no such line', () => {
    const h = setup(courseSlot([main(), side()]), 2)
    expect(h.dialog.queryByText(/comes round sooner/)).not.toBeInTheDocument()
  })

  it('the relaxed chip is neutral: no warn or danger look', () => {
    setup(relaxedSide(), 2)
    expect(screen.getByText('Again soon: had Sun').closest('.chip')).not.toHaveAttribute('data-status')
  })
})
