// B9-39 (TB-01, TB-15b): the hero is never "cooked?" (it moves on at the slot time, the past meal is To confirm's); its eyebrow is a wrapping row
// of parts that never break inside "start 08:00" and never end a line with "·"; "start now" is underlined; a hint says what to start;
// the section is named by its Recipe; an overnight start (A2) is an info chip "Start Mon 21:30".
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { TonightHero, type TonightHeroProps } from './TonightHero'

const noon = new Date('2026-11-10T12:00:00Z')
const stew = 'Slow cooker beef and barley stew'
const at19 = { at: '2026-11-10T19:00:00Z', time: '19:00' }

function setup(s: PlanSlot, now = noon, over: Partial<TonightHeroProps> = {}) {
  const h = { onCook: vi.fn(), onYesCooked: vi.fn(), onAdjust: vi.fn() }
  const view = render(
    <MemoryRouter>
      <TonightHero slot={s} now={now} today="2026-11-10" {...h} {...over} />
    </MemoryRouter>,
  )
  return { ...h, container: view.container }
}
const parts = (container: HTMLElement) => [...container.querySelectorAll('.plan-hero .tile__overline .plan-hero__eyebrow-part')].map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim())
const dinner = (over: Partial<PlanSlot> = {}, m: { startBy?: string } = {}) => {
  const startBy = m.startBy ?? '13:00'
  return slot({ ...at19, name: 'Dinner', meal: meal({ recipeName: stew, cookMinutes: 360, startBy }), startBy, cookMinutes: 360, ...over })
}

describe('the eyebrow (TB-15b): parts that wrap only between themselves', () => {
  it('each part is its own element, and every part after the first carries its leading "·"', () => {
    const { container } = setup(dinner({}, { startBy: '18:15' }), noon)
    expect(parts(container)).toEqual(['Dinner', '· start 18:15'])
  })

  it('a today slot has no "Today" word on Today; a tomorrow slot says "Tomorrow"', () => {
    const t = setup(dinner())
    expect(parts(t.container)[0]).toBe('Dinner')
    t.container.remove()
    const tomorrow = slot({ date: '2026-11-11', at: '2026-11-11T08:30:00Z', time: '08:30', name: 'Breakfast', meal: meal({ date: '2026-11-11', recipeName: 'Porridge' }) })
    const { container } = setup(tomorrow, noon, { day: 'tomorrow', action: 'none' })
    expect(parts(container)).toEqual(['Tomorrow', '· Breakfast'])
  })

  it('the start time is "start 08:00" in one element, so nothing can break inside it', () => {
    const { container } = setup(dinner({}, { startBy: '08:00' }), new Date('2026-11-10T06:00:00Z'))
    const start = container.querySelector('.plan-hero__start')!
    expect(start).toHaveTextContent('start 08:00')
    expect(start.closest('.plan-hero__eyebrow-part')).not.toBeNull()
  })

  it('from the start time until the slot time it reads "start now", underlined (data-now)', () => {
    const { container } = setup(dinner(), new Date('2026-11-10T13:00:00Z'))
    expect(parts(container)).toEqual(['Dinner', '· start now'])
    expect(container.querySelector('.plan-hero__start')).toHaveAttribute('data-now', 'true')
  })

  it('before the start time "start 13:00" is not underlined', () => {
    const { container } = setup(dinner(), noon)
    expect(container.querySelector('.plan-hero__start')).not.toHaveAttribute('data-now')
  })
})

describe('the hint under the Courses (TB-01)', () => {
  it('at the start time of a 6 h Recipe: "Ready at 19:00. <Recipe> needs 6 h, so start it now."', () => {
    const { container } = setup(dinner(), new Date('2026-11-10T14:00:00Z'))
    expect(container.querySelector('.plan-hero__hint')).toHaveTextContent(`Ready at 19:00. ${stew} needs 6 h, so start it now.`)
  })

  it('several Courses: "Ready at 19:00. Start with <Course> now."', () => {
    const rice = courseMeal(2, 'Side', { recipeName: 'Brown rice', startBy: '17:40', cookMinutes: 80 })
    const roast = courseMeal(1, 'Main', { recipeName: 'Roast chicken', startBy: '18:10', cookMinutes: 50 })
    const several = courseSlot([planCourse({ courseId: 1, name: 'Main', main: true, meal: roast }), planCourse({ courseId: 2, name: 'Side', main: false, meal: rice })], { ...at19, name: 'Dinner', startBy: '17:40', cookMinutes: 80 })
    const { container } = setup(several, new Date('2026-11-10T17:45:00Z'))
    expect(container.querySelector('.plan-hero__hint')).toHaveTextContent('Ready at 19:00. Start with Brown rice now.')
  })

  it('no hint before the start time', () => {
    const { container } = setup(dinner(), noon)
    expect(container.querySelector('.plan-hero__hint')).toBeNull()
  })

  it('the hint is inside the hero, after the name and before the Cook button (not floating)', () => {
    const { container } = setup(dinner(), new Date('2026-11-10T14:00:00Z'))
    const hint = container.querySelector('.plan-hero__hint')!
    expect(container.querySelector('.plan-hero')!.contains(hint)).toBe(true)
    expect(container.querySelector('.plan-hero__name')!.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(hint.compareDocumentPosition(screen.getByRole('button', { name: /^Cook/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('with several Courses the hint sits under the Course rows', () => {
    const rice = courseMeal(2, 'Side', { recipeName: 'Brown rice', startBy: '17:40', cookMinutes: 80 })
    const roast = courseMeal(1, 'Main', { recipeName: 'Roast chicken', startBy: '18:10', cookMinutes: 50 })
    const several = courseSlot([planCourse({ courseId: 1, name: 'Main', main: true, meal: roast }), planCourse({ courseId: 2, name: 'Side', main: false, meal: rice })], { ...at19, name: 'Dinner', startBy: '17:40', cookMinutes: 80 })
    const { container } = setup(several, new Date('2026-11-10T17:45:00Z'))
    const courses = container.querySelector('.plan-hero__courses')!
    expect(courses.compareDocumentPosition(container.querySelector('.plan-hero__hint')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('the hero never asks "cooked?" (TB-01: it moves on at the slot time)', () => {
  it('a render after the slot time (a stale clock for one frame) shows no ask line, no Cooked and no Adjust', () => {
    const { container } = setup(dinner(), new Date('2026-11-10T20:00:00Z'))
    expect(container.querySelector('.plan-hero__ask')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Cooked/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Adjust/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/cooked\?/)).not.toBeInTheDocument()
  })

  it('and Not cooked is not promoted to the first menu item (the "cooked?" decision is To confirm\'s)', async () => {
    const a = planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main') })
    const b = planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })
    setup(courseSlot([a, b], { ...at19, name: 'Dinner' }), new Date('2026-11-10T20:00:00Z'), { menu: { onNotCookedSlot: vi.fn(), onAddCourse: vi.fn() } })
    const { default: userEvent } = await import('@testing-library/user-event')
    await userEvent.click(screen.getByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem')[0]).not.toHaveTextContent(/^Not cooked/)
  })
})

describe('the hero\'s section is named by its Recipe (TB-01 accessibility)', () => {
  it('a region named by the Recipe name, whose heading is that name', () => {
    setup(dinner())
    const region = screen.getByRole('region', { name: stew })
    expect(within(region).getByRole('heading', { level: 2, name: stew })).toBeInTheDocument()
  })
})

describe('the start chip of an overnight start (A2): info "Start Mon 21:30"', () => {
  const tomorrow = (m: Partial<ReturnType<typeof meal>>) =>
    slot({ date: '2026-11-11', at: '2026-11-11T07:00:00Z', time: '07:00', name: 'Breakfast', meal: meal({ date: '2026-11-11', recipeName: 'Overnight oats', cookMinutes: 60, ...m }) })

  it('a planned meal that must be started on an earlier day carries an info chip with the timer glyph and the start day', () => {
    const { container } = setup(tomorrow({ startsAt: { date: '2026-11-10', time: '21:30' } }), noon, { day: 'tomorrow', action: 'none' })
    const chip = [...container.querySelectorAll('.plan-hero .chip')].find((c) => c.textContent === 'Start Tue 21:30')
    expect(chip, 'a chip "Start Tue 21:30"').toBeDefined()
    expect(chip).toHaveAttribute('data-status', 'info')
    expect(chip!.querySelector('svg')).not.toBeNull()
    expect(chip).toHaveAttribute('title', 'Start cooking on Tuesday at 21:30')
  })

  it('it comes first in the chip line, and the line still holds two chips at most', () => {
    const why = [{ code: 'favourite' as const, members: ['Anna'] }, { code: 'slot_rule' as const, tag: 'x' }]
    const { container } = setup(tomorrow({ startsAt: { date: '2026-11-10', time: '21:30' }, why }), noon, { day: 'tomorrow', action: 'none' })
    const chips = [...container.querySelectorAll('.plan-hero__chips .chip')].map((c) => c.textContent)
    expect(chips).toHaveLength(2)
    expect(chips[0]).toBe('Start Tue 21:30')
  })

  it('a Pinned meal that would start outside the cooking times has the warn chip "Start 02:30" instead', () => {
    const { container } = setup(tomorrow({ pinned: true, earlyStart: '02:30' }), noon, { day: 'tomorrow', action: 'none' })
    const chip = [...container.querySelectorAll('.plan-hero .chip')].find((c) => c.textContent === 'Start 02:30')
    expect(chip, 'a chip "Start 02:30"').toBeDefined()
    expect(chip).toHaveAttribute('data-status', 'warn')
    expect(chip).toHaveAttribute('title', 'Cooking would start outside your cooking times')
  })

  it('a meal that starts on its own day has no start chip', () => {
    const { container } = setup(dinner())
    expect([...container.querySelectorAll('.plan-hero .chip')].some((c) => /^Start /.test(c.textContent ?? ''))).toBe(false)
  })
})
