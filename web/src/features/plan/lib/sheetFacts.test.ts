// B9-38 (PC-09; B9-32's follow-up "the Planned Meal sheet says why a start is outside the cooking times"): the words of the sheet's body.
// 2026-11-09 is a Monday, 2026-11-10 a Tuesday.
import { describe, expect, it } from 'vitest'
import type { Leftover } from '../../../lib/leftovers/types'
import { meal } from '../test-utils'
import { leftoverBlock, sheetFacts, startNote } from './sheetFacts'

describe('sheetFacts', () => {
  it('Batches and portions, the cooking time and the time to start by', () => {
    expect(sheetFacts(meal({ batches: 1, portions: 2.75, cookMinutes: 45, startBy: '18:15' }))).toBe('1 Batch · 2.75 portions · 45 min · start 18:15')
  })

  it('leaves out what the meal does not have, and reads long times as hours', () => {
    expect(sheetFacts(meal({ batches: 2, portions: 3.5 }))).toBe('2 Batches · 3.5 portions')
    expect(sheetFacts(meal({ batches: 1, portions: 4, cookMinutes: 360 }))).toBe('1 Batch · 4 portions · 6 h')
  })

  it('a meal served from a Leftover needs no cooking: the portions alone', () => {
    expect(sheetFacts(meal({ batches: 0, portions: 2.75, cookMinutes: 45, servedFromLeftover: { leftoverId: 4, date: '2026-11-08', mealSlotId: 2, recipeName: 'Chicken curry' } }))).toBe('2.75 portions')
  })
})

describe('startNote', () => {
  it('a Pinned or Bought meal that would start outside the cooking times says so', () => {
    expect(startNote(meal({ pinned: true, earlyStart: '02:30' }))).toBe('Cooking would start at 02:30, outside your cooking times.')
  })

  it('names the day when the start is on an earlier day too', () => {
    expect(startNote(meal({ pinned: true, earlyStart: '02:30', startsAt: { date: '2026-11-09', time: '02:30' } }))).toBe('Cooking would start on Monday at 02:30, outside your cooking times.')
  })

  it('a start on an earlier day within the cooking times says when to start', () => {
    expect(startNote(meal({ startsAt: { date: '2026-11-09', time: '21:30' } }))).toBe('Start cooking on Monday at 21:30.')
  })

  it('is null with no start to explain, and for a meal that is no longer planned', () => {
    expect(startNote(meal())).toBeNull()
    expect(startNote(meal({ state: 'cooked', earlyStart: '02:30' }))).toBeNull()
    expect(startNote(meal({ state: 'skipped', startsAt: { date: '2026-11-09', time: '21:30' } }))).toBeNull()
  })
})

const left = (over: Partial<Leftover> = {}): Leftover => ({
  id: 9, recipeId: 7, recipeName: 'Chicken curry', portions: 2.5, cookedOn: '2026-11-10', useBy: '2026-11-13', fromDate: '2026-11-10', fromMealSlotId: 2,
  storagePlaceId: null, storagePlaceName: null, frozen: false, frozenOn: null, toAnswer: false, plannedPortions: 0, ...over,
})

describe('leftoverBlock (a Cooked meal\'s Leftover)', () => {
  const today = '2026-11-10' // 2026-11-13 is a Friday

  it('the portions left and the Use-by, and what is planned of it', () => {
    expect(leftoverBlock(left({ plannedPortions: 1.25 }), today)).toEqual({ title: '2.5 portions left · Use by Fri', detail: '1.25 portions planned. 1.25 not planned yet.' })
  })

  it('nothing planned, and all planned', () => {
    expect(leftoverBlock(left(), today).detail).toBe('None planned yet.')
    expect(leftoverBlock(left({ plannedPortions: 2.5 }), today).detail).toBe('All planned.')
  })

  it('one portion is singular', () => {
    expect(leftoverBlock(left({ portions: 1 }), today).title).toBe('1 portion left · Use by Fri')
  })
})
