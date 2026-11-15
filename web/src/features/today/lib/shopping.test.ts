// B9-44 (TB-12): the words of the "Shopping at <Shop>" tile. New module lib/shopping.ts: shoppingMeta, shoppingTitle.
import { describe, expect, it } from 'vitest'
import { shoppingMeta, shoppingTitle } from './shopping'

const T0 = Date.parse('2026-11-13T10:00:00Z')
const MIN = 60_000

describe('shoppingTitle', () => {
  it('is "Shopping at <Shop>"', () => {
    expect(shoppingTitle('Coop')).toBe('Shopping at Coop')
  })
})

describe('shoppingMeta: "7 scanned · 11 Lines to get · last Scan 4 min ago"', () => {
  const session = (scanned: number, lastScanAt: number) => ({ scanned, lastScanAt })
  it('joins what was scanned, what is left to get and how long ago the last Scan was', () => {
    expect(shoppingMeta(session(7, T0 - 4 * MIN), 11, new Date(T0))).toBe('7 scanned · 11 Lines to get · last Scan 4 min ago')
  })
  it('says "just now" under a minute', () => {
    expect(shoppingMeta(session(1, T0 - 20_000), 3, new Date(T0))).toBe('1 scanned · 3 Lines to get · last Scan just now')
  })
  it('leaves Lines to get out when none are left', () => {
    expect(shoppingMeta(session(2, T0 - 2 * MIN), 0, new Date(T0))).toBe('2 scanned · last Scan 2 min ago')
  })
  it('counts whole minutes down (59 min is the oldest an active session can show)', () => {
    expect(shoppingMeta(session(2, T0 - 59.9 * MIN), 0, new Date(T0))).toBe('2 scanned · last Scan 59 min ago')
  })
})
