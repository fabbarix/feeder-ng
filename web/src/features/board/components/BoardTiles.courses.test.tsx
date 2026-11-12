// CRS F (spec 7.5): the Tonight tile lists the slot's Courses as rows (main first in size); Tomorrow writes one line per slot.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CourseLike, NextAdvance, SlotLike } from '../types'
import { NextAdvanceTile, TomorrowTile, TonightTile } from './BoardTiles'

const meal = (recipeName: string, state: 'planned' | 'cooked' | 'skipped' = 'planned', wholeMeal = false) => ({ recipeId: 1, recipeName, batches: 1, portions: 4, state, wholeMeal })
const course = (courseId: number, name: string, main: boolean, over: Partial<CourseLike> = {}): CourseLike => ({ courseId, name, main, meal: null, ...over })
const slotOf = (courses: CourseLike[] | undefined, over: Partial<SlotLike> = {}): SlotLike => ({
  date: '2026-11-09', mealSlotId: 2, name: 'Dinner', time: '19:00', at: '2026-11-09T19:00:00Z', meal: courses?.find((c) => c.main)?.meal ?? null, courses, ...over,
})
const several = () => slotOf([course(1, 'Main', true, { meal: meal('Roast chicken') }), course(2, 'Side', false, { meal: meal('Green beans') }), course(3, 'Dessert', false, { unserved: 'optional' })])

describe('TonightTile with Courses', () => {
  it('one Course in `courses` renders the same markup as a slot without `courses` (regression guard)', () => {
    const plain = render(<TonightTile slot={slotOf(undefined, { meal: meal('Chicken stew') })} onCook={() => {}} />)
    const old = plain.container.innerHTML
    plain.unmount()
    const withCourse = render(<TonightTile slot={slotOf([course(1, 'Main', true, { meal: meal('Chicken stew') })])} onCook={() => {}} />)
    expect(withCourse.container.innerHTML).toBe(old)
  })

  it('lists a row per Course with a Planned Meal in the slot order; no row for an empty optional Course', () => {
    render(<TonightTile slot={several()} onCook={() => {}} />)
    const list = screen.getByRole('list', { name: 'Tonight\'s Courses' })
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Roast chicken'), expect.stringContaining('Green beans')]))
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).queryByText(/Dessert/)).not.toBeInTheDocument()
  })

  it('the main Course\'s row is the larger one (data-main) and comes first when it is first in the slot', () => {
    render(<TonightTile slot={several()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveAttribute('data-main', 'true')
    expect(rows[1]).not.toHaveAttribute('data-main')
  })

  it('names the Meal Slot and its time once, and keeps ONE big Cook button', async () => {
    const onCook = vi.fn()
    render(<TonightTile slot={several()} onCook={onCook} />)
    expect(screen.getAllByText('Dinner · 19:00')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Cook' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
    expect(onCook).toHaveBeenCalledTimes(1)
  })

  it('shows no chips on the board (relaxed picks included)', () => {
    const relaxed = slotOf([course(1, 'Main', true, { meal: { ...meal('Roast chicken'), relaxed: true } })])
    const { container } = render(<TonightTile slot={relaxed} />)
    expect(container.querySelector('.chip')).toBeNull()
  })
})

describe('TomorrowTile with Courses', () => {
  const at = (s: SlotLike): SlotLike => ({ ...s, date: '2026-11-10', at: '2026-11-10T19:00:00Z' })

  it('writes each slot as "Dinner: Roast chicken + Green beans"', () => {
    render(<TomorrowTile slots={[at(several())]} />)
    expect(screen.getByText('Dinner: Roast chicken + Green beans')).toBeInTheDocument()
  })

  it('a one-Course slot reads as before: "Dinner · Chicken stew"', () => {
    render(<TomorrowTile slots={[at(slotOf([course(1, 'Main', true, { meal: meal('Chicken stew') })]))]} />)
    expect(screen.getByText('Dinner · Chicken stew')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledWith('meal:2026-11-09/2/2', 1)
  })
})

describe('TonightTile: a Cooked Course stays in the list, marked so the board can mute it', () => {
  it('data-state is the Planned Meal\'s state on each row (cooked rows are muted by board.css)', () => {
    const cooked = slotOf([course(1, 'Main', true, { meal: meal('Roast chicken', 'cooked') }), course(2, 'Side', false, { meal: meal('Green beans') })])
    render(<TonightTile slot={cooked} onCook={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveAttribute('data-state', 'cooked')
    expect(rows[1]).toHaveAttribute('data-state', 'planned')
  })
})
