// RX-06, RX-07, RX-13: the words of the metric strip. A phrase value is marked, so the CSS gives it the smaller title-2 role.
import { describe, expect, it } from 'vitest'
import { metricsOf } from './metrics'

describe('metricsOf', () => {
  it('a timed Recipe: "37 min" / "cooking", a number, and the ahead line', () => {
    expect(metricsOf({ yieldValue: 4, totalMinutes: 37, advanceMinutes: 720, stepCount: 5 })).toEqual({
      yield: { value: '4', label: 'portions per Batch' },
      time: { value: '37 min', label: 'cooking', words: false },
      ahead: '+ 12 h ahead',
    })
  })
  it('untimed Steps: the phrase "No time set" / "2 Steps, none timed"', () => {
    expect(metricsOf({ yieldValue: 2, totalMinutes: 0, advanceMinutes: 0, stepCount: 2 }).time).toEqual({ value: 'No time set', label: '2 Steps, none timed', words: true })
  })
  it('no Steps, and an Advance Step alone, are phrases with no label', () => {
    expect(metricsOf({ yieldValue: 2, totalMinutes: 0, advanceMinutes: 0, stepCount: 0 }).time).toEqual({ value: 'No Steps', label: '', words: true })
    expect(metricsOf({ yieldValue: 2, totalMinutes: 0, advanceMinutes: 120, stepCount: 1 }).time).toEqual({ value: '+ 2 h ahead', label: '', words: true })
  })
  it('a Base recipe states its Yield with its unit, per Batch', () => {
    expect(metricsOf({ yieldValue: 800, yieldUnit: 'g', baseRecipe: true, totalMinutes: 0, advanceMinutes: 0 }).yield).toEqual({ value: '800 g', label: 'per Batch' })
  })
})
