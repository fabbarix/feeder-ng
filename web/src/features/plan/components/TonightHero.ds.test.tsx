// DS-TODAY (docs/design/system.md §2, §5, §6; mockups after/today-A-*.png): the Today hero.
//   photo | eyebrow "Tomorrow · Dinner · start 19:09" + title + why chips on ONE line   [⋮]
//   ----------------------------------------------------------------------------------
//   Side  Two-colour cauliflower with peppers  [Leftover from Thu]                 [⇆] [📌] [⋮]
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, favourite, meal, planCourse } from '../test-utils'
import type { PlanCourse, PlanSlot } from '../types'
import { TonightHero, type TonightHeroProps } from './TonightHero'

const upcoming = new Date('2026-11-10T17:00:00Z')
const source = { leftoverId: 4, date: '2026-11-09', mealSlotId: 4, recipeName: 'Two-colour cauliflower with peppers' }
const main = () =>
  planCourse({
    courseId: 1, name: 'Main', main: true,
    meal: courseMeal(1, 'Main', { recipeName: 'Scaloppine al marsala', photoUrl: '/api/images/9', startBy: '19:09', why: [favourite('Mia', 'Fabio'), { code: 'stock_coverage', ingredient: 'veal' }, { code: 'slot_rule', tag: 'x' }] }),
  })
const side = (over: Partial<PlanCourse> = {}) =>
  planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Two-colour cauliflower with peppers', servedFromLeftover: source }), ...over })
const dinner = (): PlanSlot => courseSlot([main(), side()], { name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z', cookMinutes: 30, startBy: '19:09' })

function setup(s: PlanSlot = dinner(), over: Partial<TonightHeroProps> = {}) {
  const h = {
    onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn(), onMarkAllCooked: vi.fn(),
    rowHandlers: { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn(), onChoose: vi.fn() },
    menu: { onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() },
  }
  const view = render(
    <MemoryRouter>
      <TonightHero slot={s} now={upcoming} today="2026-11-10" day="tomorrow" action="none" {...h} {...over} />
    </MemoryRouter>,
  )
  return { ...h, container: view.container }
}

describe('TonightHero: the eyebrow', () => {
  it('is one line "Tomorrow · Dinner · start 19:09" in the tile overline, each part its own span', () => {
    const { container } = setup()
    const eyebrow = container.querySelector('.plan-hero .tile__overline')!
    expect(eyebrow.textContent).toBe('Tomorrow · Dinner · start 19:09')
    expect(within(eyebrow as HTMLElement).getByText('start 19:09')).toBeInTheDocument()
    expect(container.querySelector('.plan-hero__start')).toBeNull() // no second line for the start-by
  })

  it('a one-Course hero has the same eyebrow (today, before the slot time)', () => {
    const one = courseSlot([planCourse({ courseId: 1, meal: meal({ startBy: '18:45', cookMinutes: 45 }) })], { name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z' })
    const { container } = setup(one, { day: 'today', action: 'cook' })
    expect(container.querySelector('.plan-hero .tile__overline')!.textContent).toBe('Today · Dinner · start 18:45')
  })

  it('the title is the Main Recipe, a level-2 heading', () => {
    setup()
    expect(screen.getByRole('heading', { level: 2, name: 'Scaloppine al marsala' })).toBeInTheDocument()
  })
})

describe('TonightHero: why chips on one line', () => {
  it('shows at most two, as neutral why chips (the chip look is DS-A\'s; here: the kind), in a row that never wraps', () => {
    const { container } = setup()
    const chips = [...container.querySelectorAll('.plan-hero__chips .chip')]
    expect(chips.length).toBeLessThanOrEqual(2)
    expect(chips.length).toBeGreaterThan(0)
    for (const c of chips) expect(c).toHaveAttribute('data-kind', 'why')
    expect(chips[0]).toHaveAttribute('title', 'Mia and Fabio’s favourite')
  })
})

describe('TonightHero: the Course row', () => {
  it('reads "Side · name · Leftover chip", then ONE group of icon actions at the end: Swap, Pin, ⋮', () => {
    setup()
    const row = screen.getByRole('listitem', { name: 'Side' })
    const body = row.querySelector('.plan-course__body')!
    expect(row.querySelector('.plan-course__caption')).toHaveTextContent('Side')
    expect(within(row).getByRole('button', { name: /Two-colour cauliflower/ })).toBeInTheDocument()
    expect(within(row).getByText('Leftover from Mon')).toBeInTheDocument()
    const actions = body.lastElementChild as HTMLElement
    expect(actions).toHaveClass('plan-course__actions')
    expect(actions).toHaveAttribute('role', 'group')
    expect(actions).toHaveAccessibleName('Side actions')
    expect(within(actions).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Swap', 'Pin', 'More for Side'])
    // the name and the chip come before the actions
    expect(body.querySelector('.plan-meal__recipe')!.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('there is no loose "Mark as Cooked" icon any more: it is in the row\'s ⋮, and opens that Course\'s sheet', async () => {
    const h = setup()
    const row = screen.getByRole('listitem', { name: 'Side' })
    expect(within(row).queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'More for Side' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as Cooked' }))
    expect(h.rowHandlers.onMarkCooked).toHaveBeenCalledWith({ date: '2026-11-10', mealSlotId: 2, courseId: 2 })
  })

  it('Swap and Pin report the Course key', async () => {
    const h = setup()
    const row = screen.getByRole('listitem', { name: 'Side' })
    await userEvent.click(within(row).getByRole('button', { name: 'Swap' }))
    await userEvent.click(within(row).getByRole('button', { name: 'Pin' }))
    const key = { date: '2026-11-10', mealSlotId: 2, courseId: 2 }
    expect(h.rowHandlers.onSwap).toHaveBeenCalledWith(key)
    expect(h.rowHandlers.onPin).toHaveBeenCalledWith(key)
  })

  it('the Cook button stays the only primary in the hero (today)', () => {
    setup(dinner(), { day: 'today', action: 'cook' })
    expect(screen.getByRole('button', { name: 'Cook · 30 min' })).toHaveAttribute('data-variant', 'primary')
    expect(document.querySelectorAll('.plan-hero [data-variant="primary"]')).toHaveLength(1)
  })
})
