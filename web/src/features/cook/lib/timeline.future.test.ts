// B9-40 (PC-12): the timeline's title and Course menu for a meal on a future date.
import { describe, expect, it } from 'vitest'
import { timelineView } from '../timeline-fixtures'
import { courseMenuEntries, title } from './timeline'

// timelineView() is Dinner on 2026-11-10 (a Tuesday) with Main and Side to cook.
const view = timelineView()

describe('title (PC-12: a future meal\'s header names the day)', () => {
  it('several Courses of a future Dinner: "Tue 10 Dinner"', () => {
    expect(title(view, true, '2026-11-09')).toBe('Tue 10 Dinner')
  })
  it('today\'s Dinner keeps its name, and so does a title with no today yet', () => {
    expect(title(view, true, '2026-11-10')).toBe('Dinner')
    expect(title(view, true)).toBe('Dinner')
  })
  it('one Course keeps the Recipe name (choice: the day prefix is for the slot name only; the held line names the day)', () => {
    expect(title(view, false, '2026-11-09')).toBe('Roast chicken')
  })
})

describe('courseMenuEntries (PC-12: Mark <Course> as Cooked is hidden for a future date, Not cooked stays)', () => {
  it('may mark: both entries per Course, as before', () => {
    expect(courseMenuEntries(view, true).map((e) => e.label)).toEqual(['Mark Main as Cooked', 'Not cooked: Main', 'Mark Side as Cooked', 'Not cooked: Side'])
    expect(courseMenuEntries(view).map((e) => e.label)).toHaveLength(4)
  })
  it('may not mark: only the Not cooked entries remain', () => {
    expect(courseMenuEntries(view, false).map((e) => e.label)).toEqual(['Not cooked: Main', 'Not cooked: Side'])
    expect(courseMenuEntries(view, false).every((e) => e.action === 'notCooked')).toBe(true)
  })
})
