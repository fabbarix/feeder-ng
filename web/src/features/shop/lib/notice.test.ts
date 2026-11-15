// B9-43 (SSP-04; mocks/ssp-04-notice.html): the notice says its predicate first, as a title: "Not marked Cooked yet", plus a count (the
// Meal Slots, one per day and slot), and under it the slots as plain meta text ("Sat Breakfast, Sat Lunch and Sat Dinner", "… and 2 more").
// The verb is never part of a clamped sentence. The old sentences ("isn't / aren't marked Cooked yet") are retired.
//   unconfirmedNotice(list) -> { title, count, slots: NoticeSegment[], markIt } | null     (no `text`, no `segments`)
import { describe, expect, it } from 'vitest'
import { shopStrings } from '../strings'
import { makeLine, makeList, makePast } from '../testData'
import { unconfirmedNotice } from './notice'

const at = (date: string, id: number, name: string, courseName = '') => makePast({ date, mealSlotId: id, mealSlotName: name, courseName })
const tue = (c = '') => at('2026-11-03', 3, 'Dinner', c)
const wed = (c = '') => at('2026-11-04', 3, 'Dinner', c)
const wedLunch = (c = '') => at('2026-11-04', 1, 'Lunch', c)
const list = (...meals: ReturnType<typeof tue>[][]) => makeList({ lines: meals.map((m, i) => makeLine({ ingredientId: i + 1, pastPlannedMeals: m })) })
const slotsText = (l: Parameters<typeof unconfirmedNotice>[0]) => unconfirmedNotice(l)!.slots.map((s) => s.text).join('')

describe('unconfirmedNotice (SSP-04)', () => {
  it('is null when no Line includes unconfirmed past meals', () => {
    expect(unconfirmedNotice(makeList())).toBeNull()
  })

  it('the title is "Not marked Cooked yet", whatever the slots, and the result has no sentence text any more', () => {
    const n = unconfirmedNotice(list([tue()]))!
    expect(n.title).toBe('Not marked Cooked yet')
    expect(n.title).toBe(shopStrings.notMarkedTitle)
    expect(n).not.toHaveProperty('text')
    expect(n).not.toHaveProperty('segments')
  })

  it('one slot: the slots line is that slot alone ("Tue Dinner"); count 1; Mark it opens it', () => {
    expect(unconfirmedNotice(list([tue()]))).toMatchObject({ count: 1, markIt: { date: '2026-11-03', mealSlotId: 3 } })
    expect(slotsText(list([tue()]))).toBe('Tue Dinner')
  })

  it('three slots of one day: "Sat Breakfast, Sat Lunch and Sat Dinner" with the count 3 (the mock)', () => {
    const sat = (id: number, name: string) => at('2026-11-07', id, name, 'Main')
    const l = list([sat(1, 'Breakfast'), sat(2, 'Lunch'), sat(3, 'Dinner')])
    expect(slotsText(l)).toBe('Sat Breakfast, Sat Lunch and Sat Dinner')
    expect(unconfirmedNotice(l)!.count).toBe(3)
  })

  it('the count is the number of Meal Slots to mark (one per day and slot), not the number of Lines nor of Courses', () => {
    const n = unconfirmedNotice(list([tue('Main'), tue('Side')], [tue('Main'), wedLunch()], []))!
    expect(n.count).toBe(2)
  })

  it('days of one Meal Slot are merged ("Tue and Wed Dinner") and Courses are not listed; the count still counts each day', () => {
    const l = list([tue('Main'), tue('Side')], [wed('Main')])
    expect(slotsText(l)).toBe('Tue and Wed Dinner')
    expect(unconfirmedNotice(l)!.count).toBe(2)
  })

  it('different Meal Slots stay apart, oldest first: "Tue Dinner and Wed Lunch"', () => {
    expect(slotsText(list([wedLunch(), tue()]))).toBe('Tue Dinner and Wed Lunch')
  })

  it('five slots: the first three, then "and 2 more"', () => {
    const l = list([tue(), wedLunch(), at('2026-11-05', 2, 'Breakfast'), at('2026-11-06', 4, 'Snack'), at('2026-11-07', 5, 'Brunch')])
    expect(slotsText(l)).toBe('Tue Dinner, Wed Lunch, Thu Breakfast and 2 more')
    expect(unconfirmedNotice(l)!.count).toBe(5)
  })

  it('four slots: "and 1 more"', () => {
    const l = list([tue(), wedLunch(), at('2026-11-05', 2, 'Breakfast'), at('2026-11-06', 4, 'Snack')])
    expect(slotsText(l)).toBe('Tue Dinner, Wed Lunch, Thu Breakfast and 1 more')
  })

  it('no run of the slots line is bold: running text is never set bold (no `strong` segments)', () => {
    const n = unconfirmedNotice(list([tue(), wedLunch()]))!
    expect(n.slots.some((s) => s.strong)).toBe(false)
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

describe('the retired notice sentences', () => {
  it('"isn\'t" and "arent" are gone from the strings (SSP-04 Copy)', () => {
    expect(shopStrings).not.toHaveProperty('isnt')
    expect(shopStrings).not.toHaveProperty('arent')
  })
})
