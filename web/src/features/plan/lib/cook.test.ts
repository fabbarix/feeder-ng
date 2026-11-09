import { describe, expect, it } from 'vitest'
import type { StockWarning } from '../types'
import { adjustLeftover, correctionFor, formatPortions, parseTotal } from './cook'

describe('adjustLeftover', () => {
  it('moves by half a portion and clamps to 0..max', () => {
    expect(adjustLeftover(2, 1, 4)).toBe(2.5)
    expect(adjustLeftover(2, -1, 4)).toBe(1.5)
    expect(adjustLeftover(4, 1, 4)).toBe(4)
    expect(adjustLeftover(0.5, -1, 4)).toBe(0)
    expect(adjustLeftover(0, -1, 4)).toBe(0)
  })

  it('accepts another step', () => {
    expect(adjustLeftover(2, 1, 4, 1)).toBe(3)
  })
})

describe('formatPortions', () => {
  it('uses the singular only for exactly one', () => {
    expect(formatPortions(1)).toBe('1 portion')
    expect(formatPortions(1.5)).toBe('1.5 portions')
    expect(formatPortions(2)).toBe('2 portions')
    expect(formatPortions(0)).toBe('0 portions')
  })
})

describe('correctionFor', () => {
  it('prefills the post-cook total, which is 0 after the floored deduction', () => {
    const w: StockWarning = { ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 800, shortfall: 500, message: 'Stock shows only 300 g chicken thighs, the recipe uses 800 g' }
    expect(correctionFor(w)).toEqual({ ingredientId: 11, ingredient: 'chicken thighs', total: 0 })
  })
})

describe('parseTotal', () => {
  it('reads a non-negative number, with a dot or a comma', () => {
    expect(parseTotal('250')).toBe(250)
    expect(parseTotal(' 12,5 ')).toBe(12.5)
    expect(parseTotal('0')).toBe(0)
  })

  it('refuses anything else', () => {
    for (const bad of ['', 'abc', '-1', '1e', '12 g']) expect(parseTotal(bad)).toBeNull()
  })
})
