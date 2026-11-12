// CRS F review (spec 11): the Reheat and Cook buttons of the Today hero with several Courses.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import type { PlanCourse } from '../types'
import { TonightHero, type TonightHeroProps } from './TonightHero'

const upcoming = new Date('2026-11-10T17:00:00Z')
const late = new Date('2026-11-10T20:00:00Z')
const slotKey = { date: '2026-11-10', mealSlotId: 2 }
const source = { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' }
const main = (leftover: boolean): PlanCourse => planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken', servedFromLeftover: leftover ? source : null }) })
const side = (leftover: boolean): PlanCourse => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', servedFromLeftover: leftover ? source : null }) })
const dinner = (courses: PlanCourse[]) => courseSlot(courses, { name: 'Dinner', time: '19:00', at: '2026-11-10T19:00:00Z', cookMinutes: 30, startBy: '18:30' })

function setup(courses: PlanCourse[], over: Partial<TonightHeroProps> = {}) {
  const h = { onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn(), onReheat: vi.fn(), onMarkAllCooked: vi.fn() }
  render(
    <MemoryRouter>
      <TonightHero slot={dinner(courses)} now={upcoming} today="2026-11-10" {...h} {...over} />
    </MemoryRouter>,
  )
  return h
}

describe('Reheat on the Today hero with several Courses', () => {
  it('(a) before the slot time Reheat reports the hero Course (its courseId), not the course-less slot key', async () => {
    const h = setup([main(true), side(true)], { action: 'reheat' })
    await userEvent.click(screen.getByRole('button', { name: 'Reheat' }))
    expect(h.onReheat).toHaveBeenCalledTimes(1)
    expect(h.onReheat).toHaveBeenCalledWith({ ...slotKey, courseId: 1 })
  })

  it('(a) after the slot time, with one Course left to cook, it reports that Course too', async () => {
    const cookedSide = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { state: 'cooked' }) })
    const h = setup([main(true), cookedSide], { action: 'reheat', now: late })
    await userEvent.click(screen.getByRole('button', { name: 'Reheat' }))
    expect(h.onReheat).toHaveBeenCalledWith({ ...slotKey, courseId: 1 })
  })

  it('(b) a Leftover Main and a fresh Side: one Cook button for the slot (the timeline), no Reheat', async () => {
    const h = setup([main(true), side(false)], { action: 'cook' })
    expect(screen.queryByRole('button', { name: 'Reheat' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cook · 30 min' }))
    expect(h.onCook).toHaveBeenCalledWith(slotKey)
    expect(h.onReheat).not.toHaveBeenCalled()
  })

  it('(c) every Course a Leftover: Reheat, and no Cook button', () => {
    setup([main(true), side(true)], { action: 'reheat' })
    expect(screen.getByRole('button', { name: 'Reheat' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
  })
})
