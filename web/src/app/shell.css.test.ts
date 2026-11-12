// The shell stylesheet (plan 4.5): tokens only, one clearance variable, chromeless is full-viewport. Reads web/src/app/shell.css.
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss } from '../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const read = (p: string) => {
  try {
    return readFileSync(`${cwd}/${p}`, 'utf8')
  } catch {
    return ''
  }
}

const css = read('src/app/shell.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Inner text of the first `@media (<query>) { ... }` (one nesting level of rules). */
function media(query: string): string {
  const start = code.indexOf(`@media (${query})`)
  if (start < 0) return ''
  let i = code.indexOf('{', start)
  const from = i + 1
  let depth = 0
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return code.slice(from, i)
  }
  return ''
}
const d = (selector: string) => declarations(code, selector)

describe('shell.css exists and follows the guards', () => {
  it('is a stylesheet of its own, imported by the shell', () => {
    expect(code.trim().length).toBeGreaterThan(0)
    expect(read('src/app/AppShell.tsx')).toMatch(/import ['"]\.\/shell\.css['"]/)
  })
  it('has no colour literals and no px font sizes', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(/)
    expect(code).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
  })
  it('styles.css no longer holds the shell rules (moved)', () => {
    const styles = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')
    for (const sel of ['.app-shell', '.top-bar', '.app-main', '.bottom-bar', '.side-rail', '.your-menu']) {
      expect(styles, sel).not.toMatch(new RegExp(`(^|[\\s,}])${sel.replace('.', '\\.')}[\\s,{:\\[_.-]`))
    }
    expect(styles).not.toMatch(/--bar-height/)
  })
})

describe('bottom clearance (acceptance: nothing hidden behind the nav)', () => {
  it('--nav-clearance = 70 + 12 + 16 + the safe area, applied as .app-main bottom padding', () => {
    const root = d(':root')
    expect(root['--nav-height']).toBe('70px')
    expect(root['--nav-inset']).toBe('12px')
    expect(root['--nav-clearance']).toMatch(/var\(--nav-height\).*var\(--nav-inset\).*var\(--space-4\).*env\(safe-area-inset-bottom/)
    expect(d('.app-main')['padding-bottom']).toBe('var(--nav-clearance)')
  })
  it('QA-4: --nav-top is the bottom bar top edge: height + inset + safe area (no gap), 0 from 1024', () => {
    const top = d(':root')['--nav-top'] ?? ''
    expect(top).toMatch(/var\(--nav-height\).*var\(--nav-inset\).*env\(safe-area-inset-bottom/)
    expect(top).not.toMatch(/--space-/)
    expect(media('min-width: 1024px')).toMatch(/--nav-top\s*:\s*0/)
  })
  it('QA-4: the bottom bar is placed with the same tokens --nav-top is built from', () => {
    const bar = d('.bottom-bar')
    expect(bar['bottom']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-bottom/)
    expect(bar['height']).toBe('var(--nav-height)')
  })
  it('chromeless and the rail layout drop the clearance (there is no bottom bar)', () => {
    expect(d('.app-shell--chromeless')['padding']).toBe('0')
    expect(d('.app-main--full')['padding-bottom']).toBe('0')
    expect(media('min-width: 1024px')).toMatch(/--nav-clearance\s*:\s*0/)
  })
  it('the viewport never scrolls sideways: the page is not wider than the viewport', () => {
    expect(d('.app-shell')['min-width']).toBe('0')
    expect(d('.app-main')['min-width']).toBe('0')
    expect(d('.app-main')['max-width']).toBeUndefined() // R2-L: the width cap moved to ui/Page (one place)
  })
  it('<main> fills its grid column (R2-L): width 100%, no max-width, no auto margin, no side padding; ui/Page centres the content', () => {
    const m = d('.app-main')
    expect(m['width']).toBe('100%')
    expect(m['max-width']).toBeUndefined()
    expect(m['max-inline-size']).toBeUndefined()
    expect(m['margin']).toBeUndefined()
    expect(m['padding-inline']).toBeUndefined()
  })
  it('the expanded rail (from 1440) insets its rows: margin-inline var(--space-3), and a row never overflows the 240 px rail', () => {
    const wide = media('min-width: 1440px')
    const link = /\.side-rail__link\s*\{([^}]*)\}/.exec(wide)?.[1] ?? ''
    expect(link).toMatch(/margin-inline\s*:\s*var\(--space-3\)/)
    expect(link).not.toMatch(/(^|[;\s])width\s*:\s*100%/)
    // The >=1024 block sets width: 56px; the expanded rows must override it, or the labels overflow.
    expect(link).toMatch(/(^|[;\s])width\s*:\s*(auto|stretch|-webkit-fill-available)\s*(;|$)/)
  })
})

describe('bottom bar (plan 4.5)', () => {
  it('floats inset 12 px plus the safe area, 70 high, radius 24, max 480 centred', () => {
    const bar = d('.bottom-bar')
    expect(bar['position']).toBe('fixed')
    expect(bar['height']).toBe('var(--nav-height)')
    expect(bar['bottom']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-bottom/)
    expect(bar['border-radius']).toBe('var(--radius-nav)')
    expect(bar['box-shadow']).toBe('var(--elev-2)')
    expect(bar['max-width']).toBe('480px')
    expect(bar['background']).toBe('var(--color-surface)')
    expect(code).toMatch(/\.bottom-bar[^{}]*\{[^{}]*(margin-inline\s*:\s*auto|margin\s*:[^;]*auto)/)
  })
  it('items are 54 high (PN: the width comes from the grid track, no longer a fixed 62), radius 16, icon over a 11/800 label', () => {
    const link = d('.bottom-bar__link')
    expect(link['width']).toBe('100%')
    expect(link['height']).toBe('54px')
    expect(link['border-radius']).toBe('var(--radius-button)')
    expect(link['flex-direction']).toBe('column')
    expect(link['gap']).toBe('2px')
    expect(link['color']).toBe('var(--color-muted)')
    const label = d('.bottom-bar__label')
    expect(label['font-size']).toBe('var(--text-nav-size)')
    expect(label['font-weight']).toBe('var(--text-nav-weight)')
  })
  it('the current tab has a soft pill and accent text (via aria-current, not a class)', () => {
    const active = d(".bottom-bar__link[aria-current='page']")
    expect(active['background']).toBe('var(--color-soft)')
    expect(active['color']).toBe('var(--color-accent-text)')
  })
  it('Scan is a 58 x 58 accent button, radius 20, in the bar (no upward translate)', () => {
    const scan = d(".bottom-bar__link[data-accent='true']")
    expect(scan['width']).toBe('58px')
    expect(scan['height']).toBe('58px')
    expect(scan['border-radius']).toBe('var(--radius-button-lg)')
    expect(scan['background']).toBe('var(--color-accent)')
    expect(scan['color']).toBe('var(--color-on-accent)')
    expect(Object.keys(scan)).not.toContain('transform')
    expect(code).not.toMatch(/translateY\(\s*-/)
  })
  it('on /scan the Scan button gets a 3 px soft ring', () => {
    const ring = d(".bottom-bar__link[data-accent='true'][aria-current='page']")
    expect(`${ring['box-shadow'] ?? ''} ${ring['outline'] ?? ''}`).toMatch(/3px/)
    expect(`${ring['box-shadow'] ?? ''} ${ring['outline'] ?? ''}`).toMatch(/var\(--color-soft/)
  })
  it('is hidden from 1024 up, where the side rail takes over', () => {
    expect(media('min-width: 1024px')).toMatch(/\.bottom-bar\s*\{[^}]*display\s*:\s*none/)
  })
})

describe('side rail (plan 4.5)', () => {
  it('compact rail (1024-1439): the current Scan item carries the same 3 px soft ring as the expanded rail (R2-L-b)', () => {
    const compact = media('min-width: 1024px')
    const rule = /\.side-rail__link\[data-accent='true'\]\[aria-current='page'\]\s*\{([^}]*)\}/.exec(compact)?.[1] ?? ''
    expect(rule).toMatch(/box-shadow\s*:\s*0\s+0\s+0\s+3px\s+var\(--color-soft\)/)
    // The ring is the marker, so the fill stays the accent (no soft background on the item itself).
    expect(rule).not.toMatch(/background/)
  })
  it('is hidden on phones and 88 wide from 1024, 240 wide from 1440', () => {
    expect(d('.side-rail')['display']).toBe('none')
    const wide = media('min-width: 1024px')
    expect(wide).toMatch(/\.app-shell\s*\{[^}]*grid-template-columns\s*:\s*88px\s+minmax\(0,\s*1fr\)/)
    expect(wide).toMatch(/\.side-rail\s*\{[^}]*display\s*:\s*flex/)
    expect(media('min-width: 1440px')).toMatch(/grid-template-columns\s*:\s*240px\s+minmax\(0,\s*1fr\)/)
  })
  it('does not switch layout at 900 any more (that was the board bug)', () => {
    expect(code).not.toMatch(/min-width\s*:\s*900px/)
  })
  it('the current destination is a soft pill 56 x 32 behind the icon, Scan a 56 square accent', () => {
    const wide = media('min-width: 1024px')
    expect(wide).toMatch(/\.side-rail__link\[aria-current='page'\][^{}]*\{[^}]*background\s*:\s*var\(--color-soft\)/)
    expect(wide).toMatch(/56px/)
    expect(wide).toMatch(/\.side-rail__link\[data-accent='true'\][^{}]*\{[^}]*background\s*:\s*var\(--color-accent\)/)
  })
})

describe('chromeless routes are full viewport (B3)', () => {
  it('the frame is a plain block with no padding and the full dynamic viewport height', () => {
    const frame = d('.app-shell--chromeless')
    expect(frame['display']).toBe('block')
    expect(frame['padding']).toBe('0')
    expect(frame['min-height']).toBe('100dvh')
  })
  it('the main has no max-width or centring margin', () => {
    const main = d('.app-main--full')
    expect(main['max-width']).toBe('none')
    expect(main['margin']).toBe('0')
  })
  it('no media query re-applies the grid to the chromeless frame', () => {
    expect(media('min-width: 1024px')).toMatch(/\.app-shell:not\(\.app-shell--chromeless\)/)
    expect(media('min-width: 1440px')).not.toMatch(/\.app-shell\s*\{/)
  })
})

describe('avatar menu (5.17)', () => {
  it('is a 240 wide popover, radius 20, elevation 2', () => {
    const menu = d('.your-menu')
    expect(menu['width']).toBe('240px')
    expect(menu['border-radius']).toBe('var(--radius-tile-sm)')
    expect(menu['box-shadow']).toBe('var(--elev-2)')
    expect(menu['max-width']).toMatch(/100(vw|%)/)
  })
  it('rows are 48 high with the icon and label side by side; the avatar button is a 40 px rounded square', () => {
    const item = d('.your-menu__item')
    expect(item['min-height']).toBe('48px')
    expect(item['display']).toBe('flex')
    expect(item['gap']).toBeDefined()
    const trigger = d('.your-menu-button')
    expect(trigger['width']).toBe('40px')
    expect(trigger['height']).toBe('40px')
    expect(trigger['border-radius']).toBe('14px')
  })
  it('Sign out is danger tertiary text; the divider is a hairline', () => {
    expect(d(".your-menu__item[data-tone='danger']")['color']).toBe('var(--status-danger-fg)')
    expect(d('.your-menu__divider')['background']).toBe('var(--color-line)')
  })
  it('the scrim covers the viewport, below the menu', () => {
    const scrim = d('.your-menu-scrim')
    expect(scrim['position']).toBe('fixed')
    expect(scrim['inset']).toBe('0')
    expect(scrim['background']).toBe('var(--scrim)')
    expect(Number(scrim['z-index'])).toBeLessThan(Number(d('.your-menu')['z-index']))
  })
})

describe('top bar', () => {
  it('drops the brand word on phones, shows it from 1024', () => {
    expect(d('.top-bar__brand')['display']).toBe('none')
    expect(media('min-width: 1024px')).toMatch(/\.top-bar__brand\s*\{[^}]*display\s*:\s*(block|inline)/)
  })
})

describe('review fixes: anchor, rows, rail pill, trigger', () => {
  it('the avatar anchor is pushed to the right of the top bar (margin-left:auto or equivalent)', () => {
    const a = d('.your-menu-anchor')
    expect(`${a['margin-left'] ?? ''} ${a['margin-inline-start'] ?? ''} ${a['margin-inline'] ?? ''}`).toMatch(/auto/)
  })
  it('from 1024 the grid rows do not stretch: align-content start or auto rows', () => {
    const wide = media('min-width: 1024px')
    const rule = /\.app-shell:not\(\.app-shell--chromeless\)\s*\{([^}]*)\}/.exec(wide)?.[1] ?? ''
    expect(rule).toMatch(/align-content\s*:\s*start|grid-template-rows\s*:\s*auto\s+auto\s+1fr|grid-auto-rows\s*:\s*(auto|min-content|max-content)/)
  })
  it('at 88 px the active destination is a 56 x 32 soft pill span behind the icon, not the whole link', () => {
    const wide = media('min-width: 1024px')
    const pill = /\.side-rail__pill\s*\{([^}]*)\}/.exec(wide)?.[1] ?? ''
    expect(pill).toMatch(/width\s*:\s*56px/)
    expect(pill).toMatch(/height\s*:\s*32px/)
    expect(wide).toMatch(/\.side-rail__link\[aria-current='page'\]\s+\.side-rail__pill\s*\{[^}]*background\s*:\s*var\(--color-soft\)/)
    expect(wide).not.toMatch(/\.side-rail__link\[aria-current='page'\]\s*\{[^}]*background/)
  })
  it('the avatar trigger is a 40 px square with radius 14', () => {
    const t = d('.your-menu-button')
    expect([t['width'], t['height'], t['border-radius']]).toEqual(['40px', '40px', '14px'])
  })
  it('the avatar trigger paints a surface-2 square, so the round avatar sits inside a rounded square, not alone', () => {
    const t = d('.your-menu-button')
    expect(t['background']).toBe('var(--color-surface-2)')
  })
})

describe('rail current item contrast (L-04, R2-L)', () => {
  const rail1024 = media('min-width: 1024px')
  const rail1440 = media('min-width: 1440px')
  const rule = (css: string, sel: string) => {
    const i = css.indexOf(sel + ' {')
    return i < 0 ? '' : css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i))
  }
  const cur = ".side-rail__link[data-accent='true'][aria-current='page']"
  it('from 1440 the current Scan row keeps the accent fill and on-accent text, with the soft ring (after the soft current rule)', () => {
    const r = rule(rail1440, cur)
    expect(r).toMatch(/background\s*:\s*var\(--color-accent\)/)
    expect(r).toMatch(/color\s*:\s*var\(--color-on-accent\)/)
    expect(r).toMatch(/box-shadow\s*:\s*0 0 0 3px var\(--color-soft\)/)
    expect(rail1440.indexOf(cur)).toBeGreaterThan(rail1440.indexOf(".side-rail__link[aria-current='page'] {"))
  })
  it('from 1024 the icon pill of the current Scan item is not soft (white icon on soft was 1.31:1)', () => {
    const r = rule(rail1024, cur + ' .side-rail__pill')
    expect(r).toMatch(/background\s*:\s*none/)
  })
  it('a Scan item that is current at 1440 never sets the soft background on the link itself', () => {
    expect(rail1440).not.toMatch(/\[data-accent='true'\]\[aria-current='page'\]\s*\{[^}]*var\(--color-soft\)\s*;?\s*\}/)
  })
})

describe('bottom bar with six buttons: Today, Plan, Pantry | Scan | Shop, Recipes (PN)', () => {
  const bar = () => d('.bottom-bar')
  const tracks = () => (bar()['grid-template-columns'] ?? '').trim().split(/\s+/).filter(Boolean)
  const fr = (t: string) => (/^([\d.]+)fr$/.exec(t) ? Number(/^([\d.]+)fr$/.exec(t)![1]) : null)
  const px = (t: string) => (/^([\d.]+)px$/.exec(t) ? Number(/^([\d.]+)px$/.exec(t)![1]) : null)

  /** Pixel width of every track at a viewport width, no safe-area inset (the safe-area env() is 0 on these phones). */
  function layout(viewport: number) {
    const barW = Math.min(viewport - 2 * 12, 480)
    const inner = barW - 2 // 1 px border each side
    const t = tracks()
    const fixed = t.reduce((n, x) => n + (px(x) ?? 0), 0)
    const frs = t.reduce((n, x) => n + (fr(x) ?? 0), 0)
    const widths = t.map((x) => px(x) ?? ((fr(x) ?? 0) * (inner - fixed)) / frs)
    const left = widths.slice(0, 3).reduce((n, w) => n + w, 0)
    const scanLeft = left
    return { barW, inner, widths, scanCentre: 1 + scanLeft + widths[3]! / 2, barCentre: barW / 2 }
  }

  it('is a six-track grid in DOM order: three destinations, Scan, two destinations', () => {
    expect(bar()['display']).toBe('grid')
    expect(tracks()).toHaveLength(6)
  })
  it('the Scan track is the fixed 58 px one, in the fourth place; the other five share the rest by fr', () => {
    const t = tracks()
    expect(px(t[3]!)).toBe(58)
    for (const i of [0, 1, 2, 4, 5]) expect(fr(t[i]!), `track ${i}`).not.toBeNull()
  })
  it('Scan is centred: the fr weights on its left equal those on its right (3 buttons on one side, 2 on the other)', () => {
    const t = tracks()
    const sum = (xs: string[]) => xs.reduce((n, x) => n + (fr(x) ?? 0), 0)
    expect(sum(t.slice(0, 3))).toBeCloseTo(sum(t.slice(4)), 5)
  })
  it.each([360, 375, 390, 412, 430, 480, 600])('at %i px the Scan centre is the bar centre (within 0.5 px)', (vw) => {
    const l = layout(vw)
    expect(Math.abs(l.scanCentre - l.barCentre)).toBeLessThanOrEqual(0.5)
  })
  it.each([360, 375, 390, 412, 430])('at %i px every destination track is at least 44 px wide', (vw) => {
    const l = layout(vw)
    expect(l.widths).toHaveLength(6)
    l.widths.forEach((w, i) => expect(w, `track ${i}`).toBeGreaterThanOrEqual(44))
  })
  it('every button keeps a 44 x 44 minimum target (min-width, and height >= 44)', () => {
    const link = d('.bottom-bar__link')
    expect(link['min-width']).toBe('44px')
    expect(Number.parseFloat(link['height'] ?? '0')).toBeGreaterThanOrEqual(44)
    expect(Number.parseFloat(d(".bottom-bar__link[data-accent='true']")['height'] ?? '0')).toBeGreaterThanOrEqual(44)
  })
  it('tracks may not shrink below the target: no track is a bare 0-based fr that can collapse (grid items min-width 44 px holds them)', () => {
    expect(d('.bottom-bar__link')['min-width']).toBe('44px')
    expect(bar()['gap'] ?? '0').toMatch(/^0(px)?$/)
    expect(bar()['padding'] ?? '0').toMatch(/^0(px)?$/)
  })
  it('labels never wrap or truncate: nowrap, no ellipsis, no clipping', () => {
    const label = d('.bottom-bar__label')
    expect(label['white-space']).toBe('nowrap')
    expect(label['text-overflow']).toBeUndefined()
    expect(label['overflow'] ?? 'visible').toBe('visible')
    expect(label['line-height']).toBe('1')
  })
  it('respects the safe-area insets on all three sides: bottom (already), and left and right in landscape', () => {
    const b = bar()
    expect(b['bottom']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-bottom/)
    expect(b['left']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-left/)
    expect(b['right']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-right/)
  })
  it('still floats centred up to 480 px (margin-inline auto) and keeps the 70 px height', () => {
    expect(bar()['max-width']).toBe('480px')
    expect(bar()['height']).toBe('var(--nav-height)')
  })
  it('the rail needs no change for the sixth item: 6 x 56 + gaps fit a 100dvh rail, and the rail scrolls rather than clips on short screens', () => {
    const rail = (media('min-width: 1024px').match(/\.side-rail\s*\{([^}]*)\}/) ?? [])[1] ?? ''
    expect(rail).toMatch(/max-height\s*:\s*100dvh/)
    expect(rail).toMatch(/overflow-y\s*:\s*auto/)
  })
})
