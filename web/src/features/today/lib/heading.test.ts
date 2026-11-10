import { describe, expect, it } from 'vitest'
import { todayHeading } from './heading'

describe('todayHeading', () => {
  it('is the short weekday, day and month: Tue 10 Nov', () => {
    expect(todayHeading('2026-11-10')).toBe('Tue 10 Nov')
    expect(todayHeading('2026-12-01')).toBe('Tue 1 Dec')
  })
})
