import { describe, expect, it } from 'vitest'
import { TONE_COUNT, tileArt } from './tileArt'

describe('tileArt', () => {
  it('uses the upper-cased first letter of the name', () => {
    expect(tileArt('pancakes', []).initial).toBe('P')
    expect(tileArt('  éclair', []).initial).toBe('É')
    expect(tileArt('', []).initial).toBe('?')
  })

  it('picks the icon of the first Tag that has one, matching whole words case-insensitively', () => {
    expect(tileArt('x', ['Fish']).icon).toBe('fish')
    expect(tileArt('x', ['weeknight', 'fish pie']).icon).toBe('fish')
    expect(tileArt('x', ['Pasta', 'fish']).icon).toBe('pasta')
    expect(tileArt('x', ['roast']).icon).toBe('roast')
    expect(tileArt('x', ['soup']).icon).toBe('soup')
  })

  it('falls back to the plain dish icon', () => {
    expect(tileArt('x', []).icon).toBe('dish')
    expect(tileArt('x', ['weeknight']).icon).toBe('dish')
    expect(tileArt('x', ['fishy']).icon).toBe('dish') // not a whole word
  })

  it('gives the same tone for the same name and always within range', () => {
    const names = ['Pancakes', 'Chilli', 'Fish pie', 'Apple pie', 'Ramen', 'Dal', 'Tacos', 'Pad thai']
    for (const n of names) {
      const t = tileArt(n, []).tone
      expect(tileArt(n, ['fish']).tone).toBe(t)
      expect(Number.isInteger(t) && t >= 0 && t < TONE_COUNT).toBe(true)
    }
    expect(new Set(names.map((n) => tileArt(n, []).tone)).size).toBeGreaterThan(1)
  })
})
