// B9-47 (TB-08, decision TB 7): the board's hero follows TB-01's selection, the one Today uses (heroSelection): the earliest Meal Slot with a
// Planned Meal still to cook whose slot time has not come. At the slot time the board moves on too. Its eyebrow is Today's eyebrow parts
// WITH the day word (the board has no page title): "Today · Dinner · start 13:00", "Tomorrow · Breakfast". "Tonight" is gone.
import { describe, expect, it } from 'vitest'
import { heroEyebrow, heroSelection } from '../../plan/lib/hero'
import type { PlanSlot } from '../../plan/types'
import { course, meal, slotOn, TODAY, TOMORROW } from '../test-utils'
import type { SlotLike } from '../types'
import { boardHero } from './hero'

/** What the plan library needs of a slot (the board's payload has these; the fixtures are minimal): Today's selection, run directly. */
const asPlan = (slots: SlotLike[]) =>
  slots.map((s) => ({ ...s, courses: (s.courses ?? []).map((c) => ({ unfilled: null, coveredBy: null, unserved: null, optOutMemberIds: [], ...c })) })) as unknown as PlanSlot[]
const clock = (time: string, date = TODAY) => new Date(`${date}T${time}:00Z`)
const breakfast = (date = TODAY) => slotOn(date, 1, 'Breakfast', '08:30', 'Porridge')
const lunch = (date = TODAY) => slotOn(date, 2, 'Lunch', '13:00', 'Lentil soup')
const stew = 'Slow cooker beef and barley stew'
const dinner = (date = TODAY) => slotOn(date, 3, 'Dinner', '19:00', stew, { startBy: '13:00', cookMinutes: 360 })
const day = [breakfast(), lunch(), dinner(), breakfast(TOMORROW), lunch(TOMORROW), dinner(TOMORROW)]
const hero = (time: string, slots = day, date = TODAY) => boardHero(slots, clock(time, date), TODAY)
const named = (time: string, slots = day) => {
  const h = hero(time, slots)
  return h ? `${h.slot.date} ${h.slot.name}` : null
}

describe('boardHero chooses the same Meal Slot as Today (TB-01)', () => {
  it('08:29: Breakfast, still ahead', () => {
    expect(named('08:29')).toBe(`${TODAY} Breakfast`)
  })
  it('08:30: Breakfast has gone, so the board shows Lunch (it used to keep a meal for 2 hours)', () => {
    expect(named('08:30')).toBe(`${TODAY} Lunch`)
  })
  it('the chapter\'s case, 14:44: Dinner, never Lunch', () => {
    expect(named('14:44')).toBe(`${TODAY} Dinner`)
  })
  it('19:00 and after: nothing is left today, so tomorrow\'s Breakfast', () => {
    expect(named('19:00')).toBe(`${TOMORROW} Breakfast`)
    expect(hero('23:59')?.day).toBe('tomorrow')
  })
  it('every clock picks what heroSelection (Today) picks', () => {
    for (const time of ['00:10', '08:29', '08:30', '12:59', '13:00', '14:44', '18:59', '19:00', '23:59']) {
      const sel = heroSelection(asPlan(day), clock(time), TODAY)
      const mine = hero(time)
      expect(mine && `${mine.slot.date}/${mine.slot.mealSlotId}`, time).toBe(sel && `${sel.slot.date}/${sel.slot.mealSlotId}`)
    }
  })
  it('skips a Cooked, Not cooked or Not served slot, and a slot with no Planned Meal', () => {
    const slots = [
      slotOn(TODAY, 1, 'Breakfast', '08:30', [course(1, 'Main', true, { meal: meal('Porridge', 'cooked') })]),
      slotOn(TODAY, 2, 'Lunch', '13:00', [course(1, 'Main', true, { meal: meal('Soup', 'skipped') })]),
      slotOn(TODAY, 3, 'Snack', '16:00', null, { notServed: true }),
      dinner(),
    ]
    expect(named('07:00', slots)).toBe(`${TODAY} Dinner`)
  })
  it('a slot whose Main is Cooked but whose Side is still planned stays the hero until its time', () => {
    const several = slotOn(TODAY, 3, 'Dinner', '19:00', [course(1, 'Main', true, { meal: meal('Roast chicken', 'cooked') }), course(2, 'Side', false, { meal: meal('Green beans') })])
    expect(named('17:00', [several])).toBe(`${TODAY} Dinner`)
  })
  it('is null when no slot with a Planned Meal is ahead', () => {
    expect(hero('20:00', [breakfast(), lunch(), dinner()])).toBeNull()
    expect(hero('07:00', [])).toBeNull()
  })
})

describe('boardHero eyebrow: Today\'s parts with the day word (TB 7, TB-08)', () => {
  it('before the start: "Today · Dinner · start 13:00"', () => {
    expect(hero('11:00', [dinner()])?.eyebrow).toEqual(['Today', 'Dinner', 'start 13:00'])
  })
  it('from the start time: "Today · Dinner · start now"', () => {
    expect(hero('14:44')?.eyebrow).toEqual(['Today', 'Dinner', 'start now'])
  })
  it('a slot with no start-by shows its time: "Today · Breakfast · 08:30"', () => {
    expect(hero('07:00')?.eyebrow).toEqual(['Today', 'Breakfast', '08:30'])
  })
  it('tomorrow: "Tomorrow · Breakfast"', () => {
    expect(hero('19:00')?.eyebrow).toEqual(['Tomorrow', 'Breakfast'])
  })
  it('a later day: the short weekday, the slot and its time ("Fri · Dinner · 19:00")', () => {
    const later = slotOn('2026-11-13', 3, 'Dinner', '19:00', 'Pasta al pomodoro')
    expect(hero('10:00', [later])?.eyebrow).toEqual(['Fri', 'Dinner', '19:00'])
    expect(hero('10:00', [later])?.day).toBe('later')
  })
  it('is Today\'s eyebrow plus the day word, from the same function (heroEyebrow)', () => {
    for (const time of ['07:00', '11:00', '14:44', '19:00']) {
      const slots = time === '11:00' ? [dinner()] : day
      const sel = heroSelection(asPlan(slots), clock(time), TODAY)!
      const board = hero(time, slots)!
      expect(board.eyebrow, time).toEqual(heroEyebrow(sel, clock(time)))
      if (sel.day === 'today') expect(board.eyebrow, time).toEqual(['Today', ...heroEyebrow(sel, clock(time), { onToday: true })])
    }
  })
  it('never says Tonight, whatever the slot: at breakfast time the board says Breakfast', () => {
    const h = hero('07:00')!
    expect(h.eyebrow.join(' ')).not.toMatch(/tonight/i)
    expect(h.eyebrow).toContain('Breakfast')
  })
})

describe('boardHero: the line under the Courses, the rows and Cook', () => {
  it('a slot that knows when to start says "Start 13:00 · ready 19:00" (the mock\'s line), also while it must start now', () => {
    expect(hero('11:00', [dinner()])?.startLine).toBe('Start 13:00 · ready 19:00')
    expect(hero('14:44')?.startLine).toBe('Start 13:00 · ready 19:00')
  })
  it('has no such line without a start-by, or for a slot that has no Cook timeline', () => {
    expect(hero('07:00')?.startLine).toBeNull()
    expect(hero('19:00')?.startLine).toBeNull()
  })
  it('lists the Courses that hold a Planned Meal, in the slot\'s order, the main one flagged', () => {
    const several = slotOn(TODAY, 3, 'Dinner', '19:00', [
      course(1, 'Main', true, { meal: meal('Roast chicken') }),
      course(2, 'Side', false, { meal: meal('Green beans') }),
      course(3, 'Dessert', false, { unserved: 'optional' }),
    ])
    expect(hero('10:00', [several])?.rows.map((r) => [r.recipeName, r.main])).toEqual([['Roast chicken', true], ['Green beans', false]])
  })
  it('Cook opens the Cook timeline of the hero slot, with no Course in the route: whatever day it is (a choice)', () => {
    expect(hero('14:44')?.cookPath).toBe(`/cook/meal/${TODAY}/3`)
    expect(hero('19:00')?.cookPath).toBe(`/cook/meal/${TOMORROW}/1`)
  })
})
