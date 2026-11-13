// B5-F1 (ADR 0014, beta5-plan 2.1): the slot menu holds Who's eating, Time today and Not served for ANY slot.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'
import type { PlanSlot, SlotDateActions } from '../types'
import { SlotMenu } from './SlotMenu'

const TODAY = '2026-11-10'
const key = { date: TODAY, mealSlotId: 2 }

function setup(s: PlanSlot, over: Partial<SlotDateActions> | null = {}, today = TODAY) {
  const date = over === null ? undefined : { offline: false, onWhosEating: vi.fn(), onNotServed: vi.fn(), onTime: vi.fn(), onPlanAgain: vi.fn(), ...over }
  const h = { onMarkAllCooked: vi.fn(), onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() }
  const view = render(
    <MemoryRouter>
      <SlotMenu slot={s} today={today} dateActions={date} {...h} />
    </MemoryRouter>,
  )
  return { date: date!, ...h, container: view.container }
}
const items = () => screen.getAllByRole('menuitem').map((i) => i.textContent)
const open = async () => userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))

describe('SlotMenu: the per-date choices', () => {
  it('a one-Course slot today has a menu: Who\'s eating, Time today, Not served', async () => {
    setup(slot({ date: TODAY }))
    await open()
    expect(items()).toEqual(["Who's eating", 'Time today', 'Not served'])
  })

  it('another date says Time on <weekday>', async () => {
    setup(slot({ date: '2026-11-12' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(items()).toEqual(["Who's eating", 'Time on Thu', 'Not served'])
  })

  it('each choice calls its handler with the slot', async () => {
    const h = setup(slot({ date: TODAY }))
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: "Who's eating" }))
    expect(h.date.onWhosEating).toHaveBeenCalledWith(key)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Time today' }))
    expect(h.date.onTime).toHaveBeenCalledWith(key)
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not served' }))
    expect(h.date.onNotServed).toHaveBeenCalledWith(key)
  })

  it('a multi-Course slot keeps its own entries first, then the three', async () => {
    const main = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main') })
    const side = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })
    const dessert = planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' })
    setup(courseSlot([main, side, dessert], { date: TODAY }))
    await open()
    expect(items()).toEqual(['Mark all Cooked', 'Not cooked: whole slot', 'Add Dessert', "Who's eating", 'Time today', 'Not served'])
  })

  it('U2: once a Course is Cooked there is no Not served', async () => {
    const cooked = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main', { state: 'cooked' }) })
    const side = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })
    setup(courseSlot([cooked, side], { date: TODAY }))
    await open()
    expect(items()).toEqual(["Who's eating", 'Time today'])
  })

  it('a past slot, and a Not served slot, have no menu', () => {
    const past = setup(slot({ date: '2026-11-09' }))
    expect(past.container).toBeEmptyDOMElement()
    const served = setup(slot({ date: '2026-11-12', notServed: true }))
    expect(served.container).toBeEmptyDOMElement()
  })

  it('without the per-date handlers a one-Course slot still has no menu (as before)', () => {
    const { container } = setup(slot({ date: TODAY }), null)
    expect(container).toBeEmptyDOMElement()
  })

  it('offline the three choices are unavailable and say why; picking one does nothing', async () => {
    const h = setup(slot({ date: TODAY }), { offline: true })
    await open()
    expect(items()).toEqual(["Who's eating · Needs a connection", 'Time today · Needs a connection', 'Not served · Needs a connection'])
    for (const item of screen.getAllByRole('menuitem')) expect(item).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: /Not served/ }))
    expect(h.date.onNotServed).not.toHaveBeenCalled()
  })
})
