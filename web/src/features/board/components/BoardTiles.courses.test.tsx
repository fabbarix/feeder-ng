// CRS F (spec 7.5): Tomorrow writes one line per slot. (The hero's Courses moved to BoardHeroTile.test.tsx, B9-47.)
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CourseLike, NextAdvance, SlotLike } from '../types'
import { NextAdvanceTile, TomorrowTile } from './BoardTiles'

const meal = (recipeName: string, state: 'planned' | 'cooked' | 'skipped' = 'planned', wholeMeal = false) => ({ recipeId: 1, recipeName, batches: 1, portions: 4, state, wholeMeal })
const course = (courseId: number, name: string, main: boolean, over: Partial<CourseLike> = {}): CourseLike => ({ courseId, name, main, meal: null, ...over })
const slotOf = (courses: CourseLike[] | undefined, over: Partial<SlotLike> = {}): SlotLike => ({
  date: '2026-11-09', mealSlotId: 2, name: 'Dinner', time: '19:00', at: '2026-11-09T19:00:00Z', courses, ...over,
})
const several = () => slotOf([course(1, 'Main', true, { meal: meal('Roast chicken') }), course(2, 'Side', false, { meal: meal('Green beans') }), course(3, 'Dessert', false, { unserved: 'optional' })])

describe('TomorrowTile with Courses', () => {
  const at = (s: SlotLike): SlotLike => ({ ...s, date: '2026-11-10', at: '2026-11-10T19:00:00Z' })

  it('writes each slot as "Dinner: Roast chicken + Green beans"', () => {
    const { container } = render(<TomorrowTile slots={[at(several())]} />)
    expect(container.querySelector('li')?.textContent).toBe('Dinner: Roast chicken + Green beans')
  })

  it('a one-Course slot is the same format (B9-47, TB-08): "Dinner: Chicken stew"', () => {
    const { container } = render(<TomorrowTile slots={[at(slotOf([course(1, 'Main', true, { meal: meal('Chicken stew') })]))]} />)
    expect(container.querySelector('li')?.textContent).toBe('Dinner: Chicken stew')
  })
})

describe('NextAdvanceTile for a Course', () => {
  const next: NextAdvance = {
    scope: 'meal:2026-11-09/2/2', recipeName: 'Green beans', step: 1, text: 'Soak the beans', leadTimeMinutes: 480, dueAt: '2026-11-09T21:00:00Z', overdue: false,
    mealDate: '2026-11-09', mealSlotId: 2, slotName: 'Dinner', courseId: 2, courseName: 'Side',
  }

  it('Done marks the Step in the Advance Step\'s own Course scope, exactly as the server sent it', async () => {
    const onDone = vi.fn()
    render(<NextAdvanceTile next={next} nowMs={Date.parse('2026-11-09T18:00:00Z')} onDone={onDone} />)
    await userEvent.click(screen.getByRole('button', { name: 'Done: Soak the beans' })) // B9-47 (TB-07): Done is named "Done: <Step text>"
    expect(onDone).toHaveBeenCalledWith('meal:2026-11-09/2/2', 1)
  })
})
