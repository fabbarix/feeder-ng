// B9-45 (PC-13): Freeze keeps no stranded portion: a 1.25-portion Leftover freezes as 1.25, the stepper moves in quarters and always reaches the maximum.
import { describe, expect, it } from 'vitest'
import { hadItDefault, PORTION_STEP, portionBounds, stepPortions, throwOutDefault } from './portions'

describe('the quarter step', () => {
  it('is 0.25', () => {
    expect(PORTION_STEP).toBe(0.25)
  })
  it('Had it and Threw it out share the same stepper bounds and keep their defaults', () => {
    expect(portionBounds(1.25)).toEqual({ min: 0.25, max: 1.25, step: 0.25 })
    expect(hadItDefault(1.25)).toBe(1)
    expect(hadItDefault(0.5)).toBe(0.5)
    expect(throwOutDefault(1.25)).toBe(1.25)
  })
})

describe('stepPortions', () => {
  it('moves by a quarter', () => {
    expect(stepPortions(1, 1, 3)).toBe(1.25)
    expect(stepPortions(1, -1, 3)).toBe(0.75)
  })
  it('reaches the maximum of a 1.25 Leftover and steps back from it', () => {
    expect(stepPortions(1, 1, 1.25)).toBe(1.25)
    expect(stepPortions(1.25, 1, 1.25)).toBe(1.25)
    expect(stepPortions(1.25, -1, 1.25)).toBe(1)
  })
  it('reaches a maximum that is not a quarter and steps back to a quarter', () => {
    expect(stepPortions(1.25, 1, 1.3)).toBe(1.3)
    expect(stepPortions(1.3, -1, 1.3)).toBe(1.25)
  })
  it('never goes below a quarter', () => {
    expect(stepPortions(0.25, -1, 3)).toBe(0.25)
  })
  it('has no floating point dust', () => {
    expect(stepPortions(0.75, 1, 3)).toBe(1)
    expect(stepPortions(2.75, 1, 3)).toBe(3)
  })
})
