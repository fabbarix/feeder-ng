// CRS F review (spec 11): the rules TimelineCookScreen used to hold inline, now plain functions in lib/timeline
// (contract in docs/dev/design/crs-f.md, section 8). A chip whose Course has resolved falls back to All.
import { describe, expect, it } from 'vitest'
import { item, sideOnly, timelineView } from '../timeline-fixtures'
import type { TimelineView } from '../types'
import { allMode, canMark, confirmationName, effectiveFilter, finishedCooking, leaveIfNothingLeft, markTarget, title } from './timeline'

const two = [{ courseId: 1 }, { courseId: 2 }]
const mainOnly = (): TimelineView => {
  const v = timelineView()
  return { ...v, courses: [v.courses[0]!, { ...v.courses[1]!, state: 'cooked' }], items: v.items.filter((i) => i.courseId === 1) }
}

describe('effectiveFilter: a chip whose Course has no items left falls back to All', () => {
  it('All stays All', () => {
    expect(effectiveFilter(timelineView(), 'all')).toBe('all')
  })

  it('a Course with items keeps its chip', () => {
    expect(effectiveFilter(timelineView(), 2)).toBe(2)
  })

  it('a Course that was Cooked (no items, state cooked) falls back to All', () => {
    expect(effectiveFilter(mainOnly(), 2)).toBe('all')
  })

  it('a Course that is not in the timeline at all falls back to All', () => {
    expect(effectiveFilter(timelineView(), 99)).toBe('all')
  })

  it('the last Course on its own keeps its chip: the list is the same as All', () => {
    expect(effectiveFilter(sideOnly(), 2)).toBe(2)
  })

  it('a timeline with no items at all stays on All', () => {
    expect(effectiveFilter(timelineView({ items: [] }), 1)).toBe('all')
  })
})

describe('allMode: the last item of All offers Mark all Cooked', () => {
  it('All over two or more unresolved Courses', () => {
    expect(allMode('all', two)).toBe(true)
  })
  it('not for a Course chip', () => {
    expect(allMode(2, two)).toBe(false)
  })
  it('not for one unresolved Course', () => {
    expect(allMode('all', [{ courseId: 2 }])).toBe(false)
    expect(allMode('all', [])).toBe(false)
  })
})

describe('markTarget: the Course Mark as Cooked cooks', () => {
  it('none in all mode (the whole slot)', () => {
    expect(markTarget(true, 1, two)).toBeNull()
  })
  it('the Course of the item on screen', () => {
    expect(markTarget(false, 2, two)).toBe(2)
  })
  it('without an item on screen, the first unresolved Course', () => {
    expect(markTarget(false, null, two)).toBe(1)
  })
  it('nothing unresolved and no item: none', () => {
    expect(markTarget(false, null, [])).toBeNull()
  })
})

describe('canMark: Mark (all) as Cooked is offered only for a day that may be resolved, with something to cook', () => {
  it('today or past, with an unresolved Course', () => {
    expect(canMark('2026-11-10', '2026-11-10', two)).toBe(true)
    expect(canMark('2026-11-09', '2026-11-10', two)).toBe(true)
  })
  it('never for a future day', () => {
    expect(canMark('2026-11-11', '2026-11-10', two)).toBe(false)
  })
  it('never on an empty list: nothing unresolved', () => {
    expect(canMark('2026-11-10', '2026-11-10', [])).toBe(false)
  })
  it('an unknown household date offers nothing', () => {
    expect(canMark('2026-11-10', '', two)).toBe(false)
  })
})

describe('finishedCooking: the confirmation page replaces the screen', () => {
  const base = { cookedAny: true, notCookable: false, loaded: true, unresolvedCount: 0 }
  it('something was Cooked here and no Course is left', () => {
    expect(finishedCooking(base)).toBe(true)
  })
  it('or the server answered not_cookable after it', () => {
    expect(finishedCooking({ ...base, notCookable: true, loaded: false, unresolvedCount: 0 })).toBe(true)
  })
  it('the screen stays while a Course remains', () => {
    expect(finishedCooking({ ...base, unresolvedCount: 1 })).toBe(false)
  })
  it('nothing Cooked here: never (a Course skipped or cooked elsewhere shows the usual states)', () => {
    expect(finishedCooking({ ...base, cookedAny: false })).toBe(false)
    expect(finishedCooking({ ...base, cookedAny: false, notCookable: true })).toBe(false)
  })
  it('before the timeline has loaded and without not_cookable: not finished', () => {
    expect(finishedCooking({ ...base, loaded: false })).toBe(false)
  })
})

describe('leaveIfNothingLeft: after skipping a Course (Not cooked)', () => {
  it('skipping the only Course left with nothing Cooked here leaves Cook Mode', () => {
    expect(leaveIfNothingLeft(1, false)).toBe('leave')
    expect(leaveIfNothingLeft(0, false)).toBe('leave')
  })
  it('other Courses remain: refresh the timeline', () => {
    expect(leaveIfNothingLeft(2, false)).toBe('refresh')
  })
  it('something was Cooked here: the confirmation takes over, so refresh', () => {
    expect(leaveIfNothingLeft(1, true)).toBe('refresh')
  })
})

describe('title: the header of Cook Mode', () => {
  it('the slot name when the timeline has several Courses', () => {
    expect(title(timelineView(), true)).toBe('Dinner')
  })
  it('the Recipe of the Course still to cook for one Course', () => {
    expect(title(sideOnly(), false)).toBe('Green beans')
  })
  it('the slot name when no Course is planned any more', () => {
    const v = timelineView()
    expect(title({ ...v, courses: v.courses.map((c) => ({ ...c, state: 'cooked' as const })), items: [item()] }, false)).toBe('Dinner')
  })
})

describe('confirmationName: the confirmation page names what was Cooked', () => {
  it('several Courses Cooked together: the slot name', () => {
    expect(confirmationName(timelineView(), [1, 2])).toBe('Dinner')
  })
  it('one Course Cooked: its Recipe, not the first Course of the slot', () => {
    expect(confirmationName(sideOnly(), [2])).toBe('Green beans')
    expect(confirmationName(timelineView(), [1])).toBe('Roast chicken')
  })
  it('no view or nothing Cooked: the slot name, or empty without a view', () => {
    expect(confirmationName(undefined, [1])).toBe('')
    expect(confirmationName(timelineView(), [])).toBe('Dinner')
  })
})
