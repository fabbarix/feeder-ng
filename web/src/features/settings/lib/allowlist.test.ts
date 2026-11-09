import { describe, expect, it } from 'vitest'
import { isEmail, isLastAdmin } from './allowlist'

const a = { id: 1, email: 'a@example.test', displayName: 'A', isAdmin: true }
const b = { id: 2, email: 'b@example.test', displayName: 'B', isAdmin: false }

describe('isEmail', () => {
  it.each(['a@example.test', ' a@b.co '])('accepts %j', (v) => expect(isEmail(v)).toBe(true))
  it.each(['', 'nonna', 'a@b', '@b.co', 'a b@c.de'])('rejects %j', (v) => expect(isEmail(v)).toBe(false))
})

describe('isLastAdmin', () => {
  it('is true for a lone Admin only', () => {
    expect(isLastAdmin([a, b], a)).toBe(true)
    expect(isLastAdmin([a, b], b)).toBe(false)
    expect(isLastAdmin([a, { ...b, isAdmin: true }], a)).toBe(false)
  })
})
