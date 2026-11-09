import { describe, expect, it } from 'vitest'
import { motionDuration, prefersReducedMotion } from './motion'

const win = (reduced: boolean) =>
  ({
    matchMedia: (q: string) => ({ matches: reduced && q.includes('prefers-reduced-motion'), media: q }),
  }) as unknown as Window

describe('motion', () => {
  it('detects prefers-reduced-motion', () => {
    expect(prefersReducedMotion(win(true))).toBe(true)
    expect(prefersReducedMotion(win(false))).toBe(false)
  })

  it('is false when matchMedia is unavailable', () => {
    expect(prefersReducedMotion({} as Window)).toBe(false)
  })

  it('collapses durations to 0 when reduced', () => {
    expect(motionDuration(200, win(true))).toBe(0)
  })

  it('caps durations at 250 ms otherwise', () => {
    expect(motionDuration(200, win(false))).toBe(200)
    expect(motionDuration(900, win(false))).toBe(250)
  })
})
