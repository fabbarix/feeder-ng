// CRS F (spec 7.5): a day tile's slot with several Courses is one block: the slot once, then a row per Course.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { PlanCourse, PlanSlot } from '../types'
import { MealTile } from './MealTile'

const main = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken' }), ...over })
const side = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8 }), ...over })
const dessert = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional', ...over })

function setup(s: PlanSlot, today = '2026-11-10') {
  const handlers = { onOpen: vi.fn(), onSwap: vi.fn(), onChoose: vi.fn(), onCook: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onMarkAllCooked: vi.fn(), onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() }
  const view = render(<MealTile slot={s} today={today} {...handlers} />)
  return { ...handlers, container: view.container }
}
// ds-plan: a Course row is a ListRow (an <li> without its own aria-label): found by the Course label in its meta line.
const rowOf = (name: string) =>
  screen.getAllByRole('listitem').find((li) => li.querySelector('.list-row__meta')?.textContent?.startsWith(name)) as HTMLElement

describe('one Course looks exactly as before (regression guards)', () => {
  it('a slot with a single Course in `courses` renders the same markup as a slot without', () => {
    const m = meal({ recipeName: 'Chicken curry', why: [{ code: 'favourite', members: ['Anna'] }] })
    const before = render(<MealTile slot={slot({ meal: m })} today="2026-11-10" onOpen={() => {}} onSwap={() => {}} onChoose={() => {}} onCook={() => {}} />)
    const old = before.container.innerHTML
    before.unmount()
    const after = render(
      <MealTile slot={courseSlot([planCourse({ courseId: 1, name: 'Main', meal: m })])} today="2026-11-10" onOpen={() => {}} onSwap={() => {}} onChoose={() => {}} onCook={() => {}} />,
    )
    expect(after.container.innerHTML).toBe(old)
  })

  it('a slot whose other Courses are covered, optional-and-empty or not served shows no caption and no menu', () => {
    setup(courseSlot([main(), side({ meal: null, coveredBy: { courseId: 1, recipeId: 7, recipeName: 'Lasagne' } })]))
    expect(screen.queryByText('Main')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dinner actions' })).not.toBeInTheDocument()
  })
})

describe('several Courses: one slot block', () => {
  const twoCourses = () => courseSlot([main(), side()])

  it('names the slot once and lists a row per Course in the slot order, each with its caption', () => {
    setup(twoCourses())
    expect(screen.getAllByText('Dinner')).toHaveLength(1)
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('.list-row__meta')?.textContent)).toEqual(['Main', 'Side'])
    expect(within(rowOf('Main')).getByRole('button', { name: /Roast chicken/ })).toBeInTheDocument()
    expect(within(rowOf('Side')).getByRole('button', { name: /Green beans/ })).toBeInTheDocument()
  })

  it('the list is named after the slot', () => {
    setup(twoCourses())
    expect(screen.getByRole('list', { name: 'Dinner Courses' })).toBeInTheDocument()
  })

  it('has Cook ONCE, on the slot head, and it reports the slot (the cooking timeline), not a Course', async () => {
    const h = setup(twoCourses())
    const cooks = screen.getAllByRole('button', { name: 'Cook' })
    expect(cooks).toHaveLength(1)
    await userEvent.click(cooks[0]!)
    expect(h.onCook).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 })
  })

  it('Swap is per Course and reports that Course', async () => {
    const h = setup(twoCourses())
    await userEvent.click(within(rowOf('Side')).getByRole('button', { name: 'Swap' }))
    expect(h.onSwap).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2, courseId: 2 })
  })

  it('tapping a Recipe name opens that Course\'s sheet', async () => {
    const h = setup(twoCourses())
    await userEvent.click(within(rowOf('Main')).getByRole('button', { name: /Roast chicken/ }))
    expect(h.onOpen).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2, courseId: 1 })
  })

  it('a Course nobody eats shows no row; one a Member opts out of says "Side · without Sam"', () => {
    setup(courseSlot([main(), side({ optOutMemberIds: [4] }), dessert({ unserved: 'no_course_attendance' })], { attendance: [{ id: 4, name: 'Sam' }] }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Side · without Sam')).toBeInTheDocument()
  })

  it('an unfilled Course is its own dashed Not planned block, the rest unaffected', async () => {
    const unfilled = { reason: 'no_course_recipes' as const, slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } }
    const h = setup(courseSlot([main(), side({ meal: null, unfilled })]))
    const item = rowOf('Side')
    expect(item).toHaveAttribute('data-unfilled')
    await userEvent.click(within(item).getByRole('button', { name: 'Choose a Recipe' }))
    expect(h.onChoose).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2, courseId: 2 })
  })

  it('a covered slot shows the main row with the Whole meal chip', () => {
    const whole = main({ meal: courseMeal(1, 'Main', { recipeName: 'Lasagne', wholeMeal: true }) })
    setup(courseSlot([whole, side({ meal: null, coveredBy: { courseId: 1, recipeId: 7, recipeName: 'Lasagne' } })]))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Whole meal')).toBeInTheDocument()
  })

  it('a relaxed Side with nothing else to say shows "Again soon: had Sun"', () => {
    setup(courseSlot([main(), side({ meal: courseMeal(2, 'Side', { relaxed: true, why: [{ code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 8 }] }) })]))
    expect(within(rowOf('Side')).getByText('Again soon: had Sun')).toBeInTheDocument()
  })
})

describe('the slot menu', () => {
  it('Add <Course> for an empty optional Course, reporting the empty Course', async () => {
    const h = setup(courseSlot([main(), dessert()]))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add Dessert' }))
    expect(h.onAddCourse).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2, courseId: 3 })
  })

  it('Not cooked: whole slot and Mark all Cooked report the slot', async () => {
    const h = setup(courseSlot([main(), side()]))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not cooked: whole slot' }))
    expect(h.onNotCookedSlot).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark all Cooked' }))
    expect(h.onMarkAllCooked).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2 })
  })

  it('no menu on a one-Course slot', () => {
    setup(slot())
    expect(screen.queryByRole('button', { name: /actions/ })).not.toBeInTheDocument()
  })
})
