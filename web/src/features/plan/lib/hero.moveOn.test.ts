// B9-39 (TB-01, decision TB 2): the hero is the earliest Meal Slot, today or later, with a Planned Meal still to cook or reheat whose
// SLOT TIME HAS NOT PASSED. At the slot time it moves on and the past meal heads To confirm (`justServed`). The eyebrow states the
// urgency ("start 18:15", "start now"), and a hint says what to start when the timeline is longer than the time left.
// Mock: docs/design/ui-review-3/mocks/tb-01-hero-timeline.html. A day with Breakfast 08:30, Lunch 13:00 and Dinner 19:00 (a 6 h Recipe, start 13:00).
import { describe, expect, it } from 'vitest'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { heroEyebrow, heroHint, heroNextChange, heroSelection, justServed, withJustServed } from './hero'

const today = '2026-11-10'
const tomorrow = '2026-11-11'
const at = (date: string, time: string) => `${date}T${time}:00Z`
const clock = (time: string, date = today) => new Date(`${date}T${time}:00Z`)

const breakfast = (date = today, over: Partial<PlanSlot> = {}) =>
  slot({ date, mealSlotId: 1, name: 'Breakfast', time: '08:30', at: at(date, '08:30'), meal: meal({ date, mealSlotId: 1, recipeName: 'Porridge' }), ...over })
const lunch = (date = today, over: Partial<PlanSlot> = {}) =>
  slot({ date, mealSlotId: 2, name: 'Lunch', time: '13:00', at: at(date, '13:00'), meal: meal({ date, mealSlotId: 2, recipeName: 'Lentil soup' }), ...over })
const stew = 'Slow cooker beef and barley stew'
const dinner = (date = today, over: Partial<PlanSlot> = {}) =>
  slot({
    date, mealSlotId: 3, name: 'Dinner', time: '19:00', at: at(date, '19:00'), startBy: '13:00', cookMinutes: 360,
    meal: meal({ date, mealSlotId: 3, recipeName: stew, cookMinutes: 360, startBy: '13:00' }), ...over,
  })
const week = [breakfast(), lunch(), dinner(), breakfast(tomorrow), lunch(tomorrow), dinner(tomorrow)]

describe('heroSelection moves on at the slot time (TB-01)', () => {
  const pick = (time: string) => heroSelection(week, clock(time), today)
  const named = (time: string) => `${pick(time)?.slot.date} ${pick(time)?.slot.name}`

  it('08:29: Breakfast, still ahead', () => {
    expect(named('08:29')).toBe(`${today} Breakfast`)
  })

  it('08:30: Breakfast has gone, so the hero is Lunch (not Breakfast "cooked?")', () => {
    expect(named('08:30')).toBe(`${today} Lunch`)
  })

  it('12:59: Lunch', () => {
    expect(named('12:59')).toBe(`${today} Lunch`)
  })

  it('13:00: Dinner, whose timeline must start now', () => {
    expect(named('13:00')).toBe(`${today} Dinner`)
    expect(pick('13:00')).toMatchObject({ day: 'today', action: 'cook' })
  })

  it('19:00: nothing is left today, so tomorrow\'s Breakfast, labelled, with no Cook', () => {
    expect(named('19:00')).toBe(`${tomorrow} Breakfast`)
    expect(pick('19:00')).toMatchObject({ day: 'tomorrow', action: 'none' })
  })

  it('23:59: tomorrow\'s Breakfast', () => {
    expect(named('23:59')).toBe(`${tomorrow} Breakfast`)
  })

  it('the chapter\'s case: a household clock of 14:44 shows Dinner, never Lunch "cooked?"', () => {
    expect(named('14:44')).toBe(`${today} Dinner`)
  })

  it('a slot that is already Cooked or Not cooked is never the hero, and the next one is', () => {
    const slots = [breakfast(today, { meal: meal({ date: today, mealSlotId: 1, state: 'cooked' }) }), lunch(), dinner()]
    expect(heroSelection(slots, clock('07:00'), today)?.slot.name).toBe('Lunch')
  })

  it('a slot whose Main is Cooked but whose Side is still planned stays the hero until its time', () => {
    const several = courseSlot(
      [planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { state: 'cooked' }) }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans' }) })],
      { mealSlotId: 4, name: 'Dinner', time: '19:00', at: at(today, '19:00') },
    )
    expect(heroSelection([several], clock('18:00'), today)?.slot.mealSlotId).toBe(4)
    expect(heroSelection([several], clock('19:00'), today)).toBeNull()
  })

  it('a start that has come offers Cook for tomorrow\'s meal too (an overnight start, A2): Cook Mode opens for the meal\'s own date', () => {
    const early = breakfast(tomorrow, { startBy: '21:30', meal: meal({ date: tomorrow, mealSlotId: 1, recipeName: 'Overnight oats', startBy: '21:30', cookMinutes: 60 }) })
    expect(heroSelection([early], clock('21:29'), today)).toMatchObject({ day: 'tomorrow', action: 'none' })
    expect(heroSelection([early], clock('21:30'), today)).toMatchObject({ day: 'tomorrow', action: 'cook' })
  })
})

describe('heroEyebrow on Today (TB-01): "DINNER · START 18:15", "DINNER · START NOW"', () => {
  const onToday = { onToday: true }
  const dinnerAt = (startBy?: string) => dinner(today, { startBy, meal: meal({ date: today, mealSlotId: 3, startBy }) })
  const sel = (s: PlanSlot, day: 'today' | 'tomorrow' | 'later', action: 'cook' | 'none' = 'cook') => ({ slot: s, day, action } as const)

  it('a today slot drops the day word on Today: the page title and date already say it', () => {
    expect(heroEyebrow(sel(dinnerAt('18:15'), 'today'), clock('12:00'), onToday)).toEqual(['Dinner', 'start 18:15'])
    expect(heroEyebrow(sel(dinnerAt(), 'today'), clock('12:00'), onToday)).toEqual(['Dinner', '19:00'])
  })

  it('from the start time until the slot time the start part reads "start now" (CSS underlines it)', () => {
    expect(heroEyebrow(sel(dinnerAt('13:00'), 'today'), clock('13:00'), onToday)).toEqual(['Dinner', 'start now'])
    expect(heroEyebrow(sel(dinnerAt('13:00'), 'today'), clock('18:59'), onToday)).toEqual(['Dinner', 'start now'])
  })

  it('a tomorrow slot: "Tomorrow · Breakfast" (no start-by, no time)', () => {
    expect(heroEyebrow(sel(breakfast(tomorrow), 'tomorrow', 'none'), clock('20:00'), onToday)).toEqual(['Tomorrow', 'Breakfast'])
  })

  it('a tomorrow slot whose start has come: "Tomorrow · Breakfast · start now"', () => {
    const early = breakfast(tomorrow, { startBy: '21:30', meal: meal({ date: tomorrow, mealSlotId: 1, startBy: '21:30' }) })
    expect(heroEyebrow(sel(early, 'tomorrow', 'cook'), clock('21:45'), onToday)).toEqual(['Tomorrow', 'Breakfast', 'start now'])
  })

  it('a later slot: "Wed · Lunch · 13:00"', () => {
    const wed = lunch('2026-11-11')
    expect(heroEyebrow(sel(wed, 'later', 'none'), clock('20:00'), onToday)).toEqual(['Wed', 'Lunch', '13:00'])
  })

  it('without `onToday` (the Kitchen board) a today slot keeps "Today" (TB 7: the board has no page title)', () => {
    expect(heroEyebrow(sel(dinnerAt('18:15'), 'today'), clock('12:00'))).toEqual(['Today', 'Dinner', 'start 18:15'])
    expect(heroEyebrow(sel(dinnerAt('13:00'), 'today'), clock('14:00'))).toEqual(['Today', 'Dinner', 'start now'])
  })
})

describe('heroHint: what to start when the timeline is longer than the time left (TB-01)', () => {
  const sel = (s: PlanSlot) => ({ slot: s, day: 'today', action: 'cook' }) as const

  it('one Course at its start time: "Ready at 19:00. <Recipe> needs 6 h, so start it now."', () => {
    expect(heroHint(sel(dinner()), clock('13:00'))).toBe(`Ready at 19:00. ${stew} needs 6 h, so start it now.`)
    expect(heroHint(sel(dinner()), clock('17:00'))).toBe(`Ready at 19:00. ${stew} needs 6 h, so start it now.`)
  })

  it('the duration is written as the Cook button writes it: "1 h 30 min", "45 min"', () => {
    const long = dinner(today, { meal: meal({ date: today, mealSlotId: 3, recipeName: 'Roast', cookMinutes: 90, startBy: '17:30' }), startBy: '17:30', cookMinutes: 90 })
    expect(heroHint(sel(long), clock('17:30'))).toBe('Ready at 19:00. Roast needs 1 h 30 min, so start it now.')
  })

  it('several Courses: "Ready at 19:00. Start with <the Course that starts first> now."', () => {
    const rice = courseMeal(2, 'Side', { recipeName: 'Brown rice', startBy: '17:40', cookMinutes: 80 })
    const roast = courseMeal(1, 'Main', { recipeName: 'Roast chicken', startBy: '18:10', cookMinutes: 50 })
    const several = courseSlot([planCourse({ courseId: 1, name: 'Main', main: true, meal: roast }), planCourse({ courseId: 2, name: 'Side', main: false, meal: rice })], {
      mealSlotId: 4, name: 'Dinner', time: '19:00', at: at(today, '19:00'), startBy: '17:40', cookMinutes: 80,
    })
    expect(heroHint(sel(several), clock('17:45'))).toBe('Ready at 19:00. Start with Brown rice now.')
  })

  it('no hint before the start time, after the slot time, or when the Recipe has no duration', () => {
    expect(heroHint(sel(dinner()), clock('12:59'))).toBeNull()
    expect(heroHint(sel(dinner()), clock('19:00'))).toBeNull()
    const unknown = dinner(today, { startBy: '13:00', meal: meal({ date: today, mealSlotId: 3, startBy: '13:00' }) })
    expect(heroHint(sel(unknown), clock('14:00'))).toBeNull()
  })

  it('no hint for a meal without a start-by', () => {
    expect(heroHint(sel(lunch()), clock('12:00'))).toBeNull()
  })
})

describe('justServed: today\'s past slots that still have a planned Course (TB-01)', () => {
  const key = (e: { date: string; mealSlotId: number; courseId: number }) => `${e.date}/${e.mealSlotId}/${e.courseId}`

  it('at the slot time Lunch is the first row of To confirm: a flat entry per planned Course, with the Course and its meal', () => {
    const rows = justServed(week, clock('13:00'), today)
    expect(rows.map((r) => `${r.name}:${r.meal?.recipeName}`)).toEqual(['Breakfast:Porridge', 'Lunch:Lentil soup'])
    expect(rows[1]).toMatchObject({ date: today, mealSlotId: 2, courseId: 1, courseName: 'Main', time: '13:00' })
  })

  it('at 14:44 (Breakfast and Lunch gone): Breakfast first, then Lunch, in slot-time order whatever the input order', () => {
    const rows = justServed([dinner(), lunch(), breakfast()], clock('14:44'), today)
    expect(rows.map((r) => r.name)).toEqual(['Breakfast', 'Lunch'])
  })

  it('a slot whose time has not come is not served yet, and the instant of the slot time counts as past', () => {
    expect(justServed(week, clock('12:59'), today).map((r) => r.name)).toEqual(['Breakfast'])
    expect(justServed(week, clock('08:30'), today).map((r) => r.name)).toEqual(['Breakfast'])
    expect(justServed(week, clock('08:29'), today)).toEqual([])
  })

  it('only today: a past slot of another day is the server\'s To confirm, and tomorrow is not past', () => {
    const yesterday = lunch('2026-11-09')
    expect(justServed([yesterday, breakfast(tomorrow)], clock('14:44'), today)).toEqual([])
  })

  it('leaves out a slot with nothing left to cook: Cooked, Not cooked, unfilled, Not served', () => {
    const cooked = breakfast(today, { meal: meal({ date: today, mealSlotId: 1, state: 'cooked' }) })
    const skipped = lunch(today, { meal: meal({ date: today, mealSlotId: 2, state: 'skipped' }) })
    const empty = dinner(today, { meal: null, at: at(today, '09:00'), time: '09:00' })
    const notServed = slot({ date: today, mealSlotId: 5, name: 'Snack', time: '10:00', at: at(today, '10:00'), notServed: true, meal: null })
    expect(justServed([cooked, skipped, empty, notServed], clock('14:44'), today)).toEqual([])
  })

  it('a slot with several Courses lists only the Courses still planned (Main Cooked, Side not)', () => {
    const several = courseSlot(
      [planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { state: 'cooked' }) }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans' }) })],
      { mealSlotId: 4, name: 'Dinner', time: '12:00', at: at(today, '12:00') },
    )
    expect(justServed([several], clock('12:30'), today).map(key)).toEqual([`${today}/4/2`])
  })

  it('does not change its input', () => {
    const input = [lunch(), breakfast()]
    const copy = JSON.stringify(input)
    justServed(input, clock('14:44'), today)
    expect(JSON.stringify(input)).toBe(copy)
  })
})

describe('withJustServed: [...justServed, ...server], de-duplicated by date and Meal Slot', () => {
  const entry = (date: string, id: number, name: string, recipe: string) =>
    slot({ date, mealSlotId: id, name, time: '13:00', at: at(date, '13:00'), courseId: 1, courseName: 'Main', meal: meal({ date, mealSlotId: id, recipeName: recipe }) })

  it('the just-served rows come first, then the server\'s, in the order each list has them', () => {
    const served = [entry(today, 1, 'Breakfast', 'Porridge'), entry(today, 2, 'Lunch', 'Lentil soup')]
    const server = [entry('2026-11-09', 3, 'Dinner', 'Stew')]
    expect(withJustServed(served, server).map((e) => e.name)).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  })

  it('a slot both lists have appears once (once the server catches up at slot time + 2 h, nothing doubles)', () => {
    const served = [entry(today, 2, 'Lunch', 'Lentil soup')]
    const server = [entry(today, 2, 'Lunch', 'Lentil soup'), entry('2026-11-09', 3, 'Dinner', 'Stew')]
    expect(withJustServed(served, server).map((e) => `${e.date}/${e.mealSlotId}`)).toEqual([`${today}/2`, '2026-11-09/3'])
  })

  it('with nothing just served, the server\'s list as it is; with nothing from the server, the just served', () => {
    const server = [entry('2026-11-09', 3, 'Dinner', 'Stew')]
    expect(withJustServed([], server)).toEqual(server)
    expect(withJustServed(server, [])).toEqual(server)
  })
})

describe('heroNextChange: the instant the hero or the just-served rows next change (what the clock waits for)', () => {
  const ms = (date: string, time: string) => Date.parse(at(date, time))

  it('a hero without a start-by: its slot time', () => {
    expect(heroNextChange(week, clock('08:00'), today)).toBe(ms(today, '08:30'))
    expect(heroNextChange(week, clock('12:00'), today)).toBe(ms(today, '13:00'))
  })

  it('a hero whose start time is still ahead: the start time first (the eyebrow turns to "start now"), then its slot time', () => {
    expect(heroNextChange([dinner()], clock('12:00'), today)).toBe(ms(today, '13:00'))
    expect(heroNextChange([dinner()], clock('13:30'), today)).toBe(ms(today, '19:00'))
  })

  it('nothing to cook ahead: null (the clock then only looks again every minute)', () => {
    expect(heroNextChange([], clock('12:00'), today)).toBeNull()
    expect(heroNextChange([breakfast()], clock('09:00'), today)).toBeNull()
  })
})
