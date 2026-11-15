// B9-49: the shell stylesheet's three changes, read from app/shell.css and styles.css.
//   A11Y-10  .skip-link: hidden above the viewport until focused, then an accent pill in the top-start corner (the chapter's CSS).
//   RES-07 / SHORT-05  .app-status: sticky, in the gutter and the safe insets, click-through, beside the rail from 64em.
//   DS-02 / R-F (main-session call, int1)  the labelled bottom bar (376 px up to the next table breakpoint, 37.5em) gives its end label
//            room: the end radius is smaller there, because the labels sit low in the bar since the user's w2c geometry.
import { describe, expect, it } from 'vitest'
import { parseCss } from '../ui/lib/cssWalk.test-helper'
import { declarations, readStylesCss } from '../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/app/shell.css`, 'utf8')
const blocks = parseCss(css, 'app/shell.css')

const conditionsOf = (atrules: string[]) =>
  atrules
    .flatMap((a) => a.replace(/^@media\s*/, '').split(/\s+and\s+/))
    .map((c) => c.trim())
    .sort()
    .join('|')
/** Merged declarations of the rules with this selector under exactly these media conditions ([] = no media). */
function at(selector: string, cond: string[] = []): Record<string, string> {
  const want = conditionsOf(cond.length ? [`@media ${cond.join(' and ')}`] : [])
  const out: Record<string, string> = {}
  for (const b of blocks) {
    if (conditionsOf(b.atrules) !== want) continue
    if (!b.selector.split(',').map((s) => s.trim().replace(/"/g, "'")).includes(selector)) continue
    for (const [k, v] of b.decls) out[k] = v
  }
  return out
}
const DESKTOP = ['(min-width: 64em)']
const LABELLED = ['(min-width: 23.5em)', '(width < 37.5em)']

describe('A11Y-10: .skip-link', () => {
  const link = () => at('.skip-link')
  it('is fixed in the top-start corner, above everything (z-index 100), an accent pill with on-accent body-strong text', () => {
    const d = link()
    expect(d['position']).toBe('fixed')
    expect(d['inset-block-start']).toBe('var(--space-2)')
    expect(d['inset-inline-start']).toBe('var(--space-2)')
    expect(d['z-index']).toBe('100')
    expect(d['padding']).toBe('var(--space-3) var(--space-4)')
    expect(d['border-radius']).toBe('var(--radius-button)')
    expect(d['background']).toBe('var(--color-accent)')
    expect(d['color']).toBe('var(--color-on-accent)')
    expect(d['font-size']).toBe('var(--text-body-strong-size)')
    expect(d['font-weight']).toBe('var(--text-body-strong-weight)')
    expect(d['text-decoration']).toBe('none')
  })

  it('rests above the viewport (a transform, never display: none, so it stays in the tab order)', () => {
    const d = link()
    expect(d['transform']).toBe('translateY(calc(-100% - var(--space-4)))')
    expect(d['display']).toBeUndefined()
    expect(d['visibility']).toBeUndefined()
  })

  it('slides into view on keyboard focus, with a text-coloured 2 px ring outside the pill', () => {
    const d = at('.skip-link:focus-visible')
    expect(d['transform']).toBe('none')
    expect(d['--focus-ring-color']).toBe('var(--color-text)')
  })

  it('slides only where the User allows motion (with reduced motion it appears without the slide)', () => {
    const motion = at('.skip-link', ['(prefers-reduced-motion: no-preference)'])
    expect(motion['transition']).toMatch(/^transform var\(--dur-1\) var\(--ease-out\)$/)
    expect(link()['transition']).toBeUndefined()
  })
})

describe('RES-07 / SHORT-05: .app-status, the sticky banner slot', () => {
  const status = () => at('.app-status')
  it('is sticky at the top, below sheets and toasts and above content (z-index 9)', () => {
    const d = status()
    expect(d['position']).toBe('sticky')
    expect(d['top']).toBe('0')
    expect(d['z-index']).toBe('9')
  })

  it('sits in the page gutter and never inside a safe-area inset (SHORT-05), with --space-2 above the pill', () => {
    const d = status()
    expect(d['padding-inline']).toBe('max(var(--gutter), var(--safe-left)) max(var(--gutter), var(--safe-right))')
    expect(d['padding-top']).toBe('var(--space-2)')
  })

  it('is click-through: only the pill takes pointer events, so the page under the slot stays operable', () => {
    expect(status()['pointer-events']).toBe('none') // the pill's own pointer-events: auto is pinned with OfflineBanner.css below
  })

  it('an empty slot (online) takes no room: no padding without a child', () => {
    const empty = at('.app-status:empty')
    expect(empty['display'] === 'none' || empty['padding'] === '0' || empty['padding-block'] === '0').toBe(true)
  })

  it('from 64em the banner aligns with the page column: column 2, row 2; the rail spans rows 2 to 3; <main> is column 2, row 3', () => {
    expect(at('.app-shell:not(.app-shell--chromeless) > .app-status', DESKTOP)['grid-column'] ?? at('.app-status', DESKTOP)['grid-column']).toBe('2')
    expect(at('.app-shell:not(.app-shell--chromeless) > .app-status', DESKTOP)['grid-row'] ?? at('.app-status', DESKTOP)['grid-row']).toBe('2')
    expect(at('.side-rail', DESKTOP)['grid-row']).toBe('2 / 4')
    expect(at('.side-rail', DESKTOP)['grid-column']).toBe('1')
    const main = at('.app-shell:not(.app-shell--chromeless) > .app-main', DESKTOP)
    expect(main['grid-column'] ?? at('.app-main', DESKTOP)['grid-column']).toBe('2')
    expect(main['grid-row'] ?? at('.app-main', DESKTOP)['grid-row']).toBe('3')
  })
})

describe('the toast region on a chromeless screen (B9-25/B9-49 follow-up)', () => {
  it('--nav-top is the bottom inset alone wherever a chromeless frame is on the page: the toast region lives outside .app-shell, so a rule on the frame never reached it (it floated 82 px up over nothing)', () => {
    const d = { ...at('html:has(.app-shell--chromeless)'), ...at(':root:has(.app-shell--chromeless)') }
    expect(d['--nav-top']).toBe('var(--safe-bottom)')
    expect(d['--nav-clearance'] ?? '0px').toMatch(/^0(px)?$/)
  })
})

describe('OfflineBanner.css: the pill reads over scrolled content', () => {
  const banner = parseCss(readFileSync(`${cwd}/src/ui/OfflineBanner.css`, 'utf8'), 'ui/OfflineBanner.css')
  const rule = (sel: string, cond: string[] = []) => {
    const want = conditionsOf(cond.length ? [`@media ${cond.join(' and ')}`] : [])
    const out: Record<string, string> = {}
    for (const b of banner) if (conditionsOf(b.atrules) === want && b.selector.split(',').map((s) => s.trim()).includes(sel)) for (const [k, v] of b.decls) out[k] = v
    return out
  }
  it('has an elevation (--elev-1) and takes pointer events itself', () => {
    expect(rule('.offline-banner')['box-shadow']).toBe('var(--elev-1)')
    expect(rule('.offline-banner')['pointer-events']).toBe('auto')
  })
  it('the queue line: on its own line below 600 px, indented 24 px under the text, with the tile radius on the pill; inline from 600 px', () => {
    const phone = rule('.offline-banner__queue')
    expect(phone['flex-basis']).toBe('100%')
    expect(phone['padding-inline-start']).toBe('var(--space-6)')
    expect(rule('.offline-banner', ['(width < 37.5em)'])['border-radius'] ?? rule('.offline-banner')['border-radius']).toBe('var(--radius-tile-sm)')
    const inline = rule('.offline-banner__queue', ['(min-width: 37.5em)'])
    expect(inline['flex-basis']).toBe('auto')
    expect(inline['padding-inline-start']).toBe('0')
  })
})

describe('DS-02 / R-F: the labelled bar gives its end label room (int1 call, closed by B9-49)', () => {
  const root = declarations(readStylesCss().replace(/\/\*[\s\S]*?\*\//g, ''), ':root')
  const px = (v: string | undefined) => Number.parseFloat(v ?? 'NaN')

  it('--radius-nav-compact is a token between 14 and 18 px (the approved 24 px --radius-nav stays for 375 px and below and from 600 px)', () => {
    expect(px(root['--radius-nav'])).toBe(24)
    expect(px(root['--radius-nav-compact'])).toBeGreaterThanOrEqual(14)
    expect(px(root['--radius-nav-compact'])).toBeLessThanOrEqual(18)
  })

  it('applies from 376 px up to the next table breakpoint (37.5em): (min-width: 23.5em) and (width < 37.5em)', () => {
    expect(at('.bottom-bar', LABELLED)['border-radius']).toBe('var(--radius-nav-compact)')
    expect(at('.bottom-bar')['border-radius']).toBe('var(--radius-nav)')
  })

  // The model reproduces the int1 measurement: with the labels 3.5 px above the bar's inner bottom (the 11 px label under a 40 px
  // squircle, 6 px apart, centred in the link), an end label's lower corner is 3.8 px from the 23 px inner curve at 376 px.
  const LABEL_ABOVE_INNER_BOTTOM = 3.5
  const curveIn = (ri: number) => ri - Math.sqrt(ri * ri - (ri - LABEL_ABOVE_INNER_BOTTOM) ** 2)
  const PADDING = 14 // calc(var(--space-3) + var(--space-half)), the labelled bar's inline padding (B9-19 review)
  const slot = (vw: number) => (Math.min(vw - 24, 480) - 2 - 2 * PADDING - 6 * 2) / 7

  it('the model: at 376 px with the 24 px radius the end label is 3.75 px from the curve (what int1 measured)', () => {
    expect(PADDING + (slot(376) - 43.2) / 2 - curveIn(23)).toBeCloseTo(3.75, 0)
  })

  it.each([376, 390, 430])('at %i px the end label ("Settings", 43.2 px) keeps 8 px from the rounded end with the compact radius', (vw) => {
    const radius = px(root['--radius-nav-compact'])
    expect(PADDING + (slot(vw) - 43.2) / 2 - curveIn(radius - 1)).toBeGreaterThanOrEqual(8)
  })
})
