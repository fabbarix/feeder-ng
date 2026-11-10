import { describe, expect, it } from 'vitest'
import { batchPortions, clampBatches, cookPath, MAX_BATCHES, MIN_BATCHES } from './cookEntry'

describe('clampBatches', () => {
  it('keeps whole numbers in range', () => {
    expect(clampBatches(1)).toBe(1)
    expect(clampBatches(3)).toBe(3)
    expect(clampBatches(MAX_BATCHES)).toBe(MAX_BATCHES)
  })
  it('pulls out-of-range values to the bounds', () => {
    expect(clampBatches(0)).toBe(MIN_BATCHES)
    expect(clampBatches(-4)).toBe(MIN_BATCHES)
    expect(clampBatches(MAX_BATCHES + 5)).toBe(MAX_BATCHES)
  })
  it('rounds fractions and treats NaN as one Batch', () => {
    expect(clampBatches(2.4)).toBe(2)
    expect(clampBatches(2.6)).toBe(3)
    expect(clampBatches(Number.NaN)).toBe(1)
  })
})

describe('cookPath', () => {
  it('is the Cook Mode route of the Recipe with the Batch count', () => {
    expect(cookPath(3, 2)).toBe('/cook/recipe/3?batches=2')
  })
  it('clamps the count so the route is always valid', () => {
    expect(cookPath(12, 0)).toBe('/cook/recipe/12?batches=1')
    expect(cookPath(12, 99)).toBe(`/cook/recipe/12?batches=${MAX_BATCHES}`)
  })
})

describe('batchPortions', () => {
  it('multiplies Yield by Batches', () => {
    expect(batchPortions(4, 2)).toBe('8')
    expect(batchPortions(2.5, 3)).toBe('7.5')
  })
  it('hides floating point noise', () => {
    expect(batchPortions(0.1, 3)).toBe('0.3')
  })
})
