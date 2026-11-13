import { describe, expect, it } from 'vitest'
import { friDinner, friLunch, frozenChilli, leftover, places, TODAY } from './fixtures'
import { NOT_SORTED_PLACE } from './types'
import { placeChoices, replannedNotes, sheetDefaults, sheetNotes, sheetRequest, type SheetInput } from './sheetModel'

const input = (over: Partial<SheetInput> = {}): SheetInput => ({
  action: 'had-it',
  leftover: leftover({ portions: 3 }),
  places,
  today: TODAY,
  recipeFrozenUseBy: null,
  householdFrozenUseBy: 90,
  recipeUseByDays: 3,
  ...over,
})
const withDefault = (id: number) => places.map((p) => ({ ...p, default: p.id === id }))

describe('sheetDefaults', () => {
  it('Had it: one portion; Threw it out: all of them', () => {
    expect(sheetDefaults(input({ action: 'had-it' }))).toEqual({ portions: 1, placeId: null })
    expect(sheetDefaults(input({ action: 'threw-out' }))).toEqual({ portions: 3, placeId: null })
  })
  it('Freeze it: the spare portions and the default freezer (else the first freezer by name)', () => {
    const l = leftover({ portions: 5, plannedPortions: 2 })
    expect(sheetDefaults(input({ action: 'freeze', leftover: l }))).toEqual({ portions: 3, placeId: 4 })
    expect(sheetDefaults(input({ action: 'freeze', leftover: l, places: withDefault(2) }))).toEqual({ portions: 3, placeId: 2 })
  })
  it('Freeze it with no freezer has no place', () => {
    expect(sheetDefaults(input({ action: 'freeze', places: places.filter((p) => p.kind !== 'freezer') })).placeId).toBeNull()
  })
  it('Take out: the Household default Storage Place when it is not a freezer', () => {
    const frozen = frozenChilli()
    expect(sheetDefaults(input({ action: 'take-out', leftover: frozen, places: withDefault(3) })).placeId).toBe(3)
    expect(sheetDefaults(input({ action: 'take-out', leftover: frozen })).placeId).toBe(1)
  })
  it('Take out: Not sorted when the default is a freezer or there is no default', () => {
    const frozen = frozenChilli()
    expect(sheetDefaults(input({ action: 'take-out', leftover: frozen, places: withDefault(2) })).placeId).toBe(NOT_SORTED_PLACE)
    expect(sheetDefaults(input({ action: 'take-out', leftover: frozen, places: places.map((p) => ({ ...p, default: false })) })).placeId).toBe(NOT_SORTED_PLACE)
  })
})

describe('sheetRequest', () => {
  it('builds the request for each sheet', () => {
    expect(sheetRequest('had-it', { portions: 2, placeId: null })).toEqual({ kind: 'had-it', portions: 2 })
    expect(sheetRequest('threw-out', { portions: 3, placeId: null })).toEqual({ kind: 'threw-out', portions: 3 })
    expect(sheetRequest('freeze', { portions: 1.5, placeId: 2 })).toEqual({ kind: 'freeze', storagePlaceId: 2, portions: 1.5 })
  })
  it('Freeze it without a place has nothing to confirm', () => {
    expect(sheetRequest('freeze', { portions: 1, placeId: null })).toBeNull()
  })
  it('Take out sends null for Not sorted', () => {
    expect(sheetRequest('take-out', { portions: 3, placeId: NOT_SORTED_PLACE })).toEqual({ kind: 'take-out', storagePlaceId: null })
    expect(sheetRequest('take-out', { portions: 3, placeId: 3 })).toEqual({ kind: 'take-out', storagePlaceId: 3 })
  })
})

describe('placeChoices', () => {
  it('Freeze it: freezers by name; Take out: the others by name, then Not sorted', () => {
    expect(placeChoices('freeze', places).map((c) => c.label)).toEqual(['Basement Freezer', 'Garage Freezer'])
    expect(placeChoices('take-out', places)).toEqual([
      { value: 3, label: 'Garage Fridge' },
      { value: 1, label: 'Kitchen Pantry' },
      { value: NOT_SORTED_PLACE, label: 'Not sorted' },
    ])
  })
  it('Had it and Threw it out have no place choice', () => {
    expect(placeChoices('had-it', places)).toEqual([])
    expect(placeChoices('threw-out', places)).toEqual([])
  })
})

describe('sheetNotes', () => {
  it('Had it has no note', () => {
    expect(sheetNotes(input({ action: 'had-it' }))).toEqual([])
  })
  it('Threw it out names the waste', () => {
    expect(sheetNotes(input({ action: 'threw-out' }))).toEqual(['This counts as waste: the zero-waste streak starts again today.'])
  })
  it('Freeze it shows the Household Use-by, or the Recipe one', () => {
    expect(sheetNotes(input({ action: 'freeze' }))).toEqual(['Use by 10 Feb in the freezer (90 days)'])
    expect(sheetNotes(input({ action: 'freeze', recipeFrozenUseBy: 30 }))).toEqual(['Use by 12 Dec in the freezer (30 days)'])
  })
  it('Freeze it with no freezer shows no Use-by note', () => {
    expect(sheetNotes(input({ action: 'freeze', places: places.filter((p) => p.kind !== 'freezer') }))).toEqual([])
  })
  it('Take out shows the Use-by once out', () => {
    expect(sheetNotes(input({ action: 'take-out', leftover: frozenChilli() }))).toEqual(['Use by Sun once out (3 days)'])
  })
})

describe('replannedNotes', () => {
  it('one note per Planned Meal from the dry run, in the order given', () => {
    expect(replannedNotes([friLunch, friDinner]).map((n) => n.text)).toEqual([
      'Fri Lunch was going to have it; it is planned again.',
      'Fri Dinner was going to have it; it is planned again.',
    ])
  })
  it('keys are unique per Planned Meal, even for the same day and slot with different Courses', () => {
    const starter = { ...friLunch, courseId: 2 }
    const keys = replannedNotes([friLunch, starter, friDinner, { ...friLunch, courseId: undefined }]).map((n) => n.key)
    expect(new Set(keys).size).toBe(4)
  })
  it('nothing replanned, no notes', () => {
    expect(replannedNotes([])).toEqual([])
  })
})
