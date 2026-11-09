import { describe, expect, it } from 'vitest'
import { formatTimer, initials } from './format'

describe('formatTimer', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [45296, '12:34:56'],
  ])('formats %i seconds as %s', (seconds, text) => {
    expect(formatTimer(seconds)).toBe(text)
  })

  it('shows overrun time with a minus sign', () => {
    expect(formatTimer(-5)).toBe('-0:05')
    expect(formatTimer(-3725)).toBe('-1:02:05')
  })

  it('drops fractions toward zero', () => {
    expect(formatTimer(59.9)).toBe('0:59')
    expect(formatTimer(-0.4)).toBe('0:00')
  })
})

describe('initials', () => {
  it.each([
    ['Anna Rossi', 'AR'],
    ['anna', 'A'],
    ['  maria  de luca ', 'MD'],
    ['', '?'],
    ['   ', '?'],
    ['élan vital', 'ÉV'],
  ])('%j -> %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})
