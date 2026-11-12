// Hand-made cards for the component tests (they must not depend on the lib under test). The mockups' sample Household: Mia and Fabio.
import type { DateRow, MealSlotCard, WeekCell } from '../lib/mealSlotCards'
import type { MealSlot, Member, SlotCourse } from '../types'

export const mia: Member = { id: 1, name: 'Mia', colour: '#3366cc', avatar: '', portionFactor: 1, userId: 1, email: null }
export const fabio: Member = { id: 2, name: 'Fabio', colour: '#e07a5f', avatar: '', portionFactor: 1, userId: null, email: null }
export const sam: Member = { id: 3, name: 'Sam', colour: '#81b29a', avatar: '', portionFactor: 1, userId: null, email: null }
export const pia: Member = { id: 4, name: 'Pia', colour: '#f2cc8f', avatar: '', portionFactor: 1, userId: null, email: null }
export const nonna: Member = { id: 5, name: 'Nonna', colour: '#9a8c98', avatar: '', portionFactor: 1, userId: null, email: null }
export const zio: Member = { id: 6, name: 'Zio Carlo', colour: '#6d597a', avatar: '', portionFactor: 1, userId: null, email: null }
export const twoMembers = [mia, fabio]
export const sixMembers = [mia, fabio, sam, pia, nonna, zio]

const everyone = [mia, fabio].map((m) => ({ memberId: m.id, portionFactorOverride: null }))
const main: SlotCourse = { id: 1, name: 'Main', main: true, optional: false, optOutMemberIds: [] }
const side: SlotCourse = { id: 2, name: 'Side', main: false, optional: false, optOutMemberIds: [] }

export const dinnerSlot = (weekday: number, over: Partial<MealSlot> = {}): MealSlot => ({
  id: 200 + weekday, weekday, name: 'Dinner', time: '19:30', portionsNeeded: 2, attendance: everyone, courses: [main, side], ...over,
})

const dinnerCells: WeekCell[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
  const slot =
    weekday === 3 ? dinnerSlot(3, { attendance: [everyone[1]!] }) : weekday === 5 ? dinnerSlot(5, { time: '20:00', courses: [main] }) : dinnerSlot(weekday)
  return { weekday, state: 'runs', slot, time: slot.time, differs: weekday === 3 || weekday === 5 }
})

/** Dinner: every day at 19:30 with Main and Side; Wednesday is Fabio only; Friday is at 20:00 and serves Main only. */
export const dinnerCard: MealSlotCard = {
  key: 'dinner',
  name: 'Dinner',
  days: [1, 2, 3, 4, 5, 6, 7],
  usualTime: '19:30',
  usualAttendance: { state: 'everyone' },
  usualCourses: [
    { id: 1, name: 'Main', optional: false, eaters: null },
    { id: 2, name: 'Side', optional: false, eaters: null },
  ],
  week: dinnerCells,
  differences: [
    { weekday: 3, slot: dinnerCells[2]!.state === 'runs' ? dinnerCells[2]!.slot : dinnerSlot(3), attendance: { state: 'some', memberIds: [2] } },
    { weekday: 5, slot: dinnerCells[4]!.state === 'runs' ? dinnerCells[4]!.slot : dinnerSlot(5), time: '20:00', courses: [{ id: 1, name: 'Main', optional: false, eaters: null }] },
  ],
  span: 'full',
  editSlot: dinnerSlot(1),
  next: { slot: dinnerSlot(1), date: '2026-11-09' },
}

const sundayLunch: MealSlot = { id: 300, weekday: 7, name: 'Lunch', time: '13:00', portionsNeeded: 2, attendance: everyone, courses: [] }

/** Lunch: Sunday only at 13:00 with Starter, Main and Dessert (optional, Mia only). */
export const lunchCard: MealSlotCard = {
  key: 'lunch',
  name: 'Lunch',
  days: [7],
  usualTime: '13:00',
  usualAttendance: { state: 'everyone' },
  usualCourses: [
    { id: 3, name: 'Starter', optional: false, eaters: null },
    { id: 1, name: 'Main', optional: false, eaters: null },
    { id: 4, name: 'Dessert', optional: true, eaters: [1] },
  ],
  week: [1, 2, 3, 4, 5, 6].map((weekday): WeekCell => ({ weekday, state: 'free' })).concat([{ weekday: 7, state: 'runs', slot: sundayLunch, time: '13:00', differs: false } as never]),
  differences: [],
  span: 'half',
  editSlot: sundayLunch,
  next: { slot: sundayLunch, date: '2026-11-15' },
}

/** A card whose usual Attendance is "Fabio only". */
export const fabioOnlyCard: MealSlotCard = { ...lunchCard, key: 'brunch', name: 'Brunch', usualAttendance: { state: 'some', memberIds: [2] } }
/** A card nobody attends. */
export const nobodyCard: MealSlotCard = { ...lunchCard, key: 'tea', name: 'Tea', usualAttendance: { state: 'nobody' } }

export const dateRows: DateRow[] = [
  { key: '2026-11-14#1', date: '2026-11-14', dateLabel: 'Sat 14 Nov', slotName: 'Dinner', parts: [{ kind: 'notServed' }] },
  { key: '2026-11-15#2', date: '2026-11-15', dateLabel: 'Sun 15 Nov', slotName: 'Lunch', parts: [{ kind: 'time', time: '13:30', usualTime: '13:00' }] },
]
