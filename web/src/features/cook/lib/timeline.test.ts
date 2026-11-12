// CRS F (spec 11): the SPA does no scheduling. It filters, numbers, labels and gates what the server sent.
import { describe, expect, it } from 'vitest'
import { MAIN_SCOPE, SIDE_SCOPE, item, sideOnly, timelineView, timer } from '../timeline-fixtures'
import {
  advanceGroups, courseMenuEntries, filterChips, holdingTimersFor, itemCaption, plannedClock, toCookStep, unresolvedCourses, visibleItems,
} from './timeline'

const view = timelineView()
const timerItem = (t: ReturnType<typeof timer>, seconds = 100) => ({ timer: t, seconds })

describe('visibleItems', () => {
  it('All is the timeline as sent, "Step n of 4" over all of it', () => {
    const shown = visibleItems(view, 'all')
    expect(shown.map((v) => [v.item.text, v.number, v.of])).toEqual([
      ['Brown the chicken', 1, 4],
      ['Simmer the beans', 2, 4],
      ['Roast in the oven', 3, 4],
      ['Toss the beans', 4, 4],
    ])
  })

  it('a Course shows only its items, in Recipe order, with its own position', () => {
    const shown = visibleItems(view, 2)
    expect(shown.map((v) => [v.item.text, v.number, v.of])).toEqual([
      ['Simmer the beans', 1, 2],
      ['Toss the beans', 2, 2],
    ])
  })

  it('a Course with no items shows none', () => {
    expect(visibleItems(view, 99)).toEqual([])
  })
})

describe('filterChips', () => {
  it('All, then a chip per Course that has items, in the slot order', () => {
    expect(filterChips(view)).toEqual([
      { id: 'all', label: 'All' },
      { id: 1, label: 'Main' },
      { id: 2, label: 'Side' },
    ])
  })

  it('a resolved Course gets no chip, and one Course alone needs none', () => {
    expect(filterChips(sideOnly())).toEqual([])
  })
})

describe('plannedClock', () => {
  it.each([
    ['19:00', 30, 0, '18:30'],
    ['19:00', 30, 1200, '18:50'],
    ['19:00', 30, 1799, '18:59'],
    ['19:30', 45, 600, '18:55'],
    ['00:10', 30, 0, '23:40'],
  ])('slot %s, total %i min, start %i s is %s', (time, total, start, clock) => {
    expect(plannedClock(time, total, start)).toBe(clock)
  })
})

describe('itemCaption', () => {
  it('names the Course and the Recipe when the timeline has more than one Course: "Side · Green beans"', () => {
    expect(itemCaption(view, view.items[1]!)).toBe('Side · Green beans')
    expect(itemCaption(view, view.items[0]!)).toBe('Main · Roast chicken')
  })

  it('is null for a one-Course timeline: it looks as before', () => {
    const one = sideOnly()
    expect(itemCaption(one, one.items[0]!)).toBeNull()
  })
})

describe('toCookStep (the existing Step tile takes it)', () => {
  it('a Step keeps its Recipe Step index, text, duration, uses, timer and after', () => {
    const v = visibleItems(view, 'all')[2]!
    expect(toCookStep(v)).toEqual({
      index: 1, number: 3, of: 4, kind: 'passive', text: 'Roast in the oven', durationMinutes: 20, imageUrl: '', uses: [],
      timer: { label: 'Roast chicken · Roast in the oven', durationSeconds: 1200 }, after: [0],
    })
  })

  it('a Reheat item is passive with no Step index; a Serve item is active', () => {
    const reheat = item({ kind: 'reheat', step: null, text: 'Reheat Tiramisu', durationMinutes: 3, timer: { label: 'Reheat', durationSeconds: 180 } })
    const serve = item({ kind: 'serve', step: null, text: 'Tiramisu: ready to serve', durationMinutes: 0 })
    expect(toCookStep({ item: reheat, number: 1, of: 2 })).toMatchObject({ index: -1, kind: 'passive', timer: { label: 'Reheat', durationSeconds: 180 } })
    expect(toCookStep({ item: serve, number: 2, of: 2 })).toMatchObject({ index: -1, kind: 'active', timer: null })
  })
})

describe('holdingTimersFor: Next is held only by the next item\'s own Course', () => {
  const sideNext = view.items[3]! // Side step 1, after [0]
  const mainNext = view.items[2]! // Main step 1, after [0]
  const sideStep0 = timerItem(timer({ id: 1, scope: SIDE_SCOPE, step: 0 }))
  const mainStep0 = timerItem(timer({ id: 2, scope: MAIN_SCOPE, step: 0 }))

  it('a running timer of the same Course\'s `after` Step holds', () => {
    expect(holdingTimersFor(sideNext, [sideStep0])).toEqual([sideStep0])
  })

  it('another Course\'s timer for the same Step index never holds (a Step never waits for another Course)', () => {
    expect(holdingTimersFor(sideNext, [mainStep0])).toEqual([])
    expect(holdingTimersFor(mainNext, [sideStep0])).toEqual([])
  })

  it('the main Course\'s timer holds like any Course\'s, by its three-part scope (crs-c3)', () => {
    expect(holdingTimersFor(mainNext, [mainStep0])).toEqual([mainStep0])
    const side = timerItem(timer({ id: 3, scope: 'meal:2026-11-10/4/2', step: 0 }))
    expect(holdingTimersFor(mainNext, [side])).toEqual([])
  })

  it('only Steps in `after` hold; a finished timer, a timer with no time left, or a Step that never started holds nothing', () => {
    expect(holdingTimersFor(sideNext, [timerItem(timer({ scope: SIDE_SCOPE, step: 1 }))])).toEqual([])
    expect(holdingTimersFor(sideNext, [timerItem(timer({ scope: SIDE_SCOPE, step: 0, state: 'finished' }), 0)])).toEqual([])
    expect(holdingTimersFor(sideNext, [timerItem(timer({ scope: SIDE_SCOPE, step: 0 }), 0)])).toEqual([])
    expect(holdingTimersFor(sideNext, [])).toEqual([])
  })

  it('a paused timer still holds', () => {
    const paused = timerItem(timer({ scope: SIDE_SCOPE, step: 0, state: 'paused', endsAt: null }), 200)
    expect(holdingTimersFor(sideNext, [paused])).toEqual([paused])
  })

  it('no next item, or an item with no `after`, holds nothing', () => {
    expect(holdingTimersFor(null, [sideStep0])).toEqual([])
    expect(holdingTimersFor(view.items[0]!, [mainStep0])).toEqual([])
  })
})

describe('advanceGroups', () => {
  const adv = (courseId: number, step: number, text: string, done = false) => ({
    courseId, scope: courseId === 1 ? MAIN_SCOPE : SIDE_SCOPE, step, text, leadTimeMinutes: 240, done, doneAt: done ? '2026-11-10T08:00:00Z' : null, warning: !done,
  })

  it('groups by Course in the slot order, Steps in order, naming the Course when several have them', () => {
    const groups = advanceGroups(timelineView({ advance: [adv(2, 0, 'Soak the beans'), adv(1, 1, 'Marinate'), adv(1, 0, 'Defrost', true)] }))
    expect(groups.map((g) => [g.courseName, g.named, g.items.map((i) => i.text)])).toEqual([
      ['Main', true, ['Defrost', 'Marinate']],
      ['Side', true, ['Soak the beans']],
    ])
  })

  it('one Course with Advance Steps is not named (as before)', () => {
    const groups = advanceGroups(timelineView({ advance: [adv(1, 0, 'Marinate')] }))
    expect(groups).toHaveLength(1)
    expect(groups[0]!.named).toBe(false)
  })

  it('none gives no groups', () => {
    expect(advanceGroups(view)).toEqual([])
  })
})

describe('the Course menu', () => {
  it('"Mark Main as Cooked" and "Not cooked: Main", then the same for Side', () => {
    expect(courseMenuEntries(view).map((e) => [e.id, e.courseId, e.action, e.label])).toEqual([
      ['cooked:1', 1, 'cooked', 'Mark Main as Cooked'],
      ['notCooked:1', 1, 'notCooked', 'Not cooked: Main'],
      ['cooked:2', 2, 'cooked', 'Mark Side as Cooked'],
      ['notCooked:2', 2, 'notCooked', 'Not cooked: Side'],
    ])
  })

  it('a resolved Course is not offered, and a slot with one Course left has no menu', () => {
    expect(courseMenuEntries(sideOnly())).toEqual([])
  })

  it('unresolvedCourses lists the Courses still to cook with whether they are fresh', () => {
    const v = timelineView()
    v.courses[1] = { ...v.courses[1]!, fresh: false }
    expect(unresolvedCourses(v)).toEqual([{ courseId: 1, fresh: true }, { courseId: 2, fresh: false }])
    expect(unresolvedCourses(sideOnly())).toEqual([{ courseId: 2, fresh: true }])
  })
})
