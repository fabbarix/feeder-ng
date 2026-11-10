import { describe, expect, it } from 'vitest'
import { formatTime, parseTime, stepSegment } from './time'

describe('parseTime / formatTime', () => {
  it('round-trips 24 h times with zero padding', () => {
    expect(parseTime('07:05')).toEqual({ hour: 7, minute: 5 })
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 })
    expect(formatTime({ hour: 7, minute: 5 })).toBe('07:05')
    expect(formatTime({ hour: 0, minute: 0 })).toBe('00:00')
  })
  it.each(['', '7:5', '24:00', '12:60', 'ab:cd', '19:30:00', '07:05 PM'])('rejects %j', (v) => {
    expect(parseTime(v)).toBeNull()
  })
})

describe('stepSegment', () => {
  it('wraps the hour without carrying', () => {
    expect(stepSegment(23, 1, 'hour')).toBe(0)
    expect(stepSegment(0, -1, 'hour')).toBe(23)
    expect(stepSegment(7, 1, 'hour')).toBe(8)
  })
  it('wraps the minute and honours the step', () => {
    expect(stepSegment(59, 1, 'minute')).toBe(0)
    expect(stepSegment(0, -1, 'minute')).toBe(59)
    expect(stepSegment(30, 1, 'minute', 5)).toBe(35)
    expect(stepSegment(58, 1, 'minute', 5)).toBe(3)
    expect(stepSegment(2, -1, 'minute', 5)).toBe(57)
  })
})
