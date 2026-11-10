import { describe, expect, it } from 'vitest'
import type { CookTimer } from '../types'
import { finishedIds, measureSkew, newlyFinished, remainingSeconds, sortTimers } from './timers'

const T0 = Date.parse('2026-11-09T18:00:00Z')

function timer(over: Partial<CookTimer>): CookTimer {
  return { id: 1, scope: null, step: null, label: 'Eggs', durationSeconds: 300, state: 'running', remainingSeconds: 300, endsAt: '2026-11-09T18:05:00Z', startedAt: '2026-11-09T18:00:00Z', ...over }
}

describe('measureSkew', () => {
  it('is serverNow minus the client clock', () => {
    expect(measureSkew('2026-11-09T18:00:05Z', T0)).toBe(5000)
    expect(measureSkew('2026-11-09T17:59:50Z', T0)).toBe(-10000)
  })
})

describe('remainingSeconds', () => {
  it('counts a running timer down to endsAt, rounding up', () => {
    expect(remainingSeconds(timer({}), T0, 0)).toBe(300)
    expect(remainingSeconds(timer({}), T0 + 100_400, 0)).toBe(200)
    expect(remainingSeconds(timer({}), T0 + 299_001, 0)).toBe(1)
  })
  it('never goes below zero', () => {
    expect(remainingSeconds(timer({}), T0 + 400_000, 0)).toBe(0)
  })
  it('corrects for a client clock that is behind or ahead of the server', () => {
    // The tablet clock reads 30 s behind the server: server time = client + 30 s.
    expect(remainingSeconds(timer({}), T0 - 30_000, 30_000)).toBe(300)
    expect(remainingSeconds(timer({}), T0 + 30_000, -30_000)).toBe(300)
  })
  it('shows a paused timer as sent, whatever the clock does', () => {
    const p = timer({ state: 'paused', endsAt: null, remainingSeconds: 200 })
    expect(remainingSeconds(p, T0 + 999_999, 0)).toBe(200)
  })
  it('a finished timer has nothing left', () => {
    expect(remainingSeconds(timer({ state: 'finished', remainingSeconds: 0 }), T0, 0)).toBe(0)
  })
})

describe('sortTimers', () => {
  it('orders running by soonest end, then paused, then finished', () => {
    const slow = timer({ id: 1, label: 'slow', endsAt: '2026-11-09T18:15:00Z' })
    const fast = timer({ id: 2, label: 'fast', endsAt: '2026-11-09T18:02:00Z' })
    const paused = timer({ id: 3, label: 'paused', state: 'paused', endsAt: null, remainingSeconds: 30 })
    const done = timer({ id: 4, label: 'done', state: 'finished', remainingSeconds: 0 })
    const input = [done, slow, paused, fast]
    const sorted = sortTimers(input, T0, 0)
    expect(sorted.map((t) => t.id)).toEqual([2, 1, 3, 4])
    expect(input.map((t) => t.id)).toEqual([4, 1, 3, 2])
  })
})

describe('finished timers', () => {
  it('a running timer past its end counts as finished before the server says so', () => {
    const t = timer({ id: 7 })
    expect(finishedIds([t], T0 + 299_000, 0)).toEqual([])
    expect(finishedIds([t], T0 + 300_000, 0)).toEqual([7])
    expect(finishedIds([timer({ id: 8, state: 'finished', remainingSeconds: 0 })], T0, 0)).toEqual([8])
  })

  it('newlyFinished reports only ids that turned finished while watching', () => {
    expect(newlyFinished([], [1, 2])).toEqual([1, 2])
    expect(newlyFinished([1], [1, 2])).toEqual([2])
    expect(newlyFinished([1, 2], [1, 2])).toEqual([])
  })

  it('the first look at the page never rings (null before)', () => {
    expect(newlyFinished(null, [1, 2])).toEqual([])
  })
})
