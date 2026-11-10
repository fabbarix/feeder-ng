import { describe, expect, it } from 'vitest'
import { createNav, goBack, goNext, isFirst, isLast, stepOverline, tapAction } from './steps'

describe('step navigation', () => {
  it('starts on the first Step', () => {
    expect(createNav(3)).toEqual({ index: 0, total: 3 })
    expect(isFirst(createNav(3))).toBe(true)
    expect(isLast(createNav(3))).toBe(false)
  })

  it('moves one Step at a time and stops at both ends', () => {
    let nav = createNav(3)
    nav = goNext(nav)
    nav = goNext(nav)
    expect(nav.index).toBe(2)
    expect(isLast(nav)).toBe(true)
    expect(goNext(nav)).toBe(nav)
    nav = goBack(goBack(nav))
    expect(nav.index).toBe(0)
    expect(goBack(nav)).toBe(nav)
  })

  it('clamps a start index', () => {
    expect(createNav(3, 9).index).toBe(2)
    expect(createNav(3, -4).index).toBe(0)
    expect(createNav(-2)).toEqual({ index: 0, total: 0 })
  })

  it('a Recipe with no Steps is first and last at once', () => {
    const nav = createNav(0)
    expect(isFirst(nav)).toBe(true)
    expect(isLast(nav)).toBe(true)
    expect(goNext(nav)).toBe(nav)
  })

  it('does not mutate its input', () => {
    const nav = Object.freeze(createNav(3))
    expect(goNext(nav).index).toBe(1)
    expect(nav.index).toBe(0)
  })
})

describe('tablet tap zones', () => {
  const rect = { left: 100, width: 400 }
  it('left half is Back, right half is Next', () => {
    expect(tapAction(101, rect)).toBe('back')
    expect(tapAction(299, rect)).toBe('back')
    expect(tapAction(301, rect)).toBe('next')
    expect(tapAction(499, rect)).toBe('next')
  })
  it('the exact middle is Next', () => {
    expect(tapAction(300, rect)).toBe('next')
  })
  it('taps outside the tile or on an empty box do nothing', () => {
    expect(tapAction(99, rect)).toBeNull()
    expect(tapAction(501, rect)).toBeNull()
    expect(tapAction(100, { left: 100, width: 0 })).toBeNull()
  })
})

describe('stepOverline', () => {
  it('names the kind and, on a Passive Step, its timer', () => {
    expect(stepOverline({ kind: 'passive', durationMinutes: 15 })).toBe('Passive · 15 min timer')
    expect(stepOverline({ kind: 'active', durationMinutes: 10 })).toBe('Active · 10 min')
    expect(stepOverline({ kind: 'active', durationMinutes: 0 })).toBe('Active')
  })
})
