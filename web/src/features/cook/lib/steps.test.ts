import { describe, expect, it } from 'vitest'
import { createNav, goBack, goNext, holdingTimers, isFirst, isLast, stepOverline, tapAction } from './steps'
import type { CookTimer } from '../types'

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

describe('holdingTimers (a Step starts once the Steps in its after have finished)', () => {
  const scope = 'recipe:3'
  const t = (over: Partial<CookTimer>, seconds: number) => ({
    timer: { id: 1, scope, step: 0, label: 'Step 1 · Pre-heat the oven', durationSeconds: 900, state: 'running', remainingSeconds: seconds, endsAt: null, startedAt: '', ...over } as CookTimer,
    seconds,
  })
  const meatIn = { after: [0] }

  it('holds the Step while a timer of a Step it waits for counts down, running or paused', () => {
    expect(holdingTimers(meatIn, [t({}, 252)], scope)).toHaveLength(1)
    expect(holdingTimers(meatIn, [t({ state: 'paused' }, 252)], scope)).toHaveLength(1)
  })
  it('lets it go once that timer is finished, past its end, or cancelled (gone)', () => {
    expect(holdingTimers(meatIn, [t({ state: 'finished' }, 0)], scope)).toEqual([])
    expect(holdingTimers(meatIn, [t({}, 0)], scope)).toEqual([])
    expect(holdingTimers(meatIn, [], scope)).toEqual([])
  })
  it('ignores other Steps, other scopes, free timers and Steps that wait for nothing', () => {
    expect(holdingTimers(meatIn, [t({ step: 2 }, 300)], scope)).toEqual([])
    expect(holdingTimers(meatIn, [t({ scope: 'recipe:9' }, 300)], scope)).toEqual([])
    expect(holdingTimers(meatIn, [t({ scope: null, step: null }, 300)], scope)).toEqual([])
    expect(holdingTimers({ after: [] }, [t({}, 300)], scope)).toEqual([])
    expect(holdingTimers({}, [t({}, 300)], scope)).toEqual([])
    expect(holdingTimers(null, [t({}, 300)], scope)).toEqual([])
  })
})
