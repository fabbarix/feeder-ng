import { describe, expect, it } from 'vitest'
import type { AccessRequest } from '../types'
import { badgeText, daysLeft, initialOf, oldestFirst } from './requests'

const req = (id: number, requestedAt: string): AccessRequest => ({
  id, email: `p${id}@example.test`, name: `P${id}`, picture: '', requestedAt, expiresAt: '2026-11-23T12:00:00Z',
})

describe('daysLeft', () => {
  const expires = '2026-11-23T12:00:00Z'
  it('counts whole days, rounding up', () => {
    expect(daysLeft(expires, new Date('2026-11-09T12:00:00Z'))).toBe(14)
    expect(daysLeft(expires, new Date('2026-11-22T13:00:00Z'))).toBe(1)
    expect(daysLeft(expires, new Date('2026-11-23T11:59:00Z'))).toBe(1)
  })
  it('is 0 once expired', () => {
    expect(daysLeft(expires, new Date('2026-11-23T12:00:00Z'))).toBe(0)
    expect(daysLeft(expires, new Date('2026-12-30T00:00:00Z'))).toBe(0)
  })
  it('is 0 for an unreadable date', () => {
    expect(daysLeft('nonsense', new Date())).toBe(0)
  })
})

describe('badgeText', () => {
  it('hides the badge at zero or less', () => {
    expect(badgeText(0)).toBe('')
    expect(badgeText(-3)).toBe('')
  })
  it('shows the count up to 9 and 9+ above', () => {
    expect(badgeText(1)).toBe('1')
    expect(badgeText(9)).toBe('9')
    expect(badgeText(10)).toBe('9+')
    expect(badgeText(50)).toBe('9+')
  })
})

describe('oldestFirst', () => {
  it('sorts by requested time then id without changing the input', () => {
    const input = [req(3, '2026-11-09T14:00:00Z'), req(1, '2026-11-09T14:00:00Z'), req(2, '2026-11-09T10:00:00Z')]
    expect(oldestFirst(input).map((r) => r.id)).toEqual([2, 1, 3])
    expect(input.map((r) => r.id)).toEqual([3, 1, 2])
  })
})

describe('initialOf', () => {
  it('uses the name, else the email', () => {
    expect(initialOf('zia rosa', 'z@example.test')).toBe('Z')
    expect(initialOf('  ', 'rex@example.test')).toBe('R')
    expect(initialOf('', '')).toBe('?')
  })
})
