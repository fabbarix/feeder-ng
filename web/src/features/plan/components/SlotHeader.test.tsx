// ds-plan: the Meal Slot header row. The icon and the FULL name (never truncated, the old "Brea…"); the slot's actions
// (Cook, ⋮) are grouped at the end of the same row, in that order.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { SlotHeader } from './SlotHeader'

const today = '2026-11-10'
const several = (over: Partial<PlanSlot> = {}) =>
  courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main') }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })], { date: today, ...over })

function setup(s: PlanSlot = several()) {
  const h = { onCook: vi.fn(), onMarkAllCooked: vi.fn(), onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() }
  const view = render(
    <MemoryRouter>
      <SlotHeader slot={s} today={today} {...h} />
    </MemoryRouter>,
  )
  return { h, head: view.container.querySelector('.plan-slot-head') as HTMLElement }
}

describe('SlotHeader', () => {
  it('shows the slot icon, the full name and the time', () => {
    const { head } = setup(several({ name: 'Breakfast and a long brunch', time: '09:00' }))
    expect(head.querySelector('.plan-slot-head__label svg')).not.toBeNull()
    expect(head.querySelector('.plan-slot-head__name')).toHaveTextContent('Breakfast and a long brunch')
    expect(head.querySelector('.plan-slot-head__time')).toHaveTextContent('09:00')
  })

  it('a date with its own time reads "20:15 · usually 19:30" (B5-F1)', () => {
    const { head } = setup(several({ time: '20:15', usualTime: '19:30' }))
    expect(head.querySelector('.plan-slot-head__time')).toHaveTextContent('20:15 · usually 19:30')
  })

  it('groups Cook and ⋮ in one .plan-slot-head__actions, the last child of the row, Cook first', () => {
    const { head } = setup()
    const actions = head.querySelector('.plan-slot-head__actions') as HTMLElement
    expect(head.lastElementChild).toBe(actions)
    expect(within(actions).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Cook', 'Dinner actions'])
  })

  it('Cook starts Cook Mode for the slot', async () => {
    const { h } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
    expect(h.onCook).toHaveBeenCalledWith({ date: today, mealSlotId: 2 })
  })

  it('a slot that is not for today has no Cook', () => {
    const { head } = setup(several({ date: '2026-11-12' }))
    expect(within(head).queryByRole('button', { name: 'Cook' })).toBeNull()
  })

  it('a slot with no actions has no actions group at all (no empty box at the end)', () => {
    const { head } = setup(slot({ date: '2026-11-12', meal: meal({ date: '2026-11-12' }) }))
    expect(head.querySelector('.plan-slot-head__actions')).toBeNull()
  })

  it('has no Swap and no Pin: those belong to the Course rows', () => {
    const { head } = setup()
    expect(within(head).queryByRole('button', { name: 'Swap' })).toBeNull()
    expect(within(head).queryByRole('button', { name: 'Pin' })).toBeNull()
  })

  it('round 2: the ⋮ is the same size and treatment as Cook, Swap and Pin: every button of the group is a compact icon button', () => {
    const { head } = setup()
    const buttons = within(head.querySelector('.plan-slot-head__actions') as HTMLElement).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    for (const b of buttons) {
      expect(b).toHaveClass('icon-button')
      expect(b).toHaveAttribute('data-size', 'compact')
    }
  })
})
