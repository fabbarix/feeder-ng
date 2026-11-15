import { describe, expect, it } from 'vitest'
import { timeSummary } from './timeSummary'

describe('timeSummary', () => {
  it('says the Advance Step is on top of the total (the "Total 25 min" confusion)', () => {
    expect(timeSummary({ totalMinutes: 25, advanceMinutes: 240 })).toEqual({ total: '25 min', ahead: '+4 h ahead', untimedSteps: null })
  })
  it('has no ahead part without an Advance Step', () => {
    expect(timeSummary({ totalMinutes: 65, advanceMinutes: 0 })).toEqual({ total: '1 h 5 min', ahead: null, untimedSteps: null })
  })
  it('has no total for a Recipe without timeline Steps', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 0 })).toEqual({ total: null, ahead: null, untimedSteps: null })
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 1440 })).toEqual({ total: null, ahead: '+1 d ahead', untimedSteps: null })
  })
  it('an Advance Step alone has an ahead part and no total, so callers must not add "No Steps"', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 120 })).toEqual({ total: null, ahead: '+2 h ahead', untimedSteps: null })
  })
})

// RX-07: untimed Steps are not "No Steps". `stepCount` is the number of Steps the Recipe has (the list summary's `stepCount`, or the detail's steps.length).
describe('timeSummary: untimed Steps (RX-07)', () => {
  it('a Recipe with Steps and no time at all reports how many Steps are untimed', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 0, stepCount: 2 })).toEqual({ total: null, ahead: null, untimedSteps: 2 })
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 0, stepCount: 1 }).untimedSteps).toBe(1)
  })
  it('a Recipe with no Steps has none to report ("No Steps" stays only then)', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 0, stepCount: 0 }).untimedSteps).toBeNull()
  })
  it('an unknown count (a summary without stepCount) reports none, so the old words stay', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 0 }).untimedSteps).toBeNull()
  })
  it('a timed Recipe reports none', () => {
    expect(timeSummary({ totalMinutes: 25, advanceMinutes: 0, stepCount: 3 }).untimedSteps).toBeNull()
  })
  it('an Advance Step alone keeps today\'s lead metric: no untimed count beside it', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 120, stepCount: 1 })).toEqual({ total: null, ahead: '+2 h ahead', untimedSteps: null })
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 120, stepCount: 3 }).untimedSteps).toBeNull()
  })
})

