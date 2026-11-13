// DS-SHOP (docs/design/system.md §3, round 2): the sentence is said ONCE, above the list, short: "Thu and Fri Dinner aren't marked Cooked
// yet". The slots are named in bold (segments), on two lines at most. Slots that share a Meal Slot name share it.
import { describe, expect, it } from 'vitest'
import { makeLine, makeList, makePast } from '../testData'
import { unconfirmedNotice } from './notice'

const at = (date: string, id: number, name: string, courseName = '') => makePast({ date, mealSlotId: id, mealSlotName: name, courseName })
const tue = (c = '') => at('2026-11-03', 3, 'Dinner', c)
const wed = (c = '') => at('2026-11-04', 3, 'Dinner', c)
const wedLunch = (c = '') => at('2026-11-04', 1, 'Lunch', c)
const list = (...meals: ReturnType<typeof tue>[][]) => makeList({ lines: meals.map((m, i) => makeLine({ ingredientId: i + 1, pastPlannedMeals: m })) })

describe('unconfirmedNotice', () => {
  it('is null when no Line includes unconfirmed past meals', () => {
    expect(unconfirmedNotice(makeList())).toBeNull()
  })

  it('one slot: "Tue Dinner isn\'t marked Cooked yet", with the Mark it target and the number of Lines', () => {
    expect(unconfirmedNotice(list([tue()]))).toMatchObject({ text: "Tue Dinner isn't marked Cooked yet", count: 1, markIt: { date: '2026-11-03', mealSlotId: 3 } })
  })

  it('days of the same Meal Slot are merged: "Tue and Wed Dinner aren\'t marked Cooked yet"; Courses are not listed', () => {
    expect(unconfirmedNotice(list([tue('Main'), tue('Side')], [wed('Main')]))?.text).toBe("Tue and Wed Dinner aren't marked Cooked yet")
  })

  it('three days of one slot: "Mon, Tue and Wed Dinner"', () => {
    const mon = at('2026-11-02', 3, 'Dinner')
    expect(unconfirmedNotice(list([mon, tue(), wed()]))?.text).toBe("Mon, Tue and Wed Dinner aren't marked Cooked yet")
  })

  it('different Meal Slots stay apart, oldest first: "Tue Dinner and Wed Lunch aren\'t marked Cooked yet"', () => {
    expect(unconfirmedNotice(list([wedLunch(), tue()]))?.text).toBe("Tue Dinner and Wed Lunch aren't marked Cooked yet")
  })

  it('each slot once, however many Lines include it; count is the number of open Lines', () => {
    const n = unconfirmedNotice(list([tue()], [tue(), wedLunch()], []))
    expect(n?.text).toBe("Tue Dinner and Wed Lunch aren't marked Cooked yet")
    expect(n?.count).toBe(2)
  })

  it('segments name the slots in bold and the rest plain; they join to the text', () => {
    const n = unconfirmedNotice(list([tue(), wedLunch()]))!
    expect(n.segments).toEqual([
      { text: 'Tue Dinner', strong: true },
      { text: ' and ' },
      { text: 'Wed Lunch', strong: true },
      { text: " aren't marked Cooked yet" },
    ])
    expect(n.segments.map((s) => s.text).join('')).toBe(n.text)
  })

  it('a merged group is one bold run: "Tue and Wed Dinner"', () => {
    const n = unconfirmedNotice(list([tue(), wed()]))!
    expect(n.segments[0]).toEqual({ text: 'Tue and Wed Dinner', strong: true })
  })

  it('it never grows past two lines: at most three bold groups, then "and N more"', () => {
    const l = list([tue(), wedLunch(), at('2026-11-05', 2, 'Breakfast'), at('2026-11-06', 4, 'Snack'), at('2026-11-07', 5, 'Brunch')])
    const n = unconfirmedNotice(l)!
    expect(n.segments.filter((s) => s.strong)).toHaveLength(3)
    expect(n.text).toMatch(/ and 2 more aren't marked Cooked yet$/)
  })

  it('Mark it opens the oldest slot among all Lines', () => {
    expect(unconfirmedNotice(list([wedLunch()], [tue()]))?.markIt).toEqual({ date: '2026-11-03', mealSlotId: 3 })
  })

  it('ticked and Not needed Lines do not count: only what is still to get', () => {
    const l = makeList({
      lines: [makeLine({ ticked: true, quantity: 0, pastPlannedMeals: [tue()] })],
      notNeeded: [makeLine({ ingredientId: 5, pastPlannedMeals: [tue()] })],
    })
    expect(unconfirmedNotice(l)).toBeNull()
  })

  it('tolerates a list saved by an older version (no pastPlannedMeals)', () => {
    expect(unconfirmedNotice(makeList({ lines: [makeLine({ pastPlannedMeals: undefined })] }))).toBeNull()
  })
})
