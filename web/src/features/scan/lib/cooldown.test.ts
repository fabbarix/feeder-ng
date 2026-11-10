import { describe, expect, it } from 'vitest'
import { createCooldown } from './cooldown'

describe('createCooldown', () => {
  it('lets the first read of a code through and refuses it again inside the window', () => {
    let t = 1000
    const c = createCooldown(1500, () => t)
    expect(c.accept('A')).toBe(true)
    t += 100
    expect(c.accept('A')).toBe(false)
    t += 1399
    expect(c.accept('A')).toBe(false)
    t += 1
    expect(c.accept('A')).toBe(true)
  })

  it('accepts a different code at once', () => {
    let t = 0
    const c = createCooldown(1500, () => t)
    expect(c.accept('A')).toBe(true)
    t += 10
    expect(c.accept('B')).toBe(true)
    t += 10
    expect(c.accept('A')).toBe(true) // A was not the last code read
  })

  it('a refused read does not extend the window', () => {
    let t = 0
    const c = createCooldown(1000, () => t)
    c.accept('A')
    t = 900
    c.accept('A')
    t = 1000
    expect(c.accept('A')).toBe(true)
  })

  it('reset forgets the last code', () => {
    const c = createCooldown(1000, () => 0)
    c.accept('A')
    c.reset()
    expect(c.accept('A')).toBe(true)
  })
})
