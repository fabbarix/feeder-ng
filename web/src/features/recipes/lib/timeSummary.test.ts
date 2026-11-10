import { describe, expect, it } from 'vitest'
import { timeSummary } from './timeSummary'

describe('timeSummary', () => {
  it('says the Advance Step is on top of the total (the "Total 25 min" confusion)', () => {
    expect(timeSummary({ totalMinutes: 25, advanceMinutes: 240 })).toEqual({ total: '25 min', ahead: '+4 h ahead' })
  })
  it('has no ahead part without an Advance Step', () => {
    expect(timeSummary({ totalMinutes: 65, advanceMinutes: 0 })).toEqual({ total: '1 h 5 min', ahead: null })
  })
  it('has no total for a Recipe without timeline Steps', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 0 })).toEqual({ total: null, ahead: null })
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 1440 })).toEqual({ total: null, ahead: '+1 d ahead' })
  })
  it('an Advance Step alone has an ahead part and no total, so callers must not add "No Steps"', () => {
    expect(timeSummary({ totalMinutes: 0, advanceMinutes: 120 })).toEqual({ total: null, ahead: '+2 h ahead' })
  })
})
