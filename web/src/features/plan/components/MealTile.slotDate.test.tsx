// B5-F1 (ADR 0014): a day tile's slot with its own time, Not served, Guests, and the per-date menu.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'
import type { PlanSlot, SlotDateActions } from '../types'
import { MealTile } from './MealTile'

const dateActions = (over: Partial<SlotDateActions> = {}): SlotDateActions => ({ offline: false, onWhosEating: vi.fn(), onNotServed: vi.fn(), onTime: vi.fn(), onPlanAgain: vi.fn(), ...over })

function setup(s: PlanSlot, over: { dateActions?: SlotDateActions } = {}) {
  const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn() }
  render(
    <MemoryRouter>
      <MealTile slot={s} today="2026-11-10" {...handlers} {...over} />
    </MemoryRouter>,
  )
  return handlers
}

describe('MealTile: a Not served slot', () => {
  const main = planCourse({ courseId: 1, name: 'Main', unserved: 'not_served' })
  const side = planCourse({ courseId: 2, name: 'Side', main: false, unserved: 'not_served' })
  const notServed = courseSlot([main, side], { date: '2026-11-12', mealSlotId: 4, notServed: true })

  it('is one compact row: "Dinner · Not served" and Plan Dinner again; no Course rows, no Couldn\'t plan', async () => {
    const date = dateActions()
    setup(notServed, { dateActions: date })
    expect(screen.getByText('Dinner · Not served')).toBeInTheDocument()
    expect(screen.queryByText('Main')).not.toBeInTheDocument()
    expect(screen.queryByText("Couldn't plan")).not.toBeInTheDocument()
    expect(screen.queryByText('Not planned')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Plan Dinner again' }))
    expect(date.onPlanAgain).toHaveBeenCalledWith({ date: '2026-11-12', mealSlotId: 4 })
  })
})

describe('MealTile: the date\'s own time', () => {
  it('shows "20:15 · usually 19:30" on a date with its own time', () => {
    setup(slot({ date: '2026-11-12', time: '20:15', usualTime: '19:30' }), { dateActions: dateActions() })
    expect(screen.getByText('20:15 · usually 19:30')).toBeInTheDocument()
  })

  it('shows no caption on the usual time', () => {
    setup(slot({ date: '2026-11-12', time: '19:30', usualTime: '19:30' }), { dateActions: dateActions() })
    expect(screen.queryByText(/usually/)).not.toBeInTheDocument()
  })
})

describe('MealTile: the slot menu', () => {
  it('a one-Course tile has the menu with the per-date choices', async () => {
    const date = dateActions()
    setup(slot({ date: '2026-11-12' }), { dateActions: date })
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(["Who's eating", 'Time on Thu', 'Not served'])
  })

  it('a multi-Course tile has it too', async () => {
    const a = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main') })
    const b = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })
    setup(courseSlot([a, b], { date: '2026-11-12' }), { dateActions: dateActions() })
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toContain("Who's eating")
  })

  it('without the per-date handlers the tile is as before', () => {
    setup(slot({ date: '2026-11-12' }))
    expect(screen.queryByRole('button', { name: 'Dinner actions' })).not.toBeInTheDocument()
  })
})
