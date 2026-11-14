import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'

const css = readUiCss('WeekdayPicker/WeekdayPicker.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('WeekdayPicker.css', () => {
  it('styles the group, the chips and the selected state', () => {
    for (const sel of ['.weekday-picker', '.weekday-picker__chips', '.weekday-picker__chip', '[aria-pressed="true"]']) expect(css, sel).toContain(sel)
  })
  it('seven equal columns that fit a 390 px phone: no wrapping row, no sideways scroll', () => {
    expect(css).toMatch(/grid-template-columns\s*:\s*repeat\(\s*7\s*,\s*minmax\(0,\s*1fr\)\s*\)/)
    expect(css).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/)
  })
  it('44 px touch targets, with a gap small enough that 7 chips are at least 44 px wide in a 326 px sheet', () => {
    expect(css).toMatch(/min-block-size\s*:\s*44px|min-height\s*:\s*44px/)
    // B9-07 (DS-11): the chip gap is the 2 px micro gap token, --space-half
    const gap = /\.weekday-picker__chips\s*\{[^}]*gap\s*:\s*var\(--space-half\)/.exec(css)
    expect(gap, 'the chips gap must be --space-half (2 px)').not.toBeNull()
  })
  it('tokens only, a visible focus ring and a selected state that is not colour alone', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(/)
    expect(css).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
    expect(css).toMatch(/:focus-visible/)
    expect(css).toMatch(/\[aria-pressed="true"\][^{]*\{[^}]*font-weight/)
  })
})
