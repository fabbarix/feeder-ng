// CRS F (spec 7.5): on Today the Tonight tile is the slot block: the main Course takes the hero, the others are compact rows.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { PlanCourse, PlanSlot } from '../types'
import { TonightHero, type TonightHeroProps } from './TonightHero'

const upcoming = new Date('2026-11-10T17:00:00Z')
const late = new Date('2026-11-10T20:00:00Z')
const slotKey = { date: '2026-11-10', mealSlotId: 2 }
const main = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken', photoUrl: '/api/images/5' }), ...over })
const side = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans' }), ...over })
const dessert = () => planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' })
const dinner = (courses: PlanCourse[], over: Partial<PlanSlot> = {}) => courseSlot(courses, { name: 'Dinner', time: '19:00', at: '2026-11-10T19:00:00Z', cookMinutes: 30, startBy: '18:30', ...over })

function setup(s: PlanSlot, over: Partial<TonightHeroProps> = {}) {
  const h = {
    onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn(), onMarkAllCooked: vi.fn(),
    rowHandlers: { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn(), onChoose: vi.fn() },
    menu: { onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() },
  }
  const view = render(
    <MemoryRouter>
      <TonightHero slot={s} now={upcoming} today="2026-11-10" {...h} {...over} />
    </MemoryRouter>,
  )
  return { ...h, container: view.container }
}

describe('one Course looks exactly as before (regression guard)', () => {
  it('a single Course in `courses` renders the same markup as a slot without `courses`', () => {
    const m = meal({ recipeName: 'Chicken & leek pie', cookMinutes: 45, startBy: '18:45', why: [{ code: 'favourite', members: ['Anna'] }] })
    const props = { now: upcoming, onCook: () => {}, onYesCooked: () => {}, onAdjust: () => {} }
    const before = render(<TonightHero slot={slot({ meal: m })} {...props} />)
    const old = before.container.innerHTML
    before.unmount()
    const after = render(<TonightHero slot={courseSlot([planCourse({ courseId: 1, meal: m })])} {...props} today="2026-11-10" />)
    expect(after.container.innerHTML).toBe(old)
  })
})

describe('TonightHero with several Courses', () => {
  it('the main Course is the hero heading; the other Courses are compact rows under it, with captions', () => {
    setup(dinner([main(), side()]))
    expect(screen.getByRole('heading', { name: 'Roast chicken' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Green beans' })).not.toBeInTheDocument()
    const row = screen.getByRole('listitem', { name: 'Side' })
    expect(row).toHaveAttribute('data-compact', 'true')
    expect(within(row).getByRole('button', { name: /Green beans/ })).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('"start 18:30" and "Cook · 30 min" are the timeline\'s; Cook is one button for the slot', async () => {
    const h = setup(dinner([main(), side()]))
    expect(screen.getByText('start 18:30')).toBeInTheDocument()
    const cook = screen.getByRole('button', { name: 'Cook · 30 min' })
    expect(screen.getAllByRole('button', { name: /^Cook/ })).toHaveLength(1)
    await userEvent.click(cook)
    expect(h.onCook).toHaveBeenCalledWith(slotKey)
  })

  // DS-TODAY (changed on purpose): Mark as Cooked moved into the row's ⋮ (More for Side); Swap, Pin, ⋮ are one icon group.
  it('the compact rows carry Swap, Pin and (in the ⋮) Mark as Cooked for that Course', async () => {
    const h = setup(dinner([main(), side()]))
    const row = screen.getByRole('listitem', { name: 'Side' })
    const course = { ...slotKey, courseId: 2 }
    await userEvent.click(within(row).getByRole('button', { name: 'Swap' }))
    await userEvent.click(within(row).getByRole('button', { name: 'Pin' }))
    await userEvent.click(within(row).getByRole('button', { name: 'More for Side' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as Cooked' }))
    await userEvent.click(within(row).getByRole('button', { name: /Green beans/ }))
    expect(h.rowHandlers.onSwap).toHaveBeenCalledWith(course)
    expect(h.rowHandlers.onPin).toHaveBeenCalledWith(course)
    expect(h.rowHandlers.onMarkCooked).toHaveBeenCalledWith(course)
    expect(h.rowHandlers.onOpen).toHaveBeenCalledWith(course)
  })

  it('a covered slot is the hero alone, with the Whole meal chip and no rows', () => {
    const whole = main({ meal: courseMeal(1, 'Main', { recipeName: 'Lasagne', wholeMeal: true }) })
    setup(dinner([whole, side({ meal: null, coveredBy: { courseId: 1, recipeId: 7, recipeName: 'Lasagne' } })]))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('Whole meal')).toBeInTheDocument()
  })

  it('the hero shows a relaxed chip after the positive ones', () => {
    const relaxed = courseMeal(1, 'Main', { recipeName: 'Roast chicken', relaxed: true, why: [{ code: 'cooldown_relaxed', date: '2026-11-08', recipeId: 7 }, { code: 'favourite', members: ['Anna'] }] })
    const { container } = setup(dinner([main({ meal: relaxed }), side()]))
    const chips = [...container.querySelectorAll('.plan-hero__chips .chip')].map((c) => c.textContent)
    expect(chips).toEqual(["Anna's favourite", 'Again soon: had Sun'])
  })

  it('the slot menu holds Not cooked: whole slot and Add <Course>', async () => {
    const h = setup(dinner([main(), side(), dessert()]))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add Dessert' }))
    expect(h.menu.onAddCourse).toHaveBeenCalledWith({ ...slotKey, courseId: 3 })
  })
})

describe('after the slot time', () => {
  it('several Courses to cook: "Dinner cooked?" with one primary Mark all Cooked, no Yes, Cooked and no Adjust', async () => {
    const h = setup(dinner([main(), side()]), { now: late })
    expect(screen.getByRole('heading', { name: 'Dinner cooked?' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yes, Cooked' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adjust' })).not.toBeInTheDocument()
    const all = screen.getByRole('button', { name: 'Mark all Cooked' })
    expect(all).toHaveAttribute('data-variant', 'primary')
    await userEvent.click(all)
    expect(h.onMarkAllCooked).toHaveBeenCalledWith(slotKey)
  })

  it('only one Course left to cook: it is the hero, and Yes, Cooked and Adjust report that Course', async () => {
    const h = setup(dinner([main({ meal: courseMeal(1, 'Main', { state: 'cooked' }) }), side()]), { now: late })
    expect(screen.getByRole('heading', { name: 'Green beans cooked?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Yes, Cooked' }))
    expect(h.onYesCooked).toHaveBeenCalledWith({ ...slotKey, courseId: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(h.onAdjust).toHaveBeenCalledWith({ ...slotKey, courseId: 2 })
  })
})
