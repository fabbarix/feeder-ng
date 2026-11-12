// MS redesign: the pure model of the Meal Slots cards (grouping, usual values with the tie rule, differences, the 7-day strip, scaling).
import { describe, expect, it } from 'vitest'
import type { MealSlot, Member, SlotCourse } from '../types'
import { attendanceText, buildMealSlotCards, courseEatersText, datePartText, datesThatDiffer, daysLabel, differenceParts, pickUsual } from './mealSlotCards'

const member = (id: number, name: string): Member => ({ id, name, colour: '#336699', avatar: '', portionFactor: 1, userId: null, email: null })
const mia = member(1, 'Mia')
const fabio = member(2, 'Fabio')
const two = [mia, fabio]
const six = [mia, fabio, member(3, 'Sam'), member(4, 'Pia'), member(5, 'Nonna'), member(6, 'Zio Carlo')]

const eats = (...ids: number[]) => ids.map((memberId) => ({ memberId, portionFactorOverride: null }))
const course = (id: number, name: string, optional = false, optOutMemberIds: number[] = []): SlotCourse => ({ id, name, main: id === 1, optional, optOutMemberIds })
const main = course(1, 'Main')
const side = course(2, 'Side')
const starter = course(3, 'Starter')
const dessert = (optOut: number[] = []) => course(4, 'Dessert', true, optOut)

let nextId = 100
function slot(weekday: number, name: string, time: string, o: Partial<MealSlot> = {}): MealSlot {
  return { id: nextId++, weekday, name, time, portionsNeeded: 2, attendance: eats(1, 2), courses: [main, side], ...o }
}
const MONDAY = '2026-11-09'

/** The sample Household of the mockups: Dinner every day (Wed Fabio only, Fri 20:00 and Main only), Breakfast on the weekend, Lunch on Sunday. */
function sample(): MealSlot[] {
  const dinner = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    if (d === 3) return slot(d, 'Dinner', '19:30', { attendance: eats(2) })
    if (d === 5) return slot(d, 'Dinner', '20:00', { courses: [main] })
    return slot(d, 'Dinner', '19:30')
  })
  return [
    ...dinner,
    slot(6, 'Breakfast', '09:00', { courses: [main] }),
    slot(7, 'Breakfast', '09:30', { courses: [main] }),
    slot(7, 'Lunch', '13:00', { courses: [starter, main, dessert([2])] }),
  ]
}
const build = (slots: MealSlot[], members: Member[] = two, weekStart?: 1 | 6 | 7) => buildMealSlotCards(slots, members, { today: MONDAY, weekStart })
const card = (cards: ReturnType<typeof build>, name: string) => cards.find((c) => c.name === name)!

describe('pickUsual: the most common value, ties to the earliest weekday', () => {
  it('takes the majority', () => {
    expect(pickUsual([{ weekday: 1, key: 'a', value: 'A' }, { weekday: 2, key: 'b', value: 'B' }, { weekday: 3, key: 'b', value: 'B' }])).toBe('B')
  })
  it('a tie goes to the value on the earliest weekday, not the first entry', () => {
    expect(pickUsual([{ weekday: 7, key: '09:30', value: '09:30' }, { weekday: 6, key: '09:00', value: '09:00' }])).toBe('09:00')
  })
  it('ISO order decides, whatever the week start: Sunday (7) is after Monday (1)', () => {
    expect(pickUsual([{ weekday: 7, key: 'x', value: 'x' }, { weekday: 1, key: 'y', value: 'y' }])).toBe('y')
  })
  it('a lone value is the usual', () => {
    expect(pickUsual([{ weekday: 4, key: 'a', value: 1 }])).toBe(1)
  })
})

describe('buildMealSlotCards: grouping', () => {
  it('makes one card per name, case and edge spaces ignored, named as on the earliest weekday', () => {
    const cards = build([slot(2, ' dinner ', '19:30'), slot(1, 'Dinner', '19:30'), slot(3, 'DINNER', '19:30')])
    expect(cards).toHaveLength(1)
    expect(cards[0]!.name).toBe('Dinner')
    expect(cards[0]!.key).toBe('dinner')
    expect(cards[0]!.days).toEqual([1, 2, 3])
  })
  it('orders the cards by usual time, then name', () => {
    expect(build(sample()).map((c) => c.name)).toEqual(['Breakfast', 'Lunch', 'Dinner'])
    expect(build([slot(1, 'Tea', '16:00'), slot(1, 'Snack', '16:00'), slot(1, 'Lunch', '12:00')]).map((c) => c.name)).toEqual(['Lunch', 'Snack', 'Tea'])
  })
  it('has no cards without slots', () => {
    expect(build([])).toEqual([])
  })
  it('a name that runs one day only still gets a card (a half-width one)', () => {
    const cards = build([slot(2, 'Snack', '16:00')])
    expect(cards[0]!.days).toEqual([2])
    expect(cards[0]!.span).toBe('half')
  })
  it('a name that runs all seven days spans the full width', () => {
    expect(card(build(sample()), 'Dinner').span).toBe('full')
    expect(card(build(sample()), 'Lunch').span).toBe('half')
  })
})

describe('buildMealSlotCards: usual values', () => {
  it('Dinner: usual time 19:30 (5 of 7 days), usual Courses Main and Side, usual Attendance everyone', () => {
    const dinner = card(build(sample()), 'Dinner')
    expect(dinner.usualTime).toBe('19:30')
    expect(dinner.usualCourses.map((c) => c.name)).toEqual(['Main', 'Side'])
    expect(dinner.usualAttendance).toEqual({ state: 'everyone' })
  })
  it('Breakfast: 09:00 on Saturday and 09:30 on Sunday tie, so the earliest weekday (Saturday) wins', () => {
    expect(card(build(sample()), 'Breakfast').usualTime).toBe('09:00')
  })
  it('the tie rule holds when the slots are listed Sunday first', () => {
    expect(card(build(sample().reverse()), 'Breakfast').usualTime).toBe('09:00')
  })
  it('the tie rule uses ISO order even when the week starts on Sunday', () => {
    const cards = build([slot(7, 'Brunch', '11:30'), slot(1, 'Brunch', '11:00')], two, 7)
    expect(cards[0]!.usualTime).toBe('11:00')
  })
  it('Attendance is the most common set: Fabio only on 4 of 7 days makes "Fabio only" the usual, shown as some', () => {
    const slots = [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, 'Dinner', '19:30', { attendance: d <= 4 ? eats(2) : eats(1, 2) }))
    expect(card(build(slots), 'Dinner').usualAttendance).toEqual({ state: 'some', memberIds: [2] })
  })
  it('the Members list order is kept in "some", and a Member who no longer exists is ignored', () => {
    const slots = [slot(1, 'Dinner', '19:30', { attendance: eats(2, 1, 99) })]
    expect(card(build(slots, six), 'Dinner').usualAttendance).toEqual({ state: 'some', memberIds: [1, 2] })
  })
  it('an empty Attendance is "nobody"', () => {
    expect(card(build([slot(1, 'Dinner', '19:30', { attendance: [] })]), 'Dinner').usualAttendance).toEqual({ state: 'nobody' })
  })
  it('Attendance that lists only gone Members is "nobody" too', () => {
    expect(card(build([slot(1, 'Dinner', '19:30', { attendance: eats(99) })]), 'Dinner').usualAttendance).toEqual({ state: 'nobody' })
  })
  it('usual Courses keep the slot order, the optional flag and who eats an optional one ("Dessert: Mia only")', () => {
    const lunch = card(build(sample()), 'Lunch')
    expect(lunch.usualCourses).toEqual([
      { id: 3, name: 'Starter', optional: false, eaters: null },
      { id: 1, name: 'Main', optional: false, eaters: null },
      { id: 4, name: 'Dessert', optional: true, eaters: [1] },
    ])
  })
  it('a slot without a courses list has no Courses chips and never differs on Courses', () => {
    const cards = build([slot(1, 'Dinner', '19:30', { courses: undefined }), slot(2, 'Dinner', '19:30', { courses: [] })])
    expect(cards[0]!.usualCourses).toEqual([])
    expect(cards[0]!.differences).toEqual([])
  })
})

describe('buildMealSlotCards: what differs', () => {
  it('lists Wednesday (Fabio only) and Friday (20:00, Main only) on Dinner, in week order, with only the fields that differ', () => {
    const dinner = card(build(sample()), 'Dinner')
    expect(dinner.differences.map((d) => d.weekday)).toEqual([3, 5])
    expect(dinner.differences[0]).toMatchObject({ weekday: 3, attendance: { state: 'some', memberIds: [2] } })
    expect(dinner.differences[0]!.time).toBeUndefined()
    expect(dinner.differences[0]!.courses).toBeUndefined()
    expect(dinner.differences[1]).toMatchObject({ weekday: 5, time: '20:00' })
    expect(dinner.differences[1]!.courses).toEqual([{ id: 1, name: 'Main', optional: false, eaters: null }])
    expect(dinner.differences[1]!.attendance).toBeUndefined()
    expect(dinner.differences[1]!.slot.weekday).toBe(5)
  })
  it('the differences follow the week start (Sunday first puts Sunday before Monday)', () => {
    const slots = [1, 2, 3, 4, 7].map((d) => slot(d, 'Dinner', d === 1 || d === 7 ? '19:00' : '20:00'))
    const dinner = card(build(slots, two, 7), 'Dinner')
    expect(dinner.differences.map((d) => d.weekday)).toEqual([7, 1])
    expect(card(build(slots), 'Dinner').differences.map((d) => d.weekday)).toEqual([1, 7])
  })
  it('a name whose days all match has no differences', () => {
    expect(card(build(sample()), 'Lunch').differences).toEqual([])
  })
  it('a different opt-out on one day is a Courses difference', () => {
    const slots = [1, 2, 3].map((d) => slot(d, 'Lunch', '12:00', { courses: [main, dessert(d === 3 ? [1] : [])] }))
    expect(card(build(slots), 'Lunch').differences.map((d) => d.weekday)).toEqual([3])
  })
  it('a different Course order is a Courses difference', () => {
    const slots = [slot(1, 'Dinner', '19:00'), slot(2, 'Dinner', '19:00'), slot(3, 'Dinner', '19:00', { courses: [side, main] })]
    expect(card(build(slots), 'Dinner').differences.map((d) => d.weekday)).toEqual([3])
  })
})

describe('buildMealSlotCards: the 7-day strip', () => {
  it('has seven cells, Monday first, with "runs" cells carrying the slot and its time and "free" cells for the other days', () => {
    const breakfast = card(build(sample()), 'Breakfast')
    expect(breakfast.week.map((c) => c.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(breakfast.week.map((c) => c.state)).toEqual(['free', 'free', 'free', 'free', 'free', 'runs', 'runs'])
    const sunday = breakfast.week[6]!
    expect(sunday.state === 'runs' && sunday.time).toBe('09:30')
    expect(sunday.state === 'runs' && sunday.slot.weekday).toBe(7)
  })
  it('marks the days that differ', () => {
    const dinner = card(build(sample()), 'Dinner')
    expect(dinner.week.map((c) => c.state === 'runs' && c.differs)).toEqual([false, false, true, false, true, false, false])
  })
  it('starts at the week start (Sunday first)', () => {
    expect(card(build(sample(), two, 7), 'Dinner').week.map((c) => c.weekday)).toEqual([7, 1, 2, 3, 4, 5, 6])
  })
})

describe('buildMealSlotCards: the slot to edit and the date to change', () => {
  it('Edit opens the earliest weekday that holds the usual values, not an odd day', () => {
    const slots = [slot(1, 'Dinner', '21:00'), slot(2, 'Dinner', '19:30'), slot(3, 'Dinner', '19:30')]
    expect(card(build(slots), 'Dinner').editSlot.weekday).toBe(2)
  })
  it('falls back to the earliest weekday when no day holds every usual value', () => {
    // usual: 20:00 (Tue, Wed), Attendance tie of three different sets -> Monday's {Mia}; no day has both
    const slots = [slot(1, 'Dinner', '19:00', { attendance: eats(1) }), slot(2, 'Dinner', '20:00', { attendance: eats(1, 2) }), slot(3, 'Dinner', '20:00', { attendance: eats(2) })]
    const dinner = card(build(slots), 'Dinner')
    expect(dinner.usualTime).toBe('20:00')
    expect(dinner.usualAttendance).toEqual({ state: 'some', memberIds: [1] })
    expect(dinner.editSlot.weekday).toBe(1)
  })
  it('Change a date opens the soonest run: on Monday 9 Nov a Tue/Thu Dinner gives Tuesday 10 Nov', () => {
    const next = card(build([slot(4, 'Dinner', '19:30'), slot(2, 'Dinner', '19:30')]), 'Dinner').next
    expect(next.slot.weekday).toBe(2)
    expect(next.date).toBe('2026-11-10')
  })
  it('today counts: a Monday Dinner on Monday 9 Nov is today', () => {
    expect(card(build([slot(1, 'Dinner', '19:30'), slot(4, 'Dinner', '19:30')]), 'Dinner').next.date).toBe('2026-11-09')
  })
  it('wraps to next week: a Sunday-only name on Monday gives Sunday 15 Nov', () => {
    expect(card(build([slot(7, 'Lunch', '13:00')]), 'Lunch').next.date).toBe('2026-11-15')
  })
})

describe('buildMealSlotCards: scaling', () => {
  it('five names across the week give five cards in time order, each with a 7-cell strip', () => {
    const names: Array<[string, string]> = [['Breakfast', '08:00'], ['Elevenses', '11:00'], ['Lunch', '13:00'], ['Tea', '16:30'], ['Dinner', '19:30']]
    const slots = names.flatMap(([n, t]) => [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, n, t)))
    const cards = build(slots)
    expect(cards.map((c) => c.name)).toEqual(['Breakfast', 'Elevenses', 'Lunch', 'Tea', 'Dinner'])
    expect(cards.every((c) => c.week.length === 7 && c.span === 'full' && c.differences.length === 0)).toBe(true)
  })
  it('six Members: everyone stays "everyone", a subset is listed in Members order, and a Course can name its eaters', () => {
    const all = eats(1, 2, 3, 4, 5, 6)
    const cards = build(
      [slot(1, 'Dinner', '19:30', { attendance: all, courses: [main, dessert([3, 4])] }), slot(2, 'Dinner', '19:30', { attendance: eats(6, 5, 1), courses: [main, dessert([3, 4])] })],
      six,
    )
    const dinner = card(cards, 'Dinner')
    expect(dinner.usualAttendance).toEqual({ state: 'everyone' }) // tie: Monday wins
    expect(dinner.usualCourses[1]).toEqual({ id: 4, name: 'Dessert', optional: true, eaters: [1, 2, 5, 6] })
    expect(dinner.differences[0]).toMatchObject({ weekday: 2, attendance: { state: 'some', memberIds: [1, 5, 6] } })
  })
  it('a Course whose opt-outs are all outside the attendance has no named eaters', () => {
    const cards = build([slot(1, 'Dinner', '19:30', { attendance: eats(1), courses: [main, dessert([2])] })])
    expect(cards[0]!.usualCourses[1]!.eaters).toBeNull()
  })
})

describe('courseEatersText: the shorter of "only" and "without"', () => {
  const chip = (eaters: number[] | null) => ({ id: 4, name: 'Dessert', optional: true, eaters })
  it('names the eaters when that is shorter: "Dessert: Mia only" (Fabio opts out)', () => {
    expect(courseEatersText(chip([1]), two)).toBe('Dessert: Mia only')
  })
  it('names the opt-outs when that is shorter: "Dessert: without Sam" among Mia, Fabio and Sam', () => {
    expect(courseEatersText(chip([1, 2]), [...two, member(3, 'Sam')])).toBe('Dessert: without Sam')
  })
  it('with six Members and one opt-out it says "without"', () => {
    expect(courseEatersText(chip([1, 2, 3, 4, 5]), six)).toBe('Dessert: without Zio Carlo')
  })
  it('the opt-outs are taken from the usual Attendance: with Mia and Fabio only attending, Sam out of the room is not "without Sam"', () => {
    expect(courseEatersText(chip([1]), [...two, member(3, 'Sam')], { state: 'some', memberIds: [1, 2] })).toBe('Dessert: Mia only')
  })
  it('on a tie in length the "only" form wins ("Dessert: Anna only" = "Dessert: without A")', () => {
    const people = [member(1, 'Anna'), member(2, 'A')]
    expect(courseEatersText(chip([1]), people)).toBe('Dessert: Anna only')
  })
  it('is null when everyone who attends eats the Course', () => {
    expect(courseEatersText(chip(null), two)).toBeNull()
  })
})

describe('daysLabel', () => {
  it.each([
    [[1, 2, 3, 4, 5, 6, 7], 'Every day'],
    [[1, 2, 3, 4, 5], 'Weekdays'],
    [[6, 7], 'Weekend'],
    [[7], 'Sunday'],
    [[3], 'Wednesday'],
    [[1, 3], 'Mon, Wed'],
    [[1, 3, 5], 'Mon, Wed, Fri'],
    [[5, 1, 3], 'Mon, Wed, Fri'],
    [[2, 3, 4, 5, 6, 7], 'Tue, Wed, Thu, Fri, Sat, Sun'],
  ])('%j reads "%s"', (days, label) => expect(daysLabel(days as number[], 'en')).toBe(label))
})

describe('attendanceText', () => {
  it('names who eats, or says Everyone / Nobody attending', () => {
    expect(attendanceText({ state: 'everyone' }, two)).toBe('Everyone')
    expect(attendanceText({ state: 'nobody' }, two)).toBe('Nobody attending')
    expect(attendanceText({ state: 'some', memberIds: [2] }, two)).toBe('Fabio only')
    expect(attendanceText({ state: 'some', memberIds: [1, 3] }, six)).toBe('Mia, Sam only')
  })
})

describe('differenceParts', () => {
  it('Wednesday reads "Fabio only"; Friday reads "20:00" and "Main only"', () => {
    const dinner = card(build(sample()), 'Dinner')
    expect(differenceParts(dinner.differences[0]!, dinner, two)).toEqual(['Fabio only'])
    expect(differenceParts(dinner.differences[1]!, dinner, two)).toEqual(['20:00', 'Main only'])
  })
  it('Courses that are not a subset of the usual ones are listed, optional ones marked', () => {
    const slots = [slot(1, 'Dinner', '19:00'), slot(2, 'Dinner', '19:00'), slot(3, 'Dinner', '19:00', { courses: [starter, main, dessert()] })]
    const dinner = card(build(slots), 'Dinner')
    expect(differenceParts(dinner.differences[0]!, dinner, two)).toEqual(['Starter · Main · Dessert (optional)'])
  })
})

describe('datesThatDiffer', () => {
  const day = (date: string, slotName: string, o: object = {}) => ({ date, slotId: 1, slotName, ...o })
  const opts = { today: MONDAY, locale: 'en' }
  it('lists upcoming exceptions soonest first with a "Sat 14 Nov" label', () => {
    const rows = datesThatDiffer(
      [day('2026-11-15', 'Lunch', { time: '13:30', usualTime: '13:00' }), day('2026-11-14', 'Dinner', { notServed: true })],
      opts,
    )
    expect(rows.map((r) => [r.dateLabel, r.slotName])).toEqual([['Sat 14 Nov', 'Dinner'], ['Sun 15 Nov', 'Lunch']])
    expect(rows[0]!.parts).toEqual([{ kind: 'notServed' }])
    expect(rows[1]!.parts).toEqual([{ kind: 'time', time: '13:30', usualTime: '13:00' }])
  })
  it('leaves out past dates, keeps today, and drops an exception that differs in nothing', () => {
    const rows = datesThatDiffer([day('2026-11-08', 'Dinner', { notServed: true }), day(MONDAY, 'Dinner', { notServed: true }), day('2026-11-12', 'Lunch')], opts)
    expect(rows.map((r) => r.date)).toEqual([MONDAY])
  })
  it('one date can differ in several ways: Not served is the only part, otherwise time then attendance', () => {
    const rows = datesThatDiffer([day('2026-11-12', 'Dinner', { time: '20:15', usualTime: '19:30', attendeeIds: [2] })], opts)
    expect(rows[0]!.parts.map((p) => p.kind)).toEqual(['time', 'attendance'])
    expect(datesThatDiffer([day('2026-11-12', 'Dinner', { notServed: true, time: '20:15', usualTime: '19:30' })], opts)[0]!.parts).toEqual([{ kind: 'notServed' }])
  })
  it('on one date the rows go by slot name, and the list is capped at the limit (default 8)', () => {
    const rows = datesThatDiffer([day('2026-11-14', 'Lunch', { notServed: true }), day('2026-11-14', 'Dinner', { notServed: true })], opts)
    expect(rows.map((r) => r.slotName)).toEqual(['Dinner', 'Lunch'])
    const many = Array.from({ length: 12 }, (_, i) => day(`2026-11-${String(10 + i).padStart(2, '0')}`, 'Dinner', { notServed: true }))
    expect(datesThatDiffer(many, opts)).toHaveLength(8)
    expect(datesThatDiffer(many, { ...opts, limit: 3 })).toHaveLength(3)
  })
  it('no exceptions give no rows', () => {
    expect(datesThatDiffer([], opts)).toEqual([])
  })
  it('has a unique key per row', () => {
    const rows = datesThatDiffer([day('2026-11-14', 'Dinner', { notServed: true }), { ...day('2026-11-14', 'Dinner', { notServed: true }), slotId: 2 }], opts)
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })
})

describe('datePartText', () => {
  it('reads Not served, the time against the usual one, and who eats', () => {
    expect(datePartText({ kind: 'notServed' }, two)).toBe('Not served')
    expect(datePartText({ kind: 'time', time: '13:30', usualTime: '13:00' }, two)).toBe('13:30 · usually 13:00')
    expect(datePartText({ kind: 'attendance', attendeeIds: [2] }, two)).toBe('Fabio only')
    expect(datePartText({ kind: 'attendance', attendeeIds: [] }, two)).toBe('Nobody attending')
  })
})
