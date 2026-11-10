import { describe, expect, it } from 'vitest'
import { clamp, parseNumber, stepValue } from './number'

describe('parseNumber', () => {
  it.each([
    ['12', 12],
    [' 2.5 ', 2.5],
    ['2,5', 2.5],
    ['-3', -3],
    ['0', 0],
  ])('parses %j as %d', (text, value) => {
    expect(parseNumber(text)).toEqual({ kind: 'number', value })
  })
  it('treats blank as empty', () => {
    expect(parseNumber('')).toEqual({ kind: 'empty' })
    expect(parseNumber('   ')).toEqual({ kind: 'empty' })
  })
  it.each(['abc', '1.2.3', '1e3', '2,5,1', '--1', '5g'])('rejects %j', (text) => {
    expect(parseNumber(text)).toEqual({ kind: 'invalid' })
  })
})

describe('clamp', () => {
  it('applies whichever bounds exist', () => {
    expect(clamp(150, 0, 100)).toBe(100)
    expect(clamp(-5, 0, 100)).toBe(0)
    expect(clamp(50, 0, 100)).toBe(50)
    expect(clamp(-5)).toBe(-5)
    expect(clamp(5, undefined, 3)).toBe(3)
  })
})

describe('stepValue', () => {
  it('steps and clamps', () => {
    expect(stepValue(4, 1, { step: 1 })).toBe(5)
    expect(stepValue(9, 1, { step: 5, max: 10 })).toBe(10)
    expect(stepValue(1, -1, { step: 5, min: 0 })).toBe(0)
  })
  it('does not drift on decimals', () => {
    expect(stepValue(0.1, 1, { step: 0.2 })).toBe(0.3)
    expect(stepValue(0.3, -1, { step: 0.1 })).toBe(0.2)
    expect(stepValue(1.15, 1, { step: 0.05 })).toBe(1.2)
  })
})
