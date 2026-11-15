// RX-08 (B9-16): formatMinutes moves from features/recipes/lib/time.ts to lib/time/formatMinutes.ts (the old path re-exports it),
// so Choose a Recipe, the editor and the Plan all say "6 h" for the same Recipe.
import { describe, expect, it } from 'vitest'
import { formatMinutes } from './formatMinutes'
import * as barrel from './index'

describe('formatMinutes', () => {
  it.each([
    [0, '0 min'],
    [1, '1 min'],
    [40, '40 min'],
    [59, '59 min'],
    [60, '1 h'],
    [65, '1 h 5 min'],
    [90, '1 h 30 min'],
    [120, '2 h'],
    [360, '6 h'],
    [720, '12 h'],
    [1440, '1 d'],
    [2880, '2 d'],
    [1500, '25 h'],
  ] as const)('%d minutes is "%s"', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text)
  })

  it('rounds a fraction up and never goes below 0', () => {
    expect(formatMinutes(0.2)).toBe('1 min')
    expect(formatMinutes(-4)).toBe('0 min')
  })
})

describe('lib/time barrel', () => {
  it('exports the three helpers', () => {
    expect(barrel.formatMinutes).toBe(formatMinutes)
    expect(typeof barrel.splitMinutes).toBe('function')
    expect(typeof barrel.toMinutes).toBe('function')
  })
})
