// B5-BOW: the Bought chip, the "Bought for it" line and the hard-rule warn line in the Planned Meal sheet.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, favourite, meal, planCourse, slot } from '../test-utils'
import type { BoughtInfo, MealWarning } from '../lib/bought'
import type { PlanSlot } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

const bought: BoughtInfo = { ingredients: [{ id: 40, name: 'garlic' }, { id: 41, name: 'cream' }] }

function open(s: PlanSlot, courseId = 1) {
  render(<PlannedMealSheet open slot={s} courseId={courseId} today="2026-11-10" onClose={vi.fn()} onCook={vi.fn()} onMarkCooked={vi.fn()} onSwap={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()} onChoose={vi.fn()} />)
  return within(screen.getByRole('dialog'))
}

describe('PlannedMealSheet: Bought', () => {
  it('shows the Bought chip and the line naming what was bought', () => {
    const d = open(slot({ meal: meal({ bought }) }))
    expect(d.getByText('Bought')).toBeInTheDocument()
    expect(d.getByText('Bought for it: garlic, cream. Automatic plan changes leave it as it is.')).toBeInTheDocument()
  })
  it('Pinned and Bought show both chips', () => {
    const d = open(slot({ meal: meal({ bought, pinned: true, why: [favourite('Anna')] }) }))
    expect(d.getByText('Pinned')).toBeInTheDocument()
    expect(d.getByText('Bought')).toBeInTheDocument()
  })
  it('shows neither chip nor line when not Bought', () => {
    const d = open(slot({ meal: meal({ bought: null }) }))
    expect(d.queryByText('Bought')).not.toBeInTheDocument()
    expect(d.queryByText(/Bought for it/)).not.toBeInTheDocument()
  })
  it('an empty Ingredient list is not Bought', () => {
    const d = open(slot({ meal: meal({ bought: { ingredients: [] } }) }))
    expect(d.queryByText('Bought')).not.toBeInTheDocument()
    expect(d.queryByText(/Bought for it/)).not.toBeInTheDocument()
  })
  it('a Cooked meal (no records) shows no Bought line', () => {
    expect(open(slot({ meal: meal({ state: 'cooked' }) })).queryByText(/Bought for it/)).not.toBeInTheDocument()
  })
})

describe('PlannedMealSheet: the warn line (read from the slot view meal)', () => {
  const withWarning = (warning: MealWarning | null, over = {}, attendance = [{ id: 2, name: 'Sam' }]) =>
    open(slot({ attendance, meal: meal({ warning, ...over }) } as Partial<PlanSlot> & { meal: ReturnType<typeof meal> }))

  it('excluded names the Member (Attendance) and the Ingredient (from the Bought list)', () => {
    const d = withWarning({ code: 'excluded', memberId: 2, ingredientId: 40 }, { bought })
    expect(d.getByRole('note')).toHaveTextContent('Sam now excludes garlic, which this uses. Swap it to change it.')
  })
  it('excluded with an Ingredient it cannot name reads "an Ingredient"; a Member it cannot name reads "A Member"', () => {
    expect(withWarning({ code: 'excluded', memberId: 2, ingredientId: 99 }, { pinned: true }).getByRole('note')).toHaveTextContent(
      'Sam now excludes an Ingredient, which this uses. Swap it to change it.',
    )
  })
  it('excluded without an Ingredient says the Member excludes the Recipe', () => {
    expect(withWarning({ code: 'excluded', memberId: 2 }, { pinned: true }).getByRole('note')).toHaveTextContent('Sam now excludes this Recipe. Swap it to change it.')
  })
  it('archived', () => {
    expect(withWarning({ code: 'archived' }, { pinned: true }).getByRole('note')).toHaveTextContent('This Recipe is archived. Swap it to change it.')
  })
  it('course_lost names the Course of the sheet', () => {
    const side = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { pinned: true, warning: { code: 'course_lost' } }) })
    const d = open(courseSlot([planCourse({ meal: courseMeal(1, 'Main') }), side]), 2)
    expect(d.getByRole('note')).toHaveTextContent('This Recipe is no longer a Side Recipe. Swap it to change it.')
  })
  it('shows no warn line without a warning (null)', () => {
    expect(withWarning(null).queryByRole('note')).not.toBeInTheDocument()
  })
  it('shows no warn line without a warning (absent)', () => {
    expect(open(slot()).queryByRole('note')).not.toBeInTheDocument()
  })
})
