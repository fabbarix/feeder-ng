// B9-25 (PC-04): resume at the last Step. Cook Mode reopens at the last Step shown, kept per device in localStorage with try/catch.
//   key    feeder.cook.resume.<scope>      (the scope as the server names it: "recipe:12", "meal:2026-11-09/3/1")
//   value  "<CookStep.index>"              the Step to reopen on
//          "<CookStep.index>+"             reopen on the Step AFTER it (a finished timer: "From a finished timer, it opens at the next Step")
// The Step is the CookStep.index (what a timer's `step` holds), not its position: Steps a Base recipe's Stock covers are left out of
// the list, so a position would drift. Cooked clears the Step.
import { describe, expect, it, vi } from 'vitest'
import { clearResume, readResume, RESUME_PREFIX, resumeKey, resumePosition, saveResume, timerOpenPlan } from './resume'

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: vi.fn((k: string) => void data.delete(k)),
  }
}
const broken = () => ({
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
})

describe('resumeKey', () => {
  it('is feeder.cook.resume.<scope>, one key per scope (a Recipe and a Planned Meal Course resume separately)', () => {
    expect(RESUME_PREFIX).toBe('feeder.cook.resume.')
    expect(resumeKey('recipe:12')).toBe('feeder.cook.resume.recipe:12')
    expect(resumeKey('meal:2026-11-09/3/1')).toBe('feeder.cook.resume.meal:2026-11-09/3/1')
  })
})

describe('saveResume / readResume / clearResume', () => {
  it('stores the Step index as a plain integer and reads it back', () => {
    const s = memory()
    saveResume('recipe:12', 4, undefined, s)
    expect(s.data.get('feeder.cook.resume.recipe:12')).toBe('4')
    expect(readResume('recipe:12', s)).toEqual({ step: 4, after: false })
  })

  it('"after" is kept as a "+" so a finished timer opens on the next Step', () => {
    const s = memory()
    saveResume('recipe:12', 2, { after: true }, s)
    expect(s.data.get('feeder.cook.resume.recipe:12')).toBe('2+')
    expect(readResume('recipe:12', s)).toEqual({ step: 2, after: true })
  })

  it('a later save replaces the earlier one (also after -> not after)', () => {
    const s = memory()
    saveResume('recipe:12', 2, { after: true }, s)
    saveResume('recipe:12', 3, undefined, s)
    expect(readResume('recipe:12', s)).toEqual({ step: 3, after: false })
  })

  it('scopes do not mix', () => {
    const s = memory()
    saveResume('recipe:12', 2, undefined, s)
    saveResume('meal:2026-11-09/3/1', 5, undefined, s)
    expect(readResume('recipe:12', s)).toEqual({ step: 2, after: false })
    expect(readResume('meal:2026-11-09/3/1', s)).toEqual({ step: 5, after: false })
    expect(readResume('recipe:13', s)).toBeNull()
  })

  it('Step 0 is a Step (the first one), not "nothing stored"', () => {
    const s = memory()
    saveResume('recipe:12', 0, undefined, s)
    expect(readResume('recipe:12', s)).toEqual({ step: 0, after: false })
  })

  it('clearResume removes only that scope', () => {
    const s = memory()
    saveResume('recipe:12', 2, undefined, s)
    saveResume('recipe:13', 1, undefined, s)
    clearResume('recipe:12', s)
    expect(readResume('recipe:12', s)).toBeNull()
    expect(readResume('recipe:13', s)).toEqual({ step: 1, after: false })
  })

  it('anything that is not "<n>" or "<n>+" reads as nothing (never throws, never NaN)', () => {
    for (const bad of ['', 'abc', '-1', '1.5', '2++', '+', ' 3', 'NaN', '1e3', '99999999999999999999']) {
      expect(readResume('recipe:12', memory({ 'feeder.cook.resume.recipe:12': bad })), JSON.stringify(bad)).toBeNull()
    }
  })

  it('blocked storage (try/catch): save and clear do nothing, read is null, no exception reaches the caller', () => {
    const s = broken()
    expect(() => saveResume('recipe:12', 2, undefined, s)).not.toThrow()
    expect(() => clearResume('recipe:12', s)).not.toThrow()
    expect(readResume('recipe:12', s)).toBeNull()
  })

  it('no storage at all (null) is the same as blocked', () => {
    expect(() => saveResume('recipe:12', 2, undefined, null)).not.toThrow()
    expect(readResume('recipe:12', null)).toBeNull()
  })

  it('defaults to window.localStorage', () => {
    window.localStorage.removeItem('feeder.cook.resume.recipe:77')
    saveResume('recipe:77', 6)
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:77')).toBe('6')
    expect(readResume('recipe:77')).toEqual({ step: 6, after: false })
    clearResume('recipe:77')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:77')).toBeNull()
  })
})

describe('resumePosition: where in the Step list to open', () => {
  const steps = [{ index: 1 }, { index: 2 }, { index: 4 }, { index: 5 }] // Steps 0 and 3 are Advance Steps or covered by Stock

  it('nothing stored: the first Step (position 0)', () => {
    expect(resumePosition(steps, null)).toBe(0)
  })

  it('finds the Step by its index, not by position', () => {
    expect(resumePosition(steps, { step: 4, after: false })).toBe(2)
    expect(resumePosition(steps, { step: 1, after: false })).toBe(0)
  })

  it('"after" opens on the next Step in the list (a Step that is left out is skipped over)', () => {
    expect(resumePosition(steps, { step: 2, after: true })).toBe(2)
    expect(resumePosition(steps, { step: 1, after: true })).toBe(1)
  })

  it('"after" on the last Step stays on the last Step', () => {
    expect(resumePosition(steps, { step: 5, after: true })).toBe(3)
  })

  it('a stored Step that is no longer in the list opens the first Step', () => {
    expect(resumePosition(steps, { step: 3, after: false })).toBe(0)
    expect(resumePosition(steps, { step: 99, after: true })).toBe(0)
  })

  it('a Recipe with no Steps is position 0', () => {
    expect(resumePosition([], { step: 2, after: false })).toBe(0)
    expect(resumePosition([], null)).toBe(0)
  })
})

describe('timerOpenPlan: where tapping a timer goes, and what Step Cook Mode then opens on', () => {
  it('a Recipe timer opens /cook/recipe/<id> on the timer\'s Step', () => {
    expect(timerOpenPlan({ scope: 'recipe:12', step: 2, state: 'running' }, 600)).toEqual({
      path: '/cook/recipe/12',
      resume: { scope: 'recipe:12', step: 2, after: false },
    })
  })

  it('a Planned Meal Course timer opens /cook/meal/<date>/<slot>/<course>', () => {
    expect(timerOpenPlan({ scope: 'meal:2026-11-09/3/1', step: 4, state: 'paused' }, 300)).toEqual({
      path: '/cook/meal/2026-11-09/3/1',
      resume: { scope: 'meal:2026-11-09/3/1', step: 4, after: false },
    })
  })

  it('a FINISHED timer opens on the next Step (after: true), whether the server says finished or the countdown reached 0', () => {
    expect(timerOpenPlan({ scope: 'recipe:12', step: 2, state: 'finished' }, 0)?.resume).toEqual({ scope: 'recipe:12', step: 2, after: true })
    expect(timerOpenPlan({ scope: 'recipe:12', step: 2, state: 'running' }, 0)?.resume).toEqual({ scope: 'recipe:12', step: 2, after: true })
  })

  it('a paused timer with 0 seconds left is not finished (a paused timer never runs out)', () => {
    expect(timerOpenPlan({ scope: 'recipe:12', step: 2, state: 'paused' }, 0)?.resume?.after).toBe(false)
  })

  it('a timer with a scope but no Step opens that Cook Mode with nothing to resume', () => {
    expect(timerOpenPlan({ scope: 'recipe:12', step: null, state: 'running' }, 60)).toEqual({ path: '/cook/recipe/12', resume: null })
  })

  it('a free timer (no scope) has no Cook Mode to open: null', () => {
    expect(timerOpenPlan({ scope: null, step: null, state: 'running' }, 60)).toBeNull()
  })

  it('a scope that is not a Recipe or a Course scope is null (the two-part "meal:date/slot" form is no scope, crs-c3)', () => {
    expect(timerOpenPlan({ scope: 'meal:2026-11-09/3', step: 1, state: 'running' }, 60)).toBeNull()
    expect(timerOpenPlan({ scope: 'bogus', step: 1, state: 'running' }, 60)).toBeNull()
  })
})
