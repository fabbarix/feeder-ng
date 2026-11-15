// B9-25 (PC-04): the CSS contract of app/ShellTimers.css, read as text (no layout in jsdom; the page-layout scenario `timer-pill`
// measures the real thing in Chrome). The mocks: mocks/pc-04-timer-pill.html and pc-04-timer-done.html (.pc-shell-pill, .pc-alert).
//   Pill   phone and tablet: fixed at the inline end, 16 px (--space-4) from it, above the bottom bar (--nav-top) and the keyboard
//          (--keyboard-inset), lifted over a sticky action bar like the toast region; from 64em it sits in the top bar, centred.
//          The shell keeps 16 px around the pill so its ring is never clipped. No slide-in under reduced motion.
//   Banner fixed under the top inset, success tone with a 2 px success boundary; Dismiss is a surface-filled secondary with a 1 px outline.
import { describe, expect, it } from 'vitest'
import { parseCss } from '../ui/lib/cssWalk.test-helper'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/app/ShellTimers.css`, 'utf8')
const blocks = parseCss(css, 'app/ShellTimers.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const media = (atrules: string[]) => atrules.map(q).join(' | ')

/** Merged declarations of the rules with exactly this selector (alone or in a list) under exactly these at-rules. */
function at(selector: string, atrules: string[] = []): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of blocks) {
    if (media(b.atrules) !== media(atrules)) continue
    if (!b.selector.split(',').map(q).includes(selector)) continue
    for (const [k, v] of b.decls) out[k] = v
  }
  return out
}
const WIDE = ['@media (min-width: 64em)']

describe('the file exists and is not empty', () => {
  it('has rules for .shell-timer and .shell-timer-banner', () => {
    expect(Object.keys(at('.shell-timer')).length).toBeGreaterThan(0)
    expect(Object.keys(at('.shell-timer-banner')).length).toBeGreaterThan(0)
  })
})

describe('.shell-timer (the pill\'s place)', () => {
  it('phone and tablet: fixed at the inline end, 16 px in', () => {
    const d = at('.shell-timer')
    expect(d['position']).toBe('fixed')
    expect(d['inset-inline-end']).toBe('var(--space-4)')
  })

  it('sits above the bottom bar and the keyboard: bottom = --nav-top + --keyboard-inset + --space-4 (never over the bar)', () => {
    const bottom = q(at('.shell-timer')['bottom'] ?? at('.shell-timer')['inset-block-end'] ?? '')
    expect(bottom).toContain('var(--nav-top)')
    expect(bottom).toContain('var(--keyboard-inset)')
    expect(bottom).toContain('var(--space-4)')
    expect(bottom).not.toMatch(/\d+px/)
  })

  it('on a page with a sticky action bar it is lifted by the bar\'s room (never over Save or Start Cook Mode)', () => {
    const d = at('html:has(.sticky-action-bar) .shell-timer')
    const bottom = q(d['bottom'] ?? d['inset-block-end'] ?? '')
    expect(bottom).toContain('var(--nav-top)')
    expect(bottom).toContain('var(--sticky-bar-clearance)')
    expect(bottom).toContain('var(--page-gutter)')
    expect(bottom).toContain('var(--keyboard-inset)')
  })

  it('is above the page and the bars, under the banner and sheets: z-index 30 (the toast region\'s)', () => {
    expect(at('.shell-timer')['z-index']).toBe('30')
  })

  // Main-session call (w4a): centred in the top bar, as the mock's 1440 render draws it (not before Your menu).
  it('from 64em it leaves the bottom corner for the top bar, centred in it: top-anchored, not bottom-anchored', () => {
    const d = at('.shell-timer', WIDE)
    expect(d['inset-block-end'] ?? d['bottom']).toBe('auto')
    expect(d['inset-block-start'] ?? d['top']).toBeTruthy()
    expect(d['inset-inline']).toBe('0')
    expect(d['inline-size']).toBe('fit-content')
    expect(d['margin-inline']).toBe('auto')
  })

  it('the width queries are table widths in em (the breakpoint guard): 64em, nothing in px', () => {
    for (const b of blocks) for (const a of b.atrules) expect(a, a).not.toMatch(/\d+px\)/)
  })

  it('the pill has no entrance animation or transition outside prefers-reduced-motion: no-preference', () => {
    for (const b of blocks) {
      const moves = b.decls.some(([p]) => p === 'animation' || p === 'animation-name' || p === 'transition' || p.startsWith('transition-'))
      if (!moves) continue
      expect(media(b.atrules), `${b.selector} moves`).toContain('prefers-reduced-motion: no-preference')
    }
  })

  it('floats: a drop shadow with the pill\'s 1 px boundary written into the same box-shadow (an --elev token is none in dark and would drop the boundary)', () => {
    const v = q(at('.shell-timer .timer-pill')['box-shadow'] ?? '')
    expect(v).toContain('inset 0 0 0 1px var(--color-outline)')
    expect(v).not.toContain('var(--elev')
    expect(v).toMatch(/^\d+px \d+px \d+px /) // a real outer shadow first
  })

  it('finished: the same drop shadow with the 2 px success boundary', () => {
    const v = q(at(".shell-timer[data-state='finished'] .timer-pill")['box-shadow'] ?? '')
    expect(v).toContain('inset 0 0 0 2px var(--status-success-fg)')
    expect(v).not.toContain('var(--elev')
  })

  it('from 64em the pill sits in the top bar: no drop shadow, only the boundary', () => {
    const v = q(at('.shell-timer .timer-pill', WIDE)['box-shadow'] ?? '')
    expect(v).toBe('inset 0 0 0 1px var(--color-outline)')
  })
})

describe('.shell-timer-banner (the finish alert)', () => {
  it('is fixed under the top inset, 12 px in from both sides, above the pill', () => {
    const d = at('.shell-timer-banner')
    expect(d['position']).toBe('fixed')
    expect(q(d['inset-block-start'] ?? d['top'] ?? '')).toContain('var(--safe-top)')
    expect(q(d['inset-block-start'] ?? d['top'] ?? '')).toContain('var(--space-3)')
    expect(d['inset-inline']).toBe('var(--space-3)')
    expect(Number(d['z-index'])).toBeGreaterThan(30)
  })

  it('is the success tone with a 2 px success boundary (not the old red)', () => {
    const d = at('.shell-timer-banner')
    expect(d['background']).toBe('var(--status-success-bg)')
    expect(d['color']).toBe('var(--status-success-fg)')
    expect(q(d['border'] ?? '')).toMatch(/^2px solid var\(--status-success-fg\)$/)
    expect(d['border-radius']).toBe('var(--radius-tile)')
  })

  it('the headline is title-3 and the Recipe line is body weight (no running sentence in bold)', () => {
    const title = at('.shell-timer-banner__title')
    expect(title['font-size']).toBe('var(--text-title-3-size)')
    expect(title['line-height']).toBe('var(--text-title-3-line)')
    const sub = at('.shell-timer-banner__subline')
    expect(Number(sub['font-weight'] ?? 400)).toBeLessThanOrEqual(500)
  })

  it('Dismiss is a surface-filled outlined button: boundary 3.8:1 on success-bg, label 17:1 (R-A)', () => {
    const d = at(".shell-timer-banner .button[data-variant='secondary']")
    expect(d['background']).toBe('var(--color-surface)')
    expect(q(d['box-shadow'] ?? '')).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(d['color'] ?? 'var(--color-text)').toBe('var(--color-text)')
  })

  it('no transition or animation outside prefers-reduced-motion: no-preference (the banner appears at once)', () => {
    for (const b of blocks.filter((x) => /banner/.test(x.selector))) {
      const moves = b.decls.some(([p]) => p === 'animation' || p.startsWith('transition'))
      if (moves) expect(media(b.atrules)).toContain('no-preference')
    }
  })
})

describe('the Timers sheet rows', () => {
  it('a row is a grid of title block and time, the time tabular', () => {
    const t = at('.shell-timer-row__time')
    expect(t['font-variant-numeric']).toBe('tabular-nums')
  })
})
