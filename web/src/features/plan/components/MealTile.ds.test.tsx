// ds-plan: a Meal Slot on a day tile = the slot header, then a list of Course rows (PlanCourseRow). One structure for a slot
// with one Course and a slot with several; no compact (7-column) variant any more.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, favourite, meal, planCourse, slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { MealTile } from './MealTile'

const today = '2026-11-10'
const main = (over = {}) => planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main', { recipeName: "Sam's Manicotti" }), ...over })
const side = (over = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Two-colour cauliflower with peppers' }), ...over })

function setup(s: PlanSlot, day = today) {
  const h = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn() }
  const view = render(
    <MemoryRouter>
      <MealTile slot={s} today={day} {...h} />
    </MemoryRouter>,
  )
  return { h, root: view.container.querySelector('.plan-meal') as HTMLElement }
}

describe('MealTile structure', () => {
  it('is the slot header followed by a Courses list, header first', () => {
    const { root } = setup(courseSlot([main(), side()]))
    expect(root.firstElementChild).toHaveClass('plan-slot-head')
    const list = within(root).getByRole('list', { name: 'Dinner Courses' })
    expect(root.lastElementChild).toBe(list)
    expect(list.querySelectorAll(':scope > li.list-row')).toHaveLength(2)
  })

  it('several Courses: the rows carry the Main and Side labels in meta, and Swap and Pin per Course', async () => {
    const { h, root } = setup(courseSlot([main(), side()]))
    const rows = root.querySelectorAll('li.list-row')
    expect(rows[0]!.querySelector('.list-row__meta')).toHaveTextContent('Main')
    expect(rows[1]!.querySelector('.list-row__meta')).toHaveTextContent('Side')
    await userEvent.click(within(rows[1] as HTMLElement).getByRole('button', { name: 'Swap' }))
    expect(h.onSwap).toHaveBeenCalledWith({ date: today, mealSlotId: 2, courseId: 2 })
    await userEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Pin' }))
    expect(h.onPin).toHaveBeenCalledWith({ date: today, mealSlotId: 2, courseId: 1 })
  })

  it('one Course: the same structure, one row without a label; Swap and Pin sit on the row, not in the header', () => {
    const { root } = setup(slot({ date: today, meal: meal({ recipeName: 'Sam’s Rotisserie Chicken', why: [favourite('Mia', 'Fabio')] }) }))
    const rows = root.querySelectorAll('li.list-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.querySelector('.list-row__meta')).toBeNull()
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Swap' })).toBeInTheDocument()
    expect(within(root.querySelector('.plan-slot-head') as HTMLElement).queryByRole('button', { name: 'Swap' })).toBeNull()
  })

  it('the header Cook (today) starts Cook Mode for the slot', async () => {
    const { h } = setup(courseSlot([main(), side()]))
    await userEvent.click(within(document.querySelector('.plan-slot-head') as HTMLElement).getByRole('button', { name: 'Cook' }))
    expect(h.onCook).toHaveBeenCalledWith({ date: today, mealSlotId: 2 })
  })

  it('shows all the chips of a meal (the row clips them to one line), not just one', () => {
    const { root } = setup(slot({ date: today, meal: meal({ pinned: true, why: [favourite('Mia'), { code: 'slot_rule' }] }) }))
    expect(root.querySelectorAll('.plan-row__chips .chip').length).toBe(3)
  })

  it('an empty single slot is one dashed row with Choose a Recipe', async () => {
    const { h, root } = setup(slot({ date: today, meal: null, unfilled: { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 2, exclusion: 2, coolDown: 0, varietyRule: 0, advanceStep: 0 } } }))
    expect(root.querySelector('li.list-row')).toHaveAttribute('data-unfilled')
    await userEvent.click(screen.getByRole('button', { name: 'Choose a Recipe' }))
    expect(h.onChoose).toHaveBeenCalledOnce()
  })

  it('a Not served date is still its own compact row (no Courses list, no header actions)', () => {
    const s = slot({ date: today, notServed: true } as Partial<PlanSlot>)
    const h = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn() }
    const dateActions = { offline: false, onPlanAgain: vi.fn(), onWhosEating: vi.fn(), onTime: vi.fn(), onNotServed: vi.fn() }
    const view = render(<MemoryRouter><MealTile slot={s} today={today} {...h} dateActions={dateActions} /></MemoryRouter>)
    expect(view.container.querySelector('li.list-row')).toBeNull()
    expect(screen.getByRole('button', { name: /again/ })).toBeInTheDocument()
  })
})
