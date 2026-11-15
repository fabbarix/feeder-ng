// B9-18 (SHORT toast offset, SSP-12, review items): the CSS contract of where a toast sits and how Dismiss lines up (read as text).
//   - the region clears the bottom bar (--nav-top), the on-screen keyboard (--keyboard-inset) and, on a page with one, the sticky action bar
//   - the Scan half-sheet lift is gone: SSP-12 holds toasts while the Price keypad is open instead of lifting them into the priced row's band
//   - Dismiss is top-aligned in both layouts: a toast with actions but no subline puts it level with the headline (R-D+)
//   - a toast with no Dismiss (data-dismiss="none") does not reserve the column
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('Toast.css')
const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const rulesFor = (pred: (selector: string) => boolean) => ruleBlocks(css).filter((r) => r.selectors.some((s) => pred(norm(s))))

describe('Toast.css offsets', () => {
  it('the region sits above the bottom bar and the on-screen keyboard', () => {
    const d = declarations(css, '.toast-region')
    expect(d['bottom']).toContain('var(--nav-top)')
    expect(d['bottom']).toContain('var(--keyboard-inset)')
    expect(d['position']).toBe('fixed')
  })

  it('every rule that moves the region keeps the bar and the keyboard in its bottom', () => {
    const rules = rulesFor((s) => s.includes('.toast-region') && !s.includes('.toast-live'))
    const bottoms = rules.map((r) => /bottom:\s*([^;]+)/.exec(r.body)?.[1]).filter(Boolean) as string[]
    expect(bottoms.length).toBeGreaterThanOrEqual(2) // the base and the sticky-bar lift
    for (const b of bottoms) {
      expect(b).toContain('var(--nav-top)')
      expect(b).toContain('var(--keyboard-inset)')
    }
  })

  it('a page with a sticky action bar lifts the region by the bar and its clearance (it never covers Save)', () => {
    const lift = rulesFor((s) => s.includes('.sticky-action-bar') && s.includes('.toast-region'))
    expect(lift).toHaveLength(1)
    expect(lift[0]!.body).toContain('var(--sticky-bar-clearance)')
    expect(lift[0]!.body).toContain('var(--page-gutter)')
  })

  it('the half-sheet lift is gone (SSP-12: a toast is held while the keypad is open, never lifted into the priced row)', () => {
    expect(css).not.toMatch(/data-modal/)
    expect(css).not.toMatch(/data-size=.half./)
    expect(css).not.toMatch(/50dvh/)
  })

  it('uses no raw px for the offsets: tokens only (raw-spacing)', () => {
    const bottoms = rulesFor((s) => s.includes('.toast-region')).map((r) => /bottom:\s*([^;]+)/.exec(r.body)?.[1] ?? '')
    for (const b of bottoms) expect(b.replace(/var\([^)]*\)/g, '')).not.toMatch(/\d+(\.\d+)?(px|rem)/)
  })
})

describe('Toast.css Dismiss alignment (R-D+)', () => {
  it('Dismiss is top-aligned in the stack layout and also in the line layout (never vertically centred)', () => {
    expect(declarations(css, '.toast__dismiss')['align-self']).toBe('flex-start')
    const lineOverrides = rulesFor((s) => s.includes("[data-layout='line']") && s.includes('.toast__dismiss'))
    for (const r of lineOverrides) expect(r.body).not.toMatch(/align-self:\s*center/)
  })

  it('the headline row is as tall as Dismiss (32 px) so the headline and Dismiss share a centre line, in the line layout too', () => {
    const d = declarations(css, ".toast[data-layout='line'] .toast__title")
    expect(d['min-block-size']).toBe('var(--space-8)')
  })

  it('a toast with no Dismiss gives the content the full width: no empty column', () => {
    const none = rulesFor((s) => s.includes("[data-dismiss='none']"))
    expect(none.length).toBeGreaterThan(0)
    expect(none.map((r) => r.body).join(' ')).toMatch(/padding-inline-end:/)
  })
})
