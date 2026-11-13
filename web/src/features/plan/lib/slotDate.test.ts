// B5-F1 (ADR 0014, beta5-plan 2.1): which per-date choices a slot block offers, the Not served confirm from the dry run, the captions.
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { courseMeal, courseSlot, planCourse, slot } from '../test-utils'
import type { NotServedPreview, PlanSlot } from '../types'
import {
  attendeesLine, canSaveTime, choiceLabel, dateChoices, guestsNote, guestsSuffix, hasOwnTime, isNotServed, needsNotServedConfirm, notServedConfirm,
  notServedRowText, notServedToastText, notServedToday, planAgainLabel, slotDateErrorText, slotDayName, timeCaption, timeChoiceLabel, timeDialogCopy,
} from './slotDate'

// 2026-11-10 is a Tuesday, 2026-11-12 a Thursday.
const TODAY = '2026-11-10'
const thu = (over: Partial<PlanSlot> = {}) => slot({ date: '2026-11-12', ...over })
const main = (state: 'planned' | 'cooked' | 'skipped' = 'planned') => planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main', { state }) })
const side = (state: 'planned' | 'cooked' | 'skipped' = 'planned') => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { state }) })

describe('dateChoices', () => {
  it('a one-Course slot today offers Who\'s eating, Time and Not served (not only multi-Course slots)', () => {
    expect(dateChoices(slot({ date: TODAY }), TODAY)).toEqual({ whosEating: true, notServed: true, time: true, planAgain: false })
  })

  it('a later date offers them too', () => {
    expect(dateChoices(thu(), TODAY)).toEqual({ whosEating: true, notServed: true, time: true, planAgain: false })
  })

  it('a past date offers nothing', () => {
    expect(dateChoices(slot({ date: '2026-11-09' }), TODAY)).toEqual({ whosEating: false, notServed: false, time: false, planAgain: false })
  })

  it('a slot nothing could be planned for (Couldn\'t plan) still offers all three', () => {
    const empty = slot({ date: TODAY, meal: null, unfilled: { reason: 'no_candidates', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } })
    expect(dateChoices(empty, TODAY)).toMatchObject({ whosEating: true, notServed: true, time: true })
  })

  it('U2: Not served is not offered once a Course is Cooked or Not cooked; the other two stay while a Course is left', () => {
    for (const state of ['cooked', 'skipped'] as const) {
      const s = courseSlot([main(state), side('planned')], { date: TODAY })
      expect(dateChoices(s, TODAY)).toEqual({ whosEating: true, notServed: false, time: true, planAgain: false })
    }
  })

  it('every Course resolved: nothing is left to change', () => {
    const s = courseSlot([main('cooked'), side('skipped')], { date: TODAY })
    expect(dateChoices(s, TODAY)).toEqual({ whosEating: false, notServed: false, time: false, planAgain: false })
  })

  it('a Not served slot offers only Plan <Slot> again, from today on', () => {
    expect(dateChoices(thu({ notServed: true }), TODAY)).toEqual({ whosEating: false, notServed: false, time: false, planAgain: true })
    expect(dateChoices(slot({ date: '2026-11-09', notServed: true }), TODAY)).toEqual({ whosEating: false, notServed: false, time: false, planAgain: false })
  })
})

describe('names and labels', () => {
  it('isNotServed reads the slot flag', () => {
    expect(isNotServed(thu())).toBe(false)
    expect(isNotServed(thu({ notServed: true }))).toBe(true)
  })

  it('slotDayName is the short weekday and the Meal Slot', () => {
    expect(slotDayName(thu())).toBe('Thu Dinner')
    expect(slotDayName(slot({ date: TODAY, name: 'Lunch' }))).toBe('Tue Lunch')
  })

  it('the time choice says today or the weekday', () => {
    expect(timeChoiceLabel(slot({ date: TODAY }), TODAY)).toBe('Time today')
    expect(timeChoiceLabel(thu(), TODAY)).toBe('Time on Thu')
  })

  it('offline a choice says why it is unavailable', () => {
    expect(choiceLabel('Not served', false)).toBe('Not served')
    expect(choiceLabel('Not served', true)).toBe('Not served · Needs a connection')
  })

  it('the Not served row and its way back name the slot', () => {
    expect(notServedRowText(thu())).toBe('Dinner · Not served')
    expect(planAgainLabel(thu())).toBe('Plan Dinner again')
    expect(notServedToastText(thu())).toBe('Thu Dinner is not served')
  })
})

describe('notServedConfirm (from the dry run)', () => {
  const none: NotServedPreview = { removes: { plannedMeals: [] } }
  const some: NotServedPreview = {
    removes: {
      plannedMeals: [
        { courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', pinned: true, bought: [] },
        { courseId: 2, courseName: 'Side', recipeName: 'Green beans', pinned: false, bought: ['green beans'] },
      ],
    },
  }

  it('asks "Not serving Thu Dinner?" and says what leaves', () => {
    expect(notServedConfirm(thu(), none)).toEqual({
      title: 'Not serving Thu Dinner?',
      body: 'Thu Dinner is left out of the plan, the Shopping List and reminders.',
      confirmLabel: 'Not served',
    })
  })

  it('lists the Planned Meals that go, Pinned and Bought marked, and says Stock keeps what was bought', () => {
    expect(notServedConfirm(thu(), some).body).toBe(
      'Thu Dinner is left out of the plan, the Shopping List and reminders. These go: Roast chicken (Pinned), Green beans (Bought: green beans). What you bought stays in Stock.',
    )
  })

  it('without anything bought the Stock sentence is left out; a plain Planned Meal has no note', () => {
    const p: NotServedPreview = { removes: { plannedMeals: [{ courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', pinned: true, bought: [] }, { courseId: 2, courseName: 'Side', recipeName: 'Green beans', pinned: false, bought: [] }] } }
    expect(notServedConfirm(thu(), p).body).toBe('Thu Dinner is left out of the plan, the Shopping List and reminders. These go: Roast chicken (Pinned), Green beans.')
  })

  it('a Pinned and Bought meal carries both notes; several bought Ingredients are listed', () => {
    const p: NotServedPreview = { removes: { plannedMeals: [{ courseId: 1, courseName: 'Main', recipeName: 'Paella', pinned: true, bought: ['rice', 'saffron'] }] } }
    expect(notServedConfirm(thu(), p).body).toContain('Paella (Pinned, Bought: rice, saffron).')
  })

  it('a confirm is asked only when Planned Meals go', () => {
    expect(needsNotServedConfirm(none)).toBe(false)
    expect(needsNotServedConfirm(some)).toBe(true)
  })
})

describe('the time of a date', () => {
  it('the caption says the date\'s time against the usual one', () => {
    expect(timeCaption(thu({ time: '20:15', usualTime: '19:30' }))).toBe('20:15 · usually 19:30')
  })

  it('no caption for the usual time, or when the usual time is not known', () => {
    expect(timeCaption(thu({ time: '19:30', usualTime: '19:30' }))).toBeNull()
    expect(timeCaption(thu({ time: '19:30' }))).toBeNull()
    expect(hasOwnTime(thu({ time: '20:15', usualTime: '19:30' }))).toBe(true)
    expect(hasOwnTime(thu({ time: '19:30', usualTime: '19:30' }))).toBe(false)
  })

  it('the dialog: title, field caption, helper, and Back to the usual time only when the date has its own', () => {
    expect(timeDialogCopy(thu({ time: '20:15', usualTime: '19:30' }))).toEqual({ title: 'Time for Thu Dinner', label: 'Time', helper: 'Usually 19:30', back: 'Back to 19:30' })
    expect(timeDialogCopy(thu({ time: '19:30', usualTime: '19:30' }))).toEqual({ title: 'Time for Thu Dinner', label: 'Time', helper: 'Usually 19:30', back: null })
  })

  it('Save needs a whole HH:MM that differs from the time the slot has', () => {
    const s = thu({ time: '19:30', usualTime: '19:30' })
    expect(canSaveTime(s, '20:15')).toBe(true)
    expect(canSaveTime(s, '19:30')).toBe(false)
    expect(canSaveTime(s, '')).toBe(false)
    expect(canSaveTime(s, '7:5')).toBe(false)
    expect(canSaveTime(s, '24:00')).toBe(false)
    expect(canSaveTime(s, '23:59')).toBe(true)
  })
})

describe('Guests in words', () => {
  it('the pill suffix', () => {
    expect(guestsSuffix(0)).toBe('')
    expect(guestsSuffix(1)).toBe('+1 Guest')
    expect(guestsSuffix(2)).toBe('+2 Guests')
  })

  it('the attendees line', () => {
    expect(attendeesLine(['Anna', 'Sam'], 2)).toBe('Anna, Sam + 2 Guests')
    expect(attendeesLine(['Anna'], 1)).toBe('Anna + 1 Guest')
    expect(attendeesLine([], 2)).toBe('2 Guests')
    expect(attendeesLine(['Anna', 'Sam'], 0)).toBe('Anna, Sam')
  })

  it('the Guests note under the attendees: the suffix after Members, the count with none, nothing without Guests', () => {
    expect(guestsNote(2, 2)).toBe('+2 Guests')
    expect(guestsNote(0, 2)).toBe('2 Guests')
    expect(guestsNote(0, 1)).toBe('1 Guest')
    expect(guestsNote(2, 0)).toBe('')
  })
})

describe('notServedToday', () => {
  it('is today\'s Not served slots in time order; other dates and served slots are left out', () => {
    const lunch = slot({ date: TODAY, mealSlotId: 1, name: 'Lunch', at: '2026-11-10T12:30:00Z', notServed: true })
    const dinner = slot({ date: TODAY, mealSlotId: 2, name: 'Dinner', at: '2026-11-10T19:30:00Z', notServed: true })
    const served = slot({ date: TODAY, mealSlotId: 3, name: 'Snack', at: '2026-11-10T16:00:00Z' })
    const tomorrow = slot({ date: '2026-11-11', mealSlotId: 2, notServed: true })
    expect(notServedToday([dinner, served, tomorrow, lunch], TODAY).map((s) => s.name)).toEqual(['Lunch', 'Dinner'])
  })
})

describe('slotDateErrorText', () => {
  const err = (reason: string) => new ApiError(422, 'validation_failed', 'no', { field: 'notServed', reason })
  it('names the refusals in the household\'s words', () => {
    expect(slotDateErrorText(err('slot_started'), thu())).toBe('Part of Dinner is already Cooked or Not cooked, so it cannot be left out.')
    expect(slotDateErrorText(err('date_past'), thu())).toBe('That date has passed, so it cannot change.')
    expect(slotDateErrorText(err('time_invalid'), thu())).toBe('Enter a time such as 19:30.')
  })

  it('anything else is the generic line', () => {
    expect(slotDateErrorText(new ApiError(500, 'internal', 'boom'), thu())).toBe('Could not save that. Try again.')
    expect(slotDateErrorText(new Error('x'), null)).toBe('Could not save that. Try again.')
  })
})
