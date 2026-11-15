// B9-25 (PC-04): the household's timers as the shell shows them. Pure functions (no React).
import { describe, expect, it } from 'vitest'
import type { CookTimer } from '../types'
import { bannerText, nameSecondsFor, opensTimersSheet, parseTimerLabel, summarizeTimers, type ShellTimer } from './householdTimers'

function t(over: Partial<CookTimer> = {}): CookTimer {
  return {
    id: 1,
    scope: 'recipe:12',
    step: 2,
    recipeName: 'Roast chicken with rice and a sauce',
    label: 'Step 3: roast the chicken',
    durationSeconds: 1800,
    state: 'running',
    remainingSeconds: 600,
    endsAt: '2026-11-09T18:10:00Z',
    startedAt: '2026-11-09T18:00:00Z',
    ...over,
  }
}
const item = (timer: CookTimer, seconds = timer.remainingSeconds) => ({ timer, seconds })

describe('parseTimerLabel: sentence case, no "Step N:" prefix', () => {
  it('the server\'s "Step N: text" label gives the text (first letter upper case) and the Step number', () => {
    expect(parseTimerLabel('Step 3: roast the chicken')).toEqual({ title: 'Roast the chicken', stepNumber: 3 })
    expect(parseTimerLabel('Step 2: Simmer the stew')).toEqual({ title: 'Simmer the stew', stepNumber: 2 })
    expect(parseTimerLabel('Step 12: rest')).toEqual({ title: 'Rest', stepNumber: 12 })
  })

  it('a free timer\'s label is its title with no Step', () => {
    expect(parseTimerLabel('Eggs')).toEqual({ title: 'Eggs', stepNumber: null })
    expect(parseTimerLabel('boil eggs')).toEqual({ title: 'Boil eggs', stepNumber: null })
  })

  it('only the first letter changes: the rest of the sentence keeps its case ("DOP", "°C")', () => {
    expect(parseTimerLabel('Step 1: bake at 220 °C for the DOP cheese').title).toBe('Bake at 220 °C for the DOP cheese')
  })

  it('"Step" in the middle, or a prefix with no number, is part of the title', () => {
    expect(parseTimerLabel('Next step: stir')).toEqual({ title: 'Next step: stir', stepNumber: null })
    expect(parseTimerLabel('Step: stir')).toEqual({ title: 'Step: stir', stepNumber: null })
  })

  it('an empty text after the prefix keeps the whole label', () => {
    expect(parseTimerLabel('Step 3: ')).toEqual({ title: 'Step 3:', stepNumber: null })
  })
})

describe('summarizeTimers: which timer the pill shows, and how many others', () => {
  it('no timers: no head, nothing else (the pill does not show)', () => {
    expect(summarizeTimers([])).toEqual({ head: null, more: 0, finished: [], all: [] })
  })

  it('one running timer: it is the head, no "+N"', () => {
    const s = summarizeTimers([item(t(), 1122)])
    expect(s.head).toMatchObject({ id: 1, title: 'Roast the chicken', stepNumber: 3, step: 2, scope: 'recipe:12', recipeName: 'Roast chicken with rice and a sauce', seconds: 1122, state: 'running' })
    expect(s.more).toBe(0)
    expect(s.finished).toEqual([])
    expect(s.all).toHaveLength(1)
  })

  it('the head is the SOONEST running timer; "+N" counts every other timer (running, paused and finished)', () => {
    const a = item(t({ id: 1, endsAt: '2026-11-09T18:20:00Z' }), 1200)
    const b = item(t({ id: 2, endsAt: '2026-11-09T18:05:00Z', label: 'Step 5: rest' }), 300)
    const c = item(t({ id: 3, state: 'paused', endsAt: null, remainingSeconds: 90, label: 'Eggs', scope: null, step: null }), 90)
    const s = summarizeTimers([a, b, c])
    expect(s.head?.id).toBe(2)
    expect(s.more).toBe(2)
    expect(s.all.map((x) => x.id)).toEqual([2, 1, 3])
  })

  it('a paused timer is the head only when nothing runs', () => {
    const paused = item(t({ id: 4, state: 'paused', endsAt: null, remainingSeconds: 90 }), 90)
    expect(summarizeTimers([paused]).head).toMatchObject({ id: 4, state: 'paused' })
    expect(summarizeTimers([paused, item(t({ id: 5 }), 400)]).head?.id).toBe(5)
  })

  it('a FINISHED timer is the head over a running one: the pill turns to the finished state while others run', () => {
    const done = item(t({ id: 7, state: 'finished', remainingSeconds: 0, endsAt: '2026-11-09T18:00:00Z' }), 0)
    const running = item(t({ id: 8 }), 500)
    const s = summarizeTimers([running, done])
    expect(s.head).toMatchObject({ id: 7, state: 'finished', seconds: 0 })
    expect(s.more).toBe(1)
    expect(s.finished.map((x) => x.id)).toEqual([7])
  })

  it('a running timer whose countdown reached 0 on this device counts as finished before the server says so', () => {
    const s = summarizeTimers([item(t({ id: 9, state: 'running' }), 0)])
    expect(s.head).toMatchObject({ id: 9, state: 'finished' })
    expect(s.finished.map((x) => x.id)).toEqual([9])
  })

  it('a paused timer with 0 seconds is not finished', () => {
    const s = summarizeTimers([item(t({ id: 10, state: 'paused', endsAt: null, remainingSeconds: 0 }), 0)])
    expect(s.finished).toEqual([])
    expect(s.head?.state).toBe('paused')
  })

  it('finished timers are listed by id (they share one banner)', () => {
    const s = summarizeTimers([item(t({ id: 12, state: 'finished' }), 0), item(t({ id: 11, state: 'finished' }), 0)])
    expect(s.finished.map((x) => x.id)).toEqual([11, 12])
    expect(s.head?.id).toBe(11)
  })

  it('a missing recipeName (a free timer, an older payload) is "" and a free timer has no Step', () => {
    const s = summarizeTimers([item(t({ id: 13, scope: null, step: null, recipeName: undefined, label: 'Eggs' }), 60)])
    expect(s.head).toMatchObject({ recipeName: '', title: 'Eggs', stepNumber: null, step: null, scope: null })
  })
})

describe('nameSecondsFor: the pill\'s accessible name changes once a minute, the visible time every second', () => {
  it('the first value is taken as it is', () => {
    expect(nameSecondsFor(null, 1122)).toBe(1122)
  })

  it('within the same minute the earlier value is kept', () => {
    expect(nameSecondsFor(1122, 1121)).toBe(1122) // 18:42 -> 18:41 : still the 18-minute minute
    expect(nameSecondsFor(1122, 1080)).toBe(1122) // 18:00
  })

  it('when the minute changes, the new value is taken (once a minute)', () => {
    expect(nameSecondsFor(1122, 1079)).toBe(1079) // 17:59
    expect(nameSecondsFor(1079, 1020)).toBe(1079) // 17:00 is still the same minute as 17:59
  })

  it('a timer that finished, or whose time jumped (resumed, another device), takes the new value at once', () => {
    expect(nameSecondsFor(61, 0)).toBe(0)
    expect(nameSecondsFor(300, 1500)).toBe(1500)
  })
})

describe('bannerText: the finish alert (PC-04)', () => {
  const done = (over: Partial<ShellTimer> = {}): ShellTimer => ({
    id: 1, scope: 'recipe:12', step: 2, recipeName: 'Review roast chicken with rice and a sauce', title: 'Roast the chicken', stepNumber: 3, seconds: 0, state: 'finished', ...over,
  })

  it('one timer: headline "Timer finished: <title>", subline "<Recipe> · Step <n>"', () => {
    expect(bannerText([done()])).toEqual({ headline: 'Timer finished: Roast the chicken', subline: 'Review roast chicken with rice and a sauce · Step 3' })
  })

  it('a free timer has no subline; a Recipe timer without a Step number has the Recipe only', () => {
    expect(bannerText([done({ scope: null, recipeName: '', stepNumber: null, title: 'Eggs' })])).toEqual({ headline: 'Timer finished: Eggs', subline: '' })
    expect(bannerText([done({ stepNumber: null })]).subline).toBe('Review roast chicken with rice and a sauce')
  })

  it('several finished timers share one banner: "<n> timers finished", the titles in the subline', () => {
    expect(bannerText([done(), done({ id: 2, title: 'Simmer the sauce', stepNumber: 2 })])).toEqual({
      headline: '2 timers finished',
      subline: 'Roast the chicken, Simmer the sauce',
    })
  })
})

describe('opensTimersSheet: one Cook Mode to go to, or the Timers sheet', () => {
  const tm = (over: Partial<ShellTimer> = {}): ShellTimer => ({ id: 1, scope: 'recipe:12', step: 2, recipeName: 'R', title: 'x', stepNumber: 1, seconds: 10, state: 'running', ...over })

  it('timers of one scope open that Cook Mode', () => {
    expect(opensTimersSheet([tm()])).toBe(false)
    expect(opensTimersSheet([tm(), tm({ id: 2, step: 4 })])).toBe(false)
  })

  it('timers of several scopes open the Timers sheet', () => {
    expect(opensTimersSheet([tm(), tm({ id: 2, scope: 'recipe:13' })])).toBe(true)
    expect(opensTimersSheet([tm(), tm({ id: 2, scope: 'meal:2026-11-09/3/1' })])).toBe(true)
  })

  it('a free timer has no Cook Mode, so it opens the sheet (alone or beside others)', () => {
    expect(opensTimersSheet([tm({ scope: null, step: null })])).toBe(true)
    expect(opensTimersSheet([tm(), tm({ id: 2, scope: null, step: null })])).toBe(true)
  })

  it('nothing to open: false', () => {
    expect(opensTimersSheet([])).toBe(false)
  })
})
