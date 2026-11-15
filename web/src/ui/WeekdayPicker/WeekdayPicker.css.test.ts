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
  it('44 px touch targets; the chips are 8 px apart (VC6: never touching) and a coarse pointer gets a 44 px wide target from ::after', () => {
    expect(css).toMatch(/min-block-size\s*:\s*44px|min-height\s*:\s*44px/)
    // B9-42 (batch review): the chip gap is --space-2 (8 px); at 375 px the chips are about 41 px wide, so the target grows by ::after.
    const gap = /\.weekday-picker__chips\s*\{[^}]*gap\s*:\s*var\(--space-2\)/.exec(css)
    expect(gap, 'the chips gap must be --space-2 (8 px)').not.toBeNull()
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{\s*\.weekday-picker__chip::after\s*\{[^}]*var\(--target-min\)/)
  })
  it('the ✓ badge sits inside its chip, clear of the border', () => {
    const svg = /\.weekday-picker__chip svg\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(svg).toMatch(/inset-block-start\s*:\s*var\(--space-1\)/)
    expect(svg).toMatch(/inset-inline-end\s*:\s*var\(--space-1\)/)
  })
  it('tokens only, a visible focus ring and a selected state that is not colour alone', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(/)
    expect(css).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
    expect(css).toMatch(/:focus-visible/)
    expect(css).toMatch(/\[aria-pressed="true"\][^{]*\{[^}]*font-weight/)
  })
})
