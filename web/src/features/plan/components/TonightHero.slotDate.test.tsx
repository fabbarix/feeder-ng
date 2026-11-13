// B5-F1 (ADR 0014): Today's Tonight hero has the per-date choices, a one-Course slot included.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { PlanSlot, SlotDateActions } from '../types'
import { TonightHero } from './TonightHero'

const upcoming = new Date('2026-11-10T17:00:00Z')
const dateActions: SlotDateActions = { offline: false, onWhosEating: vi.fn(), onNotServed: vi.fn(), onTime: vi.fn(), onPlanAgain: vi.fn() }

function setup(s: PlanSlot, over: Partial<SlotDateActions> = {}) {
  const date = { ...dateActions, ...over }
  render(
    <MemoryRouter>
      <TonightHero slot={s} now={upcoming} today="2026-11-10" onCook={() => {}} onYesCooked={() => {}} onAdjust={() => {}} dateActions={date} />
    </MemoryRouter>,
  )
  return date
}

describe('TonightHero: the per-date menu', () => {
  it('a one-Course hero has the slot menu with Who\'s eating, Time today and Not served', async () => {
    setup(slot({ date: '2026-11-10', meal: meal({ recipeName: 'Chicken curry' }) }))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(["Who's eating", 'Time today', 'Not served'])
  })

  it('picking Time today calls the handler with the slot', async () => {
    const date = setup(slot({ date: '2026-11-10', mealSlotId: 2, meal: meal() }))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Time today' }))
    expect(date.onTime).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 })
  })

  it('a multi-Course hero has it with no separate `menu` prop', async () => {
    const a = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main') })
    const b = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })
    setup(courseSlot([a, b], { date: '2026-11-10' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(expect.arrayContaining(["Who's eating", 'Time today', 'Not served']))
  })

  it('the hero overline and start use the date\'s time', () => {
    setup(slot({ date: '2026-11-10', time: '20:15', usualTime: '19:30', at: '2026-11-10T20:15:00Z', meal: meal({ startBy: '19:55' }) }))
    // DS-TODAY (changed on purpose): the eyebrow carries the start-by of the date's time: "Today · Dinner · start 19:55".
    expect(document.querySelector('.plan-hero .tile__overline')!.textContent).toBe('Today · Dinner · start 19:55')
    expect(screen.getByText('start 19:55')).toBeInTheDocument()
  })
})
