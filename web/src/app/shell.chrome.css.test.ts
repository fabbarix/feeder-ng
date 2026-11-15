// B9-19: the shell's bars, rail, safe areas and keyboard behaviour (DS-02 / R-F, SHORT-04, SHORT-05, A11Y-06, A11Y-09), read from
// app/shell.css. Amendment A1: the smallest size is 375 px, and the narrow band is (width < 23.5em), below 376 px: at 375 px and below the
// bottom bar shows icons only; above it, icon and label. The squircles (current page, Scan) are 40 px, on the inner .bottom-bar__icon span.
import { describe, expect, it } from 'vitest'
import { parseCss } from '../ui/lib/cssWalk.test-helper'
import { COMPACT_RAIL_QUERY } from '../ui/lib/viewport'

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
const conds = (query: string) => conditionsOf([query])
const NARROW = '(width < 23.5em)'
const SHORT_NARROW = ['(max-height: 499px)', '(width < 37.5em)']
const COMPACT = COMPACT_RAIL_QUERY.split(/\s+and\s+/)

/** Merged declarations of the rules with this selector (in a selector list too) under exactly these media conditions. */
function at(selector: string, cond: string[] = []): Record<string, string> {
  const want = conds(cond.join(' and '))
  const out: Record<string, string> = {}
  for (const b of blocks) {
    if (conditionsOf(b.atrules) !== (cond.length ? want : '')) continue
    if (!b.selector.split(',').map((s) => s.trim().replace(/"/g, "'")).includes(selector)) continue
    for (const [k, v] of b.decls) out[k] = v
  }
  return out
}
/** The index of the first block with this selector under these conditions (source order). */
const order = (selector: string, cond: string[] = []) =>
  blocks.findIndex((b) => conditionsOf(b.atrules) === (cond.length ? conds(cond.join(' and ')) : '') && b.selector.split(',').map((s) => s.trim().replace(/"/g, "'")).includes(selector))
const hasMedia = (cond: string[]) => blocks.some((b) => conditionsOf(b.atrules) === conds(cond.join(' and ')))

const VISUALLY_HIDDEN = (d: Record<string, string>) => {
  expect(d['position']).toBe('absolute')
  expect(d['inline-size']).toBe('1px')
  expect(d['block-size']).toBe('1px')
  expect(d['overflow']).toBe('hidden')
  expect(d['clip-path']).toBe('inset(50%)')
  expect(d['white-space']).toBe('nowrap')
}

describe('DS-02 / R-F: one squircle system in the bottom bar', () => {
  it('every link is the whole track: stretched, no fill, no shadow, the button radius (the focus ring follows the whole target)', () => {
    for (const sel of ['.bottom-bar__link', ".bottom-bar__link[aria-current='page']", ".bottom-bar__link[data-accent='true']"]) {
      const d = at(sel)
      expect(d['align-self'], sel).toBe('stretch')
      expect(d['justify-self'], sel).toBe('stretch')
      expect(d['inline-size'], sel).toBe('100%')
      expect(d['block-size'], sel).toBe('auto')
      expect(d['min-width'], sel).toBe('0')
      expect(d['gap'], sel).toBe('var(--space-half)') // 2 px (DS-11: tokens, never raw px)
      expect(d['background'], sel).toBe('none')
      expect(d['box-shadow'], sel).toBe('none')
      expect(d['border-radius'], sel).toBe('var(--radius-button)')
    }
  })

  it('.bottom-bar__icon is a 40 x 40 squircle (radius 12, --radius-thumb), centred, never shrunk', () => {
    const d = at('.bottom-bar__icon')
    expect(d['display']).toBe('grid')
    expect(d['place-items']).toBe('center')
    expect(d['flex']).toBe('none')
    expect(d['inline-size']).toBe('40px')
    expect(d['block-size']).toBe('40px')
    expect(d['border-radius']).toBe('var(--radius-thumb)')
  })

  it('only two squircles are filled: the current page (soft) and Scan (accent, always)', () => {
    expect(at(".bottom-bar__link[aria-current='page'] .bottom-bar__icon")).toMatchObject({ background: 'var(--color-soft)', color: 'var(--color-accent-text)' })
    expect(at(".bottom-bar__link[data-accent='true'] .bottom-bar__icon")).toMatchObject({ background: 'var(--color-accent)', color: 'var(--color-on-accent)' })
    expect(at('.bottom-bar__icon')['background']).toBeUndefined() // the others are a bare muted icon
  })

  it('Scan, when it is the current page, keeps its accent fill with no ring, and its label turns accent text', () => {
    expect(at(".bottom-bar__link[data-accent='true']")['color']).toBe('var(--color-text)') // the label under Scan
    expect(at(".bottom-bar__link[data-accent='true'][aria-current='page']")['color']).toBe('var(--color-accent-text)')
    expect(at(".bottom-bar__link[data-accent='true'][aria-current='page'] .bottom-bar__icon")['background'] ?? 'var(--color-accent)').toBe('var(--color-accent)')
    expect(css).not.toMatch(/0 0 0 3px var\(--color-soft\)[^}]*bottom-bar/)
  })

  it('A11Y-06: the current page is more than a colour: aria-current, accent text on icon and label, and a soft squircle (the icon is the Phosphor fill weight: AppShell.test.tsx)', () => {
    expect(at(".bottom-bar__link[aria-current='page']")['color']).toBe('var(--color-accent-text)')
  })

  it('B9-07 kept: a link rings inside itself with the inner width, so a focused link never overruns its neighbour; the ring is the normal ring colour on every link (the accent fill moved to the span, so the on-accent colour would vanish on the bar)', () => {
    const d = at('.bottom-bar__link:focus-visible')
    expect(d['outline']).toBe('var(--focus-ring-inner-width) solid var(--focus-ring-color)')
    expect(d['outline-offset']).toBe('calc(-1 * var(--focus-ring-inner-width))')
    expect(at(".bottom-bar__link[data-accent='true']")['--focus-ring-color']).toBeUndefined()
  })

  it('B9-07 kept: scroll padding above the bars leaves the focused control a small gap', () => {
    expect(at('html')['scroll-padding-block-end']).toBe('calc(var(--nav-top) + var(--focus-ring-width) + var(--focus-ring-offset) + var(--space-1))')
  })
})

describe('A1: icons only at 375 px and below (width < 23.5em)', () => {
  it('hides every label visually (the link keeps its name from it) in the narrow band, and only there', () => {
    VISUALLY_HIDDEN(at('.bottom-bar__label', [NARROW]))
    const base = at('.bottom-bar__label')
    expect(base['position']).toBeUndefined()
    expect(base['clip-path']).toBeUndefined()
  })

  it('the side inset drops to --space-1 (plus the safe area), the bar gets 6 px inline padding and no column gap: a track is 50 px at 375', () => {
    const d = at('.bottom-bar', [NARROW])
    expect(d['left']).toBe('calc(var(--space-1) + env(safe-area-inset-left, 0px))')
    expect(d['right']).toBe('calc(var(--space-1) + env(safe-area-inset-right, 0px))')
    expect(d['padding-inline']).toBe('calc(var(--space-1) + var(--space-half))') // 6 px (DS-11)
    expect(d['column-gap']).toBe('0')
  })

  it('the squircles are 40 px and sit 14 px from the bar top at 375 (the bar is 70 tall and holds only the squircle): inside, never poking out', () => {
    // no override in the narrow band changes the squircle or the bar height
    expect(at('.bottom-bar__icon', [NARROW])['inline-size']).toBeUndefined()
    expect(at('.bottom-bar', [NARROW])['height']).toBeUndefined()
  })

  it('the narrow band is the breakpoint table\'s: em, never px', () => {
    expect(hasMedia([NARROW])).toBe(true)
    expect(css).not.toMatch(/22\.5em|max-width:\s*359px|\(max-width:\s*\d+px\)/)
  })
})

describe('SHORT-04: short narrow, a phone window under 500 px tall and under 600 px wide (the bar stays, compact)', () => {
  it('the bar is 52 px tall with an 8 px inset, 6 px of inline padding and no gap', () => {
    expect(at(':root', SHORT_NARROW)).toMatchObject({ '--nav-height': '52px', '--nav-inset': '8px' })
    const d = at('.bottom-bar', SHORT_NARROW)
    expect(d['padding-inline']).toBe('calc(var(--space-1) + var(--space-half))') // 6 px (DS-11)
    expect(d['column-gap']).toBe('0')
  })

  it('icons only, with R-F\'s shapes: labels hidden, the 40 px squircles (radius 12) are 6 px clear of the bar edge (52 - 2 border - 40 = 5 + 1)', () => {
    VISUALLY_HIDDEN(at('.bottom-bar__label', SHORT_NARROW))
    expect(at('.bottom-bar__icon', SHORT_NARROW)['inline-size'] ?? '40px').toBe('40px')
    expect(at('.bottom-bar__icon')['border-radius']).toBe('var(--radius-thumb)')
  })
})

describe('SHORT-04: very short viewports end the page with the bar (under 340 px tall)', () => {
  it('the bottom bar stops floating: position static, in the flow after <main>', () => {
    expect(at('.bottom-bar', ['(max-height: 339px)'])['position']).toBe('static')
  })

  it('no bar floats, so --nav-top is the bottom inset and the clearance is the page spacing plus it', () => {
    const d = at(':root', ['(max-height: 339px)'])
    expect(d['--nav-top']).toBe('var(--safe-bottom)')
    expect(d['--nav-clearance']).toBe('calc(var(--space-6) + var(--safe-bottom))')
  })
})

describe('SHORT-04 / SHORT 1: a 64 px compact rail in phone landscape (height < 500, 600 px to 1024 px wide)', () => {
  it('the media query is the one viewport.ts exports: height, the tablet band, below the desktop band', () => {
    expect(hasMedia(COMPACT)).toBe(true)
  })

  it('shows the rail and hides the bottom bar', () => {
    expect(at('.bottom-bar', COMPACT)['display']).toBe('none')
    expect(at('.side-rail', COMPACT)['display']).toBe('flex')
  })

  it('the rail is column 1 across all rows: 64 px plus the left inset, sticky, 100dvh tall', () => {
    expect(at('.app-shell:not(.app-shell--chromeless)', COMPACT)['grid-template-columns']).toBe('calc(var(--rail-compact) + var(--safe-left)) minmax(0, 1fr)')
    const rail = at('.side-rail', COMPACT)
    expect(rail['grid-row']).toBe('1 / -1')
    expect(rail['position']).toBe('sticky')
    expect(rail['top']).toBe('0')
    expect(rail['block-size'] ?? rail['height']).toBe('100dvh')
    expect(rail['padding-inline-start'] ?? rail['padding-left']).toBe('var(--safe-left)')
  })

  it('the top bar sits beside the rail and shrinks to 48 px', () => {
    const d = at('.top-bar', COMPACT)
    expect(d['grid-column']).toBe('2')
    expect(d['block-size'] ?? d['height']).toMatch(/^calc\(48px \+ var\(--safe-top\)\)$|^48px$/)
  })

  it('the rail took the left inset, so <main> and the top bar zero --safe-left and the page does not double it (SHORT-05)', () => {
    expect(at('.app-main', COMPACT)['--safe-left']).toBe('0px')
    expect(at('.top-bar', COMPACT)['--safe-left']).toBe('0px')
  })

  it('--nav-top becomes the bottom inset, and the clearance is --space-6 plus it', () => {
    const d = at(':root', COMPACT)
    expect(d['--nav-top']).toBe('var(--safe-bottom)')
    expect(d['--nav-clearance']).toBe('calc(var(--space-6) + var(--safe-bottom))')
  })

  it('seven rows, each 56 wide and 44 tall (40 under 360 px tall), the label below the icon in the nav role', () => {
    const link = at('.side-rail__link', COMPACT)
    expect(link['width'] ?? link['inline-size']).toBe('56px')
    expect(link['height'] ?? link['block-size']).toBe('44px')
    expect(at('.side-rail__link', [...COMPACT, '(max-height: 359px)'])['height'] ?? at('.side-rail__link', [...COMPACT, '(max-height: 359px)'])['block-size']).toBe('40px')
    const label = at('.side-rail__label', COMPACT)
    expect(label['font-size']).toBe('var(--text-nav-size)')
    expect(label['font-weight']).toBe('var(--text-nav-weight)')
  })

  it('the current page is a 44 x 26 capsule (radius 13) behind its icon', () => {
    const pill = at('.side-rail__pill', COMPACT)
    expect(pill['width'] ?? pill['inline-size']).toBe('44px')
    expect(pill['height'] ?? pill['block-size']).toBe('26px')
    expect(pill['border-radius']).toBe('var(--radius-pill)') // 13 px on the 26 px box (DS-11)
    expect(at(".side-rail__link[aria-current='page'] .side-rail__pill", COMPACT)['background']).toBe('var(--color-soft)')
  })

  it('Scan is a 56 x 44 rounded rectangle (radius 14; 56 x 40 under 360 px tall) in the accent fill, never stretched, and has no ring when current', () => {
    const scan = at(".side-rail__link[data-accent='true']", COMPACT)
    expect(scan['background']).toBe('var(--color-accent)')
    expect(scan['border-radius']).toBe('var(--radius-control)') // 14 px (DS-11)
    expect(scan['width'] ?? scan['inline-size']).toBe('56px')
    expect(scan['height'] ?? scan['block-size']).toBe('44px')
    const short = at(".side-rail__link[data-accent='true']", [...COMPACT, '(max-height: 359px)'])
    expect(short['height'] ?? short['block-size']).toBe('40px')
    expect(at(".side-rail__link[data-accent='true'][aria-current='page']", COMPACT)['box-shadow']).toBe('none')
  })

  it('comes before the 1024 rail in the source, so a window that is both short and 1024 px wide keeps its 88 or 240 px rail', () => {
    const compact = blocks.findIndex((b) => conditionsOf(b.atrules) === conds(COMPACT.join(' and ')))
    const desktop = order('.app-shell', ['(min-width: 64em)'])
    expect(compact).toBeGreaterThanOrEqual(0)
    expect(desktop).toBeGreaterThan(compact)
  })
})

describe("SHORT-04 / SHORT 2: the bottom bar steps aside while a text field has focus (html[data-keyboard='open'])", () => {
  const KB = "html[data-keyboard='open']"

  it('slides the bar away and takes it out of the Tab order and the accessibility tree while it is hidden', () => {
    const d = at(`${KB} .bottom-bar`)
    expect(d['visibility']).toBe('hidden')
    expect(d['transform']).toMatch(/translateY\(/)
  })

  it('--nav-top is the bottom inset while it is away, so a sticky bar sits on the keyboard', () => {
    expect(at(KB)['--nav-top']).toBe('var(--safe-bottom)')
  })

  it('reduced motion: no slide transition (a transition exists only for no-preference, or is none under reduce)', () => {
    for (const b of blocks.filter((x) => /bottom-bar/.test(x.selector) && x.decls.some(([p]) => p === 'transition'))) {
      const reduced = b.atrules.some((a) => /prefers-reduced-motion:\s*no-preference/.test(a))
      expect(reduced || b.decls.find(([p]) => p === 'transition')![1] === 'none', b.selector).toBe(true)
    }
    for (const b of blocks.filter((x) => b_hasReduce(x.atrules) && /bottom-bar/.test(x.selector))) {
      expect(b.decls.find(([p]) => p === 'transition')?.[1] ?? 'none').toBe('none')
    }
  })
})
function b_hasReduce(a: string[]) {
  return a.some((x) => /prefers-reduced-motion:\s*reduce/.test(x))
}

describe('SHORT-05: gutters are max(gutter, inset) on their own side (the top bar too)', () => {
  it('the top bar is 64 px plus the top inset tall, padded by the top inset and by max(gutter, inset) on each side', () => {
    const d = at('.top-bar')
    expect(d['height'] ?? d['block-size']).toBe('calc(64px + var(--safe-top))')
    expect(d['padding-top'] ?? d['padding-block-start']).toBe('var(--safe-top)')
    expect(d['padding-inline']).toBe('max(var(--gutter), var(--safe-left)) max(var(--gutter), var(--safe-right))')
  })

  it('the bottom bar keeps its own inset form (env() on all three sides)', () => {
    const d = at('.bottom-bar')
    expect(d['bottom']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-bottom/)
    expect(d['left']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-left/)
    expect(d['right']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-right/)
  })
})

describe('A11Y-09: the avatar button is a 44 px target on a coarse pointer, drawn 40 px', () => {
  it('stays 40 x 40 where it is drawn, and its hit area grows through ::after on a coarse pointer', () => {
    expect(at('.your-menu-button')).toMatchObject({ width: '40px', height: '40px' })
    const coarse = ['(pointer: coarse)']
    expect(at('.your-menu-button', coarse)['position']).toBe('relative')
    const after = at('.your-menu-button::after', coarse)
    expect(after['content']).toBe("''")
    expect(after['position']).toBe('absolute')
    expect(after['inset']).toBe('-2px')
  })

  it('the button stays overflow: hidden for the round avatar, so the ::after is not clipped: the target is on the anchor, or the overflow is visible on coarse', () => {
    const coarse = ['(pointer: coarse)']
    const clipped = at('.your-menu-button')['overflow'] === 'hidden' && at('.your-menu-button', coarse)['overflow'] !== 'visible'
    expect(clipped).toBe(false)
  })
})

describe('the clearance tokens other packages read (B9-18 Toast, B9-25 timers, B9-27 and B9-35)', () => {
  it('--nav-height, --nav-inset, --nav-clearance and --nav-top keep their meaning at phone size', () => {
    const root = at(':root')
    expect(root['--nav-height']).toBe('70px')
    expect(root['--nav-inset']).toBe('12px')
    expect(root['--nav-top']).toMatch(/var\(--nav-height\).*var\(--nav-inset\).*env\(safe-area-inset-bottom/)
  })
})
