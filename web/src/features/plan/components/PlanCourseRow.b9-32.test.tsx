// B9-32 on a Course row: PC-06 (chips whole or counted, in the `below` slot), PC-16 (9) (no empty chip line), PC-07 (the unfilled row),
// PC-14 / A2 (start chips), A11Y-08 (names, Pin as one toggle that keeps focus), A11Y-09 (an IconSet with 8 px gaps).
// TEST-AUTHOR tests. The row measures its chip line with a ResizeObserver and the natural width of every chip (offsetWidth) from an
// aria-hidden `.plan-row__measure` copy of all the chips; the visible line `.plan-row__chips` shows only the chips that fit whole.
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CourseRowModel } from '../lib/courses'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import { installResizeObserver } from '../test-utils.grid'
import type { PlanCourse, PlanSlot } from '../types'
import { PlanCourseRow } from './PlanCourseRow'

const key = { date: '2026-11-17', mealSlotId: 1, courseId: 1 } // a Tuesday
const main = (over: Partial<PlanCourse> = {}) => planCourse({ courseId: 1, meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Pasta al pomodoro' }), ...over })

function setup(course: PlanCourse = main(), slotOver: Partial<PlanSlot> = {}, caption: string | null = null) {
  const h = { onOpen: vi.fn(), onSwap: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(), onChoose: vi.fn() }
  const slot = courseSlot([course], { date: '2026-11-17', mealSlotId: 1, name: 'Breakfast', time: '07:00', at: '2026-11-17T07:00:00Z', ...slotOver })
  const row: CourseRowModel = { course, key, caption }
  const ui = (c: PlanCourse) => (
    <MemoryRouter>
      <ul>
        <PlanCourseRow row={{ ...row, course: c }} slot={slot} today="2026-11-16" {...h} />
      </ul>
    </MemoryRouter>
  )
  const view = render(ui(course))
  return { h, view, li: view.container.querySelector('li')!, rerender: (c: PlanCourse) => view.rerender(ui(c)) }
}

describe('A11Y-08: names and Pin as one toggle', () => {
  it('Swap and Pin name the Recipe, the day and the Meal Slot; the day is "Tue 17", never "Today"', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Swap Pasta al pomodoro, Tue 17 Breakfast' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pin Pasta al pomodoro, Tue 17 Breakfast' })).toHaveAttribute('aria-pressed', 'false')
  })

  it("on today's row the day is still its date, not the word Today", () => {
    setup(main(), { date: '2026-11-16' })
    expect(screen.getByRole('button', { name: /^Swap Pasta al pomodoro, Mon 16 Breakfast$/ })).toBeInTheDocument()
  })

  it('Pin keeps its name when pressed and its focus when the meal becomes Pinned (the same element, aria-pressed flips)', async () => {
    const { rerender, h } = setup()
    const pin = screen.getByRole('button', { name: /^Pin / })
    await userEvent.click(pin)
    expect(h.onPin).toHaveBeenCalledWith(key)
    expect(pin).toHaveFocus()
    rerender(main({ meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Pasta al pomodoro', pinned: true }) }))
    const after = screen.getByRole('button', { name: 'Pin Pasta al pomodoro, Tue 17 Breakfast' })
    expect(after).toBe(pin)
    expect(after).toHaveAttribute('aria-pressed', 'true')
    expect(after).toHaveFocus()
  })

  it('the row target keeps the Recipe as its name and describes itself by the meta (ListRow aria-describedby)', () => {
    setup(main(), {}, 'Main')
    const target = screen.getByRole('button', { name: 'Pasta al pomodoro' })
    const described = target.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent)
    expect(described.join(' ')).toContain('Main')
  })
})

describe('A11Y-09: the actions are an IconSet', () => {
  it('Swap and Pin are the two buttons of one .icon-set (8 px gap on a fine pointer, set by the IconSet, so rings stop short of each other)', () => {
    const { li } = setup()
    const set = li.querySelector('.icon-set')!
    expect(within(set as HTMLElement).getAllByRole('button')).toHaveLength(2)
    expect(li.querySelector('.plan-row__actions')).toBeNull()
  })
})

describe('PC-06 / PC-16 (9): the chip line', () => {
  const chipsMeal = () => main({ meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Pasta al pomodoro', why: [{ code: 'favourite', members: ['Mia'] }, { code: 'slot_rule' }, { code: 'cooldown_relaxed', date: '2026-11-08' }] }) })

  it('a row with no chips renders no chip line, no below slot and no data-has-below (Frozen lasagne)', () => {
    const { li } = setup(main({ meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Frozen lasagne' }) }))
    expect(li.querySelector('.plan-row__chips')).toBeNull()
    expect(li.querySelector('.list-row__below')).toBeNull()
    expect(li).not.toHaveAttribute('data-has-below')
  })

  it('a row with chips has them under the title in `below` (data-has-below), not in the text column', () => {
    const { li } = setup(chipsMeal())
    expect(li).toHaveAttribute('data-has-below', 'true')
    expect(li.querySelector('.list-row__below .plan-row__chips')).not.toBeNull()
    expect(li.querySelector('.list-row__text .plan-row__chips')).toBeNull()
  })

  describe('measured (ResizeObserver on the chip line, natural widths from offsetWidth of the aria-hidden .plan-row__measure copy)', () => {
    let ro: ReturnType<typeof installResizeObserver>
    beforeEach(() => {
      ro = installResizeObserver()
      // A chip is 7 px a letter and 24 px of padding: "Mia's favourite" 129, "Slot Rule: Tuesday" 150, "Again soon: had Sun" 157.
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('chip') ? (this.textContent ?? '').trim().length * 7 + 24 : 0
      })
    })
    afterEach(() => {
      ro.restore()
      vi.restoreAllMocks()
    })
    const shown = (li: Element) => [...li.querySelectorAll('.plan-row__chips .chip:not([data-kind="count"])')].map((c) => c.textContent)
    const fire = (li: Element, width: number) => act(() => ro.fire(width, li.querySelector('.plan-row__chips')!))

    it('observes the visible chip line, and keeps a hidden measuring copy of every chip out of the accessibility tree', () => {
      const { li } = setup(chipsMeal())
      expect(ro.observers.some((o) => o.targets.includes(li.querySelector('.plan-row__chips')!))).toBe(true)
      const measure = li.querySelector('.plan-row__measure')!
      expect(measure).toHaveAttribute('aria-hidden', 'true')
      expect(measure.querySelectorAll('.chip')).toHaveLength(3)
    })

    it('a wide line shows all three chips whole, with no "+N"', () => {
      const { li } = setup(chipsMeal())
      fire(li, 500)
      expect(shown(li)).toEqual(["Mia's favourite", 'Slot Rule: Tuesday', 'Again soon: had Sun'])
      expect(li.querySelector('.chip[data-kind="count"]')).toBeNull()
    })

    it('a line that fits two chips and the "+1" shows exactly those: nothing is cut to a stub', () => {
      const { li } = setup(chipsMeal())
      fire(li, 330)
      expect(shown(li)).toEqual(["Mia's favourite", 'Slot Rule: Tuesday'])
      const more = li.querySelector('.plan-row__chips .chip[data-kind="count"]')!
      expect(more).toHaveTextContent('+1')
      expect(more).toHaveAttribute('title', 'Again soon: had Sun')
    })

    it('a narrower line (300) fits one chip and counts the other two', () => {
      const { li } = setup(chipsMeal())
      fire(li, 300)
      expect(shown(li)).toEqual(["Mia's favourite"])
      expect(li.querySelector('.plan-row__chips .chip[data-kind="count"]')).toHaveTextContent('+2')
    })

    it('a Leftover chip is never the one that is cut: the Leftover chip shows whole even on a narrow line', () => {
      const { li } = setup(main({ meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Pasta', servedFromLeftover: { date: '2026-11-15' } as never, why: [{ code: 'favourite', members: ['Mia'] }] }) }))
      fire(li, 190)
      expect(shown(li)).toEqual(['Leftover from Sun'])
    })

    it('a lone chip wider than the line is the only one that may end in an ellipsis (the line says data-cut="true")', () => {
      const { li } = setup(main({ meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Pasta', why: [{ code: 'favourite', members: ['Mia'] }] }) }))
      fire(li, 90)
      expect(shown(li)).toEqual(["Mia's favourite"])
      expect(li.querySelector('.plan-row__chips')).toHaveAttribute('data-cut', 'true')
      fire(li, 400)
      expect(li.querySelector('.plan-row__chips')).not.toHaveAttribute('data-cut')
    })

    it('re-fits as the line is resized', () => {
      const { li } = setup(chipsMeal())
      fire(li, 500)
      expect(shown(li)).toHaveLength(3)
      fire(li, 300)
      expect(shown(li)).toHaveLength(1)
      fire(li, 500)
      expect(shown(li)).toHaveLength(3)
    })
  })

  it('before anything is measured (jsdom, first paint) the row shows at most two chips and "+N", as before', () => {
    const { li } = setup(chipsMeal())
    expect(li.querySelectorAll('.plan-row__chips .chip:not([data-kind="count"])')).toHaveLength(2)
    expect(li.querySelector('.plan-row__chips .chip[data-kind="count"]')).toHaveTextContent('+1')
  })
})

describe('PC-07: an unfilled Course row', () => {
  const unfilled = (reason: string, eliminated = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }) =>
    planCourse({ courseId: 3, name: 'Dessert', main: false, meal: null, unfilled: { reason, slotRuleClaimed: false, eliminated } as never })
  const setupDessert = (c: PlanCourse) => setup(c, { name: 'Dinner' }, 'Dessert')

  it('"Not planned" (muted), the Course in the meta, one info chip "No Dessert Recipes" for no_course_recipes', () => {
    const { li } = setupDessert(unfilled('no_course_recipes'))
    expect(li.querySelector('.list-row__title')).toHaveTextContent('Not planned')
    expect(li.querySelector('.list-row__meta')).toHaveTextContent('Dessert')
    const chips = li.querySelectorAll('.plan-row__chips .chip')
    expect(chips).toHaveLength(1)
    expect(chips[0]).toHaveTextContent('No Dessert Recipes')
    expect(chips[0]).toHaveAttribute('data-status', 'info')
  })

  it.each([
    ['no_candidates', { considered: 3, exclusion: 3, coolDown: 0, varietyRule: 0, advanceStep: 0 }, 'Excluded', 'warn'],
    ['no_candidates', { considered: 3, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 3 }, 'Too late for its Advance Step', 'warn'],
    ['no_candidates', { considered: 3, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }, 'No Recipe fits', 'warn'],
    ['no_candidates', { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }, 'No Recipes', 'info'],
    ['no_attendance', undefined, 'Nobody attending', 'info'],
  ])('%s %j: chip "%s" in the %s tone', (reason, eliminated, label, tone) => {
    const { li } = setupDessert(unfilled(reason, eliminated))
    const chip = li.querySelector('.plan-row__chips .chip')!
    expect(chip).toHaveTextContent(label)
    expect(chip).toHaveAttribute('data-status', tone)
  })

  it('a rule that claimed the slot reads "Slot Rule unmet"', () => {
    const c = unfilled('no_candidates', { considered: 2, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 })
    c.unfilled!.slotRuleClaimed = true
    expect(setupDessert(c).li.querySelector('.plan-row__chips .chip')).toHaveTextContent('Slot Rule unmet')
  })

  it('a trailing 44 px "Choose a Recipe for Dessert, Tue 17 Breakfast" button with the MagnifyingGlass; it is the only button and there is no Swap or Pin', async () => {
    const { li, h } = setupDessert(unfilled('no_course_recipes'))
    const buttons = within(li as HTMLElement).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Choose a Recipe for Dessert, Tue 17 Breakfast'])
    expect(buttons[0]!.closest('.list-row__trailing')).not.toBeNull()
    await userEvent.click(buttons[0]!)
    expect(h.onChoose).toHaveBeenCalledWith(key)
  })

  it('the chip text is part of the row\'s description (a screen reader hears the cause)', () => {
    const { li } = setupDessert(unfilled('no_course_recipes'))
    const trailing = within(li as HTMLElement).getByRole('button')
    const ids = (trailing.getAttribute('aria-describedby') ?? li.getAttribute('aria-describedby') ?? '').split(' ')
    expect(ids.map((id) => document.getElementById(id)?.textContent).join(' ')).toContain('No Dessert Recipes')
  })
})

describe('A2 / PC-14: the start chips on a row', () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T12:00:00Z') }))
  afterEach(() => vi.useRealTimers())
  const planned = (over = {}) => main({ meal: courseMeal(1, 'Main', { date: '2026-11-17', mealSlotId: 1, recipeName: 'Slow cooker beef', ...over }) })

  it('an info chip "Start Mon 21:30" for a planned meal that has to be started the evening before', () => {
    const { li } = setup(planned({ startsAt: { date: '2026-11-16', time: '21:30' } }))
    const chip = within(li as HTMLElement).getByText('Start Mon 21:30').closest('.chip')!
    expect(chip).toHaveAttribute('data-status', 'info')
    expect(chip).toHaveAttribute('title', 'Start cooking on Monday at 21:30')
  })

  it('a Pinned meal whose start is in the quiet hours keeps the WARN chip', () => {
    const { li } = setup(planned({ pinned: true, earlyStart: '02:30' }))
    expect(within(li as HTMLElement).getByText('Start 02:30').closest('.chip')).toHaveAttribute('data-status', 'warn')
  })

  it('hidden once the slot time has passed', () => {
    vi.setSystemTime(new Date('2026-11-17T07:30:00Z'))
    const { li } = setup(planned({ startsAt: { date: '2026-11-16', time: '21:30' } }))
    expect(within(li as HTMLElement).queryByText(/^Start /)).toBeNull()
  })

  it('hidden on a slot where everyone is away', () => {
    const { li } = setup(planned({ startsAt: { date: '2026-11-16', time: '21:30' } }), { everyoneAway: true })
    expect(within(li as HTMLElement).queryByText(/^Start /)).toBeNull()
  })
})
