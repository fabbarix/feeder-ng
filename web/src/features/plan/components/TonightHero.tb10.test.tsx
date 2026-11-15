// B9-39 (TB-10): the hero's Recipe name, its Course names and its why chips open the Planned Meal sheet; the ⋮ gains Swap, Pin / Unpin and
// Open Recipe before the per-date items. A chip's name is "Why: uses Beef by Tue. Open the Planned Meal". Mock: tb-today.html, shots/tb-10-after-320-light.webp.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, favourite, meal, planCourse, slot } from '../test-utils'
import type { PlanSlot, SlotDateActions } from '../types'
import { TonightHero, type TonightHeroProps } from './TonightHero'

const before = new Date('2026-11-10T17:00:00Z')
const key = { date: '2026-11-10', mealSlotId: 2, courseId: 1 }
const dateActions: SlotDateActions = { offline: false, onWhosEating: vi.fn(), onNotServed: vi.fn(), onTime: vi.fn(), onPlanAgain: vi.fn() }

function setup(s: PlanSlot, over: Partial<TonightHeroProps> = {}) {
  const h = {
    onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn(), onOpenRecipe: vi.fn(),
    rowHandlers: { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onMarkCooked: vi.fn(), onChoose: vi.fn() },
    menu: { onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() },
  }
  const view = render(
    <MemoryRouter>
      <TonightHero slot={s} now={before} today="2026-11-10" dateActions={dateActions} {...h} {...over} />
    </MemoryRouter>,
  )
  return { ...h, container: view.container }
}
const why = [favourite('Anna'), { code: 'slot_rule' as const, tag: 'Fish night' }]
const dinner = (m = {}) => slot({ at: '2026-11-10T19:30:00Z', time: '19:30', meal: meal({ recipeName: 'Chicken curry', cookMinutes: 45, startBy: '18:45', why, ...m }) })
const two = () =>
  courseSlot(
    [
      planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken', why: [favourite('Anna')] }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans' }) }),
    ],
    { name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z', cookMinutes: 30, startBy: '19:00' },
  )

describe('the Recipe name is a button inside its h2 (TB-10)', () => {
  it('keeps the heading and opens the Planned Meal sheet of the main Course', async () => {
    const h = setup(dinner())
    const heading = screen.getByRole('heading', { level: 2, name: 'Chicken curry' })
    const name = within(heading).getByRole('button', { name: 'Chicken curry' })
    await userEvent.click(name)
    expect(h.rowHandlers.onOpen).toHaveBeenCalledTimes(1)
    expect(h.rowHandlers.onOpen).toHaveBeenCalledWith(key)
  })

  it('with several Courses the hero\'s name opens the main Course, and a Course name opens its own Course', async () => {
    const h = setup(two())
    await userEvent.click(screen.getByRole('button', { name: 'Roast chicken' }))
    expect(h.rowHandlers.onOpen).toHaveBeenLastCalledWith({ ...key, courseId: 1 })
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Side' })).getByRole('button', { name: 'Green beans' }))
    expect(h.rowHandlers.onOpen).toHaveBeenLastCalledWith({ ...key, courseId: 2 })
  })

  it('the name button never shows the browser default look: a class the stylesheet resets', () => {
    setup(dinner())
    expect(screen.getByRole('button', { name: 'Chicken curry' })).toHaveClass('plan-hero__name-button')
  })

  it('without a handler the name is plain text (nothing to open)', () => {
    setup(dinner(), { rowHandlers: undefined })
    expect(screen.queryByRole('button', { name: 'Chicken curry' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Chicken curry' })).toBeInTheDocument()
  })
})

describe('each why chip is a button that opens the sheet at "Why this Recipe" (TB-10)', () => {
  it('named "Why: <chip>. Open the Planned Meal"', () => {
    setup(dinner())
    expect(screen.getByRole('button', { name: "Why: Anna's favourite. Open the Planned Meal" })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Why: .*Open the Planned Meal$/ })).toHaveLength(2)
  })

  it('a press opens the main Course\'s sheet at the Why section, naming the reason to highlight for 2 s', async () => {
    const h = setup(dinner())
    await userEvent.click(screen.getByRole('button', { name: "Why: Anna's favourite. Open the Planned Meal" }))
    expect(h.rowHandlers.onOpen).toHaveBeenCalledTimes(1)
    expect(h.rowHandlers.onOpen).toHaveBeenCalledWith(key, { section: 'why', reason: "Anna's favourite" })
  })

  it('a chip that is not a why chip (Leftover from Tue) stays a plain chip', () => {
    setup(dinner({ servedFromLeftover: { date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry', leftoverId: 5 } }))
    expect(screen.getByText('Leftover from Mon').closest('button')).toBeNull()
  })

  it('without a handler the chips are plain (as before)', () => {
    setup(dinner(), { rowHandlers: undefined })
    expect(screen.queryByRole('button', { name: /^Why: / })).not.toBeInTheDocument()
  })
})

describe('tab order: ⋮, name, chips left to right, Course names, Cook (TB-10)', () => {
  it('is the DOM order', () => {
    const { container } = setup(two())
    const order = [...container.querySelectorAll('.plan-hero button')].map((b) => b.getAttribute('aria-label') ?? (b.textContent ?? '').trim())
    const at = (name: string | RegExp) => order.findIndex((n) => (typeof name === 'string' ? n === name : name.test(n)))
    const sequence = [at('Dinner actions'), at('Roast chicken'), at(/^Why: Anna's favourite/), at('Green beans'), at(/^Cook/)]
    expect(sequence.every((i) => i >= 0), JSON.stringify(order)).toBe(true)
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence)
  })
})

describe('the ⋮ menu: Swap, Pin / Unpin and Open Recipe come before the per-date items (TB-10)', () => {
  const items = async (s: PlanSlot, over: Partial<TonightHeroProps> = {}) => {
    const h = setup(s, over)
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    return { h, labels: screen.getAllByRole('menuitem').map((i) => (i.textContent ?? '').trim()) }
  }

  it('one Course: Swap, Pin, Open Recipe, then Who\'s eating, Time today, Not served', async () => {
    const { labels } = await items(dinner())
    expect(labels).toEqual(['Swap', 'Pin', 'Open Recipe', "Who's eating", 'Time today', 'Not served'])
  })

  it('a Pinned meal offers Unpin', async () => {
    const { labels } = await items(dinner({ pinned: true }))
    expect(labels.slice(0, 3)).toEqual(['Swap', 'Unpin', 'Open Recipe'])
  })

  it('several Courses: the three come first, then the slot\'s own items as they were', async () => {
    const { labels } = await items(two())
    expect(labels.slice(0, 3)).toEqual(['Swap', 'Pin', 'Open Recipe'])
    expect(labels).toEqual(expect.arrayContaining(['Mark all Cooked', "Who's eating", 'Time today', 'Not served']))
    expect(labels.findIndex((l) => /^Not cooked/.test(l))).toBeGreaterThan(2)
  })

  it('Swap, Pin and Unpin act on the hero\'s Course; Open Recipe opens the Recipe', async () => {
    const h = setup(dinner())
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Swap' }))
    expect(h.rowHandlers.onSwap).toHaveBeenCalledWith(key)
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pin' }))
    expect(h.rowHandlers.onPin).toHaveBeenCalledWith(key)
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open Recipe' }))
    expect(h.onOpenRecipe).toHaveBeenCalledWith(7)
  })

  it('Unpin calls onUnpin', async () => {
    const h = setup(dinner({ pinned: true }))
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unpin' }))
    expect(h.rowHandlers.onUnpin).toHaveBeenCalledWith(key)
  })

  it('the menu is still named "<Slot> actions" and an item that has no handler is not offered', async () => {
    const { labels } = await items(dinner(), { onOpenRecipe: undefined, rowHandlers: { onOpen: vi.fn(), onSwap: vi.fn() } })
    expect(labels).toEqual(['Swap', "Who's eating", 'Time today', 'Not served'])
  })
})
