import { describe, expect, it } from 'vitest'
import { batchPortions, MAX_BATCHES, MIN_BATCHES } from './cookEntry'

describe('batchPortions', () => {
  it('multiplies Yield by Batches', () => {
    expect(batchPortions(4, 2)).toBe('8')
    expect(batchPortions(2.5, 3)).toBe('7.5')
  })
  it('hides floating point noise', () => {
    expect(batchPortions(0.1, 3)).toBe('0.3')
  })
})

describe('Batch bounds', () => {
  it('are 1 to 10', () => {
    expect([MIN_BATCHES, MAX_BATCHES]).toEqual([1, 10])
  })
})
