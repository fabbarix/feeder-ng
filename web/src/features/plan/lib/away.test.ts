// B9-46 (PC-08, SET-16): the words and models of an Away. Dates: Sun 15 Nov 2026 is the Household's today; Tue 17, Wed 18, Thu 19 are the Away.
import { describe, expect, it } from 'vitest'
import type { Away, AwayPreview, AwayPreviewSlot, AwaySlotRef } from '../types'
import {
  awayBody,
  awayButtonNames,
  awayChangedBody,
  awayCompact,
  awayDayModel,
  awayDraft,
  awayFooter,
  awayPreviewModel,
  awayRange,
  awayRangeShort,
  awaySheetContext,
  awaySheetTitle,
  awaySlotOptions,
  awaySpan,
  awayToast,
  formatPortions,
} from './away'

/** Breakfast, Lunch and Dinner on every weekday: ids are weekday * 10 + 1, 2, 3 (Tue: 21, 22, 23). */
const slots: AwaySlotRef[] = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
  { id: weekday * 10 + 1, weekday, name: 'Breakfast', time: '08:30' },
  { id: weekday * 10 + 2, weekday, name: 'Lunch', time: '13:00' },
  { id: weekday * 10 + 3, weekday, name: 'Dinner', time: '19:00' },
])
const away = (over: Partial<Away> = {}): Away => ({
  id: 9, memberId: 2, memberName: 'Ben', from: '2026-11-17', fromMealSlotId: null, through: '2026-11-19', throughMealSlotId: null, started: false, ...over,
})

describe('formatPortions', () => {
  it('drops trailing zeros and says "portion" for exactly one', () => {
    expect(formatPortions(1.75)).toBe('1.75 portions')
    expect(formatPortions(1)).toBe('1 portion')
    expect(formatPortions(0.5)).toBe('0.5 portions')
    expect(formatPortions(2)).toBe('2 portions')
    expect(formatPortions(0)).toBe('0 portions')
  })
})

describe('awayRange', () => {
  it('reads "Tue 17 – Thu 19 Nov" inside a month and names both months across two', () => {
    expect(awayRange({ from: '2026-11-17', through: '2026-11-19' })).toBe('Tue 17 – Thu 19 Nov')
    expect(awayRange({ from: '2026-11-27', through: '2026-12-01' })).toBe('Fri 27 Nov – Tue 1 Dec')
  })
  it('is one date for one day, "From …" with no last day yet, and names the year only when it differs', () => {
    expect(awayRange({ from: '2026-11-17', through: '2026-11-17' })).toBe('Tue 17 Nov')
    expect(awayRange({ from: '2026-12-01', through: null })).toBe('From Tue 1 Dec')
    expect(awayRange({ from: '2026-12-28', through: '2027-01-01' })).toBe('Mon 28 Dec 2026 – Fri 1 Jan 2027')
  })
})

describe('awayRangeShort (the away row of Who\'s eating)', () => {
  it('drops the month when both days share it', () => {
    expect(awayRangeShort({ from: '2026-11-17', through: '2026-11-19' })).toBe('Tue 17 – Thu 19')
    expect(awayRangeShort({ from: '2026-11-27', through: '2026-12-01' })).toBe('Fri 27 Nov – Tue 1 Dec')
    expect(awayRangeShort({ from: '2026-11-17', through: '2026-11-17' })).toBe('Tue 17')
    expect(awayRangeShort({ from: '2026-12-01', through: null })).toBe('from Tue 1 Dec')
  })
})

describe('awayCompact (names of buttons)', () => {
  it('is the days and the month, no weekday', () => {
    expect(awayCompact({ from: '2026-11-12', through: '2026-11-19' })).toBe('12–19 Nov')
    expect(awayCompact({ from: '2026-11-27', through: '2026-12-01' })).toBe('27 Nov – 1 Dec')
    expect(awayCompact({ from: '2026-11-12', through: '2026-11-12' })).toBe('12 Nov')
    expect(awayCompact({ from: '2026-12-01', through: null })).toBe('from 1 Dec')
  })
})

describe('awaySpan (the toast subline)', () => {
  it('whole days name the first Meal Slot of the first day and the last of the last', () => {
    expect(awaySpan(away(), slots)).toBe('Tue 17 Breakfast – Thu 19 Dinner')
  })
  it('a named Meal Slot is that one', () => {
    expect(awaySpan(away({ fromMealSlotId: 23, throughMealSlotId: 42 }), slots)).toBe('Tue 17 Dinner – Thu 19 Lunch')
  })
  it('no last day yet reads "From …"', () => {
    expect(awaySpan(away({ through: null }), slots)).toBe('From Tue 17 Breakfast')
  })
  it('one whole day names its first and last Meal Slot, and a single Meal Slot only once', () => {
    expect(awaySpan(away({ through: '2026-11-17' }), slots)).toBe('Tue 17 Breakfast – Dinner')
    expect(awaySpan(away({ through: '2026-11-17', fromMealSlotId: 23 }), slots)).toBe('Tue 17 Dinner')
  })
  it('a day with no Meal Slot is just the date', () => {
    const tueOnly = slots.filter((s) => s.weekday === 2)
    expect(awaySpan(away({ from: '2026-11-16', through: '2026-11-17' }), tueOnly)).toBe('Mon 16 – Tue 17 Dinner')
  })
})

describe('awaySlotOptions (the From and Through selects)', () => {
  it('From: the first Meal Slot of the date is the whole day', () => {
    expect(awaySlotOptions('2026-11-17', slots, 'first')).toEqual([
      { value: '', label: 'Breakfast (whole day)' },
      { value: '22', label: 'Lunch' },
      { value: '23', label: 'Dinner' },
    ])
  })
  it('Through: the last Meal Slot of the date is the whole day', () => {
    expect(awaySlotOptions('2026-11-17', slots, 'last')).toEqual([
      { value: '21', label: 'Breakfast' },
      { value: '22', label: 'Lunch' },
      { value: '', label: 'Dinner (whole day)' },
    ])
  })
  it('a weekday with no Meal Slot has no options', () => {
    expect(awaySlotOptions('2026-11-17', slots.filter((s) => s.weekday !== 2), 'first')).toEqual([])
  })
})

/** A slot of a plan day as the API sends it. */
const ps = (id: number, over: Record<string, unknown> = {}) => ({ mealSlotId: id, portions: 1.75, guests: 0, away: [] as number[], everyoneAway: false, notServed: false, ...over })
const ben = away()
const chiara = away({ id: 10, memberId: 3, memberName: 'Chiara' })

describe('awayDayModel (the day tile)', () => {
  it('a whole-day Away is said once, under the day: "Ben away all day · 1.75 portions"; the slots say nothing', () => {
    const m = awayDayModel([ps(21, { away: [2] }), ps(22, { away: [2] }), ps(23, { away: [2], portions: 3.75, guests: 2 })], [ben])
    expect(m.lines).toEqual([{ memberId: 2, awayId: 9, text: 'Ben away all day · 1.75 portions' }])
    expect(m.slotLabels).toEqual({})
  })
  it('a part-day Away shows "Ben away" on the Meal Slots it covers', () => {
    const m = awayDayModel([ps(21), ps(22), ps(23, { away: [2] })], [ben])
    expect(m.lines).toEqual([])
    expect(m.slotLabels).toEqual({ 23: { text: 'Ben away', everyone: false } })
  })
  it('names two or three Members in one label', () => {
    const anna = away({ id: 11, memberId: 1, memberName: 'Anna' })
    expect(awayDayModel([ps(23, { away: [2, 3] })], [ben, chiara]).slotLabels[23]).toEqual({ text: 'Ben and Chiara away', everyone: false })
    expect(awayDayModel([ps(23, { away: [1, 2, 3] })], [anna, ben, chiara]).slotLabels[23]!.text).toBe('Anna, Ben and Chiara away')
  })
  it('each whole-day Member has a line of their own, "1 portion" in the singular', () => {
    const m = awayDayModel([ps(21, { away: [2, 3], portions: 1 }), ps(23, { away: [2, 3], portions: 1 })], [ben, chiara])
    expect(m.lines.map((l) => l.text)).toEqual(['Ben away all day · 1 portion', 'Chiara away all day · 1 portion'])
    expect(m.lines.map((l) => l.awayId)).toEqual([9, 10])
  })
  it('leaves the portions out when the slots differ (guests aside)', () => {
    const m = awayDayModel([ps(21, { away: [2] }), ps(23, { away: [2], portions: 2.5 })], [ben])
    expect(m.lines[0]!.text).toBe('Ben away all day')
  })
  it('a Meal Slot that is Not served does not count against "all day"', () => {
    const m = awayDayModel([ps(21, { notServed: true }), ps(22, { away: [2] }), ps(23, { away: [2] })], [ben])
    expect(m.lines.map((l) => l.text)).toEqual(['Ben away all day · 1.75 portions'])
  })
  it('a day everyone is away: each Member\'s line says only who is away, never "· 0 portions" (B9-55, w6a note 2)', () => {
    const m = awayDayModel([ps(21, { away: [2, 3], everyoneAway: true, portions: 0 }), ps(23, { away: [2, 3], everyoneAway: true, portions: 0 })], [ben, chiara])
    expect(m.lines.map((l) => l.text)).toEqual(['Ben away all day', 'Chiara away all day'])
  })
  it('a slot where everyone is away says "Everyone is away"', () => {
    const m = awayDayModel([ps(23, { away: [2, 3], everyoneAway: true })], [ben, chiara])
    expect(m.slotLabels[23]).toEqual({ text: 'Everyone is away', everyone: true })
  })
  it('a Member the plan does not list an Away for is not named; no Away at all gives nothing', () => {
    expect(awayDayModel([ps(23, { away: [7] })], [ben])).toEqual({ lines: [], slotLabels: {} })
    expect(awayDayModel([ps(23)], [])).toEqual({ lines: [], slotLabels: {} })
  })
})

const slot = (mealSlotId: number, mealSlotName: string, before: number, after: number, over: Partial<AwayPreviewSlot> = {}): AwayPreviewSlot => ({
  mealSlotId, mealSlotName, time: '19:00', portionsBefore: before, portionsAfter: after, changes: before !== after, back: false, ...over,
})
/** The mock's example: 9 Meal Slots without Ben, 6 meals change. */
const preview: AwayPreview = {
  slotsWithout: 9,
  mealsChanged: 6,
  beyondHorizon: null,
  days: [
    { date: '2026-11-17', slots: [slot(21, 'Breakfast', 2.75, 1.75), slot(22, 'Lunch', 2.75, 1.75), slot(23, 'Dinner', 2.75, 1.75)] },
    { date: '2026-11-18', slots: [slot(31, 'Breakfast', 1.75, 1.75), slot(32, 'Lunch', 1.75, 1.75), slot(33, 'Dinner', 2.75, 1.75)] },
    { date: '2026-11-19', slots: [slot(41, 'Breakfast', 1.75, 1.75), slot(42, 'Lunch', 2.75, 1.75), slot(43, 'Dinner', 2.75, 1.75)] },
  ],
}

describe('awayPreviewModel ("What changes")', () => {
  const ctx = { name: 'Ben', planEnd: '2026-11-21' }
  it('the summary row counts Meal Slots and meals; the rows are by day, then Unchanged', () => {
    const m = awayPreviewModel(preview, ctx)
    expect(m.summary).toBe('9 Meal Slots without Ben · 6 meals change')
    expect(m.rows).toEqual([
      { key: 'Tue 17', state: '3 meals', detail: 'Breakfast, Lunch, Dinner · 2.75 → 1.75 portions' },
      { key: 'Wed 18', state: '1 meal', detail: 'Dinner · 2.75 → 1.75 portions' },
      { key: 'Thu 19', state: '2 meals', detail: 'Lunch, Dinner · 2.75 → 1.75 portions' },
      { key: 'Unchanged', state: '3 Meal Slots', detail: 'Wed Breakfast and Lunch, Thu Breakfast · portions stay the same' },
    ])
    expect(m.note).toBeNull()
  })
  it('a day whose Meal Slots change differently names each', () => {
    const p: AwayPreview = { ...preview, slotsWithout: 2, mealsChanged: 2, days: [{ date: '2026-11-17', slots: [slot(21, 'Breakfast', 2.75, 1.75), slot(22, 'Lunch', 2, 1)] }] }
    expect(awayPreviewModel(p, ctx).rows).toEqual([{ key: 'Tue 17', state: '2 meals', detail: 'Breakfast 2.75 → 1.75 · Lunch 2 → 1 portions' }])
  })
  it('singular counts', () => {
    const p: AwayPreview = { ...preview, slotsWithout: 1, mealsChanged: 1, days: [{ date: '2026-11-17', slots: [slot(23, 'Dinner', 2.75, 1.75)] }] }
    expect(awayPreviewModel(p, ctx).summary).toBe('1 Meal Slot without Ben · 1 meal changes')
  })
  it('nothing changes: the summary says so, with no Unchanged row without a Meal Slot to name', () => {
    const p: AwayPreview = { ...preview, slotsWithout: 1, mealsChanged: 0, days: [{ date: '2026-11-17', slots: [slot(23, 'Dinner', 1.75, 1.75)] }] }
    const m = awayPreviewModel(p, ctx)
    expect(m.summary).toBe('1 Meal Slot without Ben · no meals change')
    expect(m.rows).toEqual([{ key: 'Unchanged', state: '1 Meal Slot', detail: 'Tue Dinner · portions stay the same' }])
  })
  it('an Away past the plan: nothing in this week changes, and the note says from when the planner leaves Ben out', () => {
    const p: AwayPreview = { slotsWithout: 0, mealsChanged: 0, days: [], beyondHorizon: '2026-12-01' }
    const m = awayPreviewModel(p, ctx)
    expect(m.summary).toBe("Nothing in this week's plan changes")
    expect(m.rows).toEqual([])
    expect(m.note).toBe('The plan runs to Sat 21. From Tue 1 Dec the planner plans without Ben.')
  })
  it('an Away that starts in the plan and goes on past it adds only the second sentence', () => {
    const m = awayPreviewModel({ ...preview, beyondHorizon: '2026-11-22' }, ctx)
    expect(m.note).toBe('From Sun 22 Nov the planner plans without Ben.')
    expect(m.rows).toHaveLength(4)
  })
  it('a Meal Slot given back by a changed Away is a meal that changes, in its day', () => {
    const p: AwayPreview = { slotsWithout: 0, mealsChanged: 1, beyondHorizon: null, days: [{ date: '2026-11-18', slots: [slot(33, 'Dinner', 1.75, 2.75, { back: true })] }] }
    expect(awayPreviewModel(p, ctx).rows).toEqual([{ key: 'Wed 18', state: '1 meal', detail: 'Dinner · 1.75 → 2.75 portions' }])
  })
})

describe('awayChangedBody (the toast body)', () => {
  it('names the meals by day when they all change to the same portions', () => {
    expect(awayChangedBody(preview)).toBe('6 meals changed to 1.75 portions: Tue Breakfast, Lunch and Dinner; Wed Dinner; Thu Lunch and Dinner.')
  })
  it('one meal', () => {
    const p: AwayPreview = { ...preview, slotsWithout: 1, mealsChanged: 1, days: [{ date: '2026-11-17', slots: [slot(23, 'Dinner', 2.75, 1.75)] }] }
    expect(awayChangedBody(p)).toBe('1 meal changed to 1.75 portions: Tue Dinner.')
  })
  it('different portions after: no "to …"', () => {
    const p: AwayPreview = { ...preview, mealsChanged: 2, days: [{ date: '2026-11-17', slots: [slot(21, 'Breakfast', 2.75, 1.75), slot(22, 'Lunch', 2, 1)] }] }
    expect(awayChangedBody(p)).toBe('2 meals changed: Tue Breakfast and Lunch.')
  })
  it('no meal changes: nothing to say', () => {
    expect(awayChangedBody({ slotsWithout: 0, mealsChanged: 0, days: [], beyondHorizon: '2026-12-01' })).toBeNull()
  })
})

describe('awayToast (R-D, R-D+: headline, subline, body; no icon)', () => {
  const ctx = { away: away(), slots, today: '2026-11-15' }
  it('created: "Ben is away", the span as the subline, the changed meals as the body', () => {
    expect(awayToast('created', { ...ctx, preview })).toEqual({
      headline: 'Ben is away',
      subline: 'Tue 17 Breakfast – Thu 19 Dinner',
      body: '6 meals changed to 1.75 portions: Tue Breakfast, Lunch and Dinner; Wed Dinner; Thu Lunch and Dinner.',
    })
  })
  it('created without a dry run has no body', () => {
    expect(awayToast('created', ctx).body).toBeUndefined()
  })
  it('changed', () => {
    expect(awayToast('changed', ctx)).toMatchObject({ headline: "Ben's Away changed", subline: 'Tue 17 Breakfast – Thu 19 Dinner' })
  })
  it('ended: "Back from Dinner today" when Lunch was the last Meal Slot missed', () => {
    const ended = away({ from: '2026-11-15', through: '2026-11-17', throughMealSlotId: 22, started: true })
    expect(awayToast('ended', { ...ctx, away: ended, today: '2026-11-17' })).toMatchObject({ headline: "Ben's Away ended", subline: 'Back from Dinner today' })
  })
  it('ended after the day\'s last Meal Slot: back from the next day\'s first', () => {
    const ended = away({ from: '2026-11-15', through: '2026-11-17', throughMealSlotId: 23, started: true })
    expect(awayToast('ended', { ...ctx, away: ended, today: '2026-11-17' }).subline).toBe('Back from Wed Breakfast')
  })
  it('removed: a light removal; its Undo says "Ben\'s Away is back"', () => {
    expect(awayToast('removed', ctx)).toEqual({ headline: "Ben's Away removed", restored: "Ben's Away is back" })
  })
})

describe('the sheet\'s words', () => {
  it('title: "Someone is away" with the Who pills, "<Name> is away" for a fixed Member', () => {
    expect(awaySheetTitle()).toBe('Someone is away')
    expect(awaySheetTitle('Ben')).toBe('Ben is away')
  })
  it('context: from a Meal Slot, from the Member page, or the Away being edited', () => {
    expect(awaySheetContext({ from: 'Tue 17 Breakfast' })).toBe('From Tue 17 Breakfast')
    expect(awaySheetContext({ memberName: 'Ben', from: 'Tue 17 Breakfast' })).toBe('Ben · from Tue 17 Breakfast')
    expect(awaySheetContext({ memberName: 'Ben' })).toBe('New Away')
    expect(awaySheetContext({})).toBeNull()
    expect(awaySheetContext({ memberName: 'Ben', away: { from: '2026-11-17', through: '2026-11-19' } })).toBe('Tue 17 – Thu 19 Nov')
  })
  it('footer: Save Away for a new one; Save with Remove Away before the start, End today once it has started', () => {
    expect(awayFooter(null)).toEqual({ save: 'Save Away', extra: null })
    expect(awayFooter({ started: false })).toEqual({ save: 'Save', extra: 'remove' })
    expect(awayFooter({ started: true })).toEqual({ save: 'Save', extra: 'end' })
  })
  it('the extra buttons are named by their Away (rule P38: every button on a page has a unique name)', () => {
    expect(awayButtonNames({ from: '2026-11-12', through: '2026-11-19', memberName: 'Ben' })).toEqual({
      remove: 'Remove Away 12–19 Nov for Ben',
      end: 'End today: Away 12–19 Nov for Ben',
    })
    expect(awayButtonNames({ from: '2026-12-01', through: null, memberName: 'Ben' }).remove).toBe('Remove Away from 1 Dec for Ben')
  })
})

describe('the sheet\'s draft and its request body', () => {
  it('a new Away starts today, whole days, with a last day', () => {
    expect(awayDraft({ today: '2026-11-15', slots })).toEqual({ memberId: null, from: '2026-11-15', fromMealSlotId: null, through: '2026-11-15', throughMealSlotId: null, noLastDay: false })
    expect(awayDraft({ today: '2026-11-15', slots, memberId: 2 }).memberId).toBe(2)
  })
  it('from a Meal Slot: its date; the first Meal Slot of the day is the whole day, another one is named', () => {
    expect(awayDraft({ today: '2026-11-15', slots, from: { date: '2026-11-17', mealSlotId: 21 } })).toMatchObject({ from: '2026-11-17', fromMealSlotId: null, through: '2026-11-17' })
    expect(awayDraft({ today: '2026-11-15', slots, from: { date: '2026-11-17', mealSlotId: 23 } })).toMatchObject({ from: '2026-11-17', fromMealSlotId: 23 })
  })
  it('editing mirrors the Away; no last day yet turns the switch on', () => {
    expect(awayDraft({ today: '2026-11-15', slots, away: away({ fromMealSlotId: 23, throughMealSlotId: 42 }) })).toEqual({ memberId: 2, from: '2026-11-17', fromMealSlotId: 23, through: '2026-11-19', throughMealSlotId: 42, noLastDay: false })
    expect(awayDraft({ today: '2026-11-15', slots, away: away({ through: null }) })).toMatchObject({ through: '2026-11-17', noLastDay: true })
  })
  const draft = { memberId: 2, from: '2026-11-17', fromMealSlotId: null, through: '2026-11-19', throughMealSlotId: 42, noLastDay: false }
  it('create sends the first day and the last; "No last day yet" leaves them out', () => {
    expect(awayBody(draft, 'create')).toEqual({ from: '2026-11-17', fromMealSlotId: null, through: '2026-11-19', throughMealSlotId: 42 })
    expect(awayBody({ ...draft, noLastDay: true }, 'create')).toEqual({ from: '2026-11-17', fromMealSlotId: null })
  })
  it('a PATCH sends null to clear the last day; a started Away leaves its first day out', () => {
    expect(awayBody({ ...draft, noLastDay: true }, 'patch')).toEqual({ from: '2026-11-17', fromMealSlotId: null, through: null, throughMealSlotId: null })
    expect(awayBody(draft, 'patch', { started: true })).toEqual({ through: '2026-11-19', throughMealSlotId: 42 })
  })
})
