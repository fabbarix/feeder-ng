import { describe, expect, it } from 'vitest'
import { meal, slot } from '../test-utils'
import { heroCookLabel, heroOverline, heroPhase, heroStartBy } from './hero'

describe('heroPhase', () => {
  const s = slot({ at: '2026-11-10T19:30:00Z', time: '19:30' })
  it('is upcoming before the slot time and awaiting from it', () => {
    expect(heroPhase(s, new Date('2026-11-10T18:00:00Z'))).toBe('upcoming')
    expect(heroPhase(s, new Date('2026-11-10T19:29:59Z'))).toBe('upcoming')
    expect(heroPhase(s, new Date('2026-11-10T19:30:00Z'))).toBe('awaiting')
    expect(heroPhase(s, new Date('2026-11-10T21:00:00Z'))).toBe('awaiting')
  })
})

describe('hero text', () => {
  it('the overline is the Meal Slot and its time in capitals', () => {
    expect(heroOverline(slot({ name: 'Dinner', time: '19:30' }))).toBe('DINNER · 19:30')
    expect(heroOverline(slot({ name: 'Lunch', time: '12:30' }))).toBe('LUNCH · 12:30')
  })

  it('the Cook label carries the duration when known', () => {
    expect(heroCookLabel(meal({ cookMinutes: 45 }))).toBe('Cook · 45 min')
    expect(heroCookLabel(meal({ cookMinutes: 90 }))).toBe('Cook · 1 h 30 min')
    expect(heroCookLabel(meal())).toBe('Cook')
  })

  it('start by only when the meal knows it', () => {
    expect(heroStartBy(meal({ startBy: '18:45' }))).toBe('start 18:45')
    expect(heroStartBy(meal())).toBeNull()
  })
})
