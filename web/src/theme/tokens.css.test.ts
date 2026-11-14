// Static design tokens (plan 3.2, 3.3) live in the :root block of styles.css; colours are written at
// runtime by apply.ts, with Basil light defaults in the CSS so the first paint is not unstyled.
import { describe, expect, it } from 'vitest'
import { hexToRgb } from './color'

// vitest blanks CSS modules (even ?raw) and @types/node is not installed, so read the sources with an
// untyped dynamic import of node:fs.
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/
const css = readFileSync(`${cwd}/src/styles.css`, 'utf8')
const main = readFileSync(`${cwd}/src/main.tsx`, 'utf8')

/**
 * Declarations of the top-level light `:root` rules, merged in source order: the static tokens block and the
 * single palette block `:root, [data-scheme='light']` (WP3 merged the palette there). Dark and media rules are skipped.
 */
function rootBlock(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of css.matchAll(/(^|\n)(:root\b[^{]*)\{([^}]*)\}/g)) {
    if (/dark/.test(m[2]!)) continue
    for (const d of m[3]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim()
  }
  expect(Object.keys(out).length, 'styles.css has :root tokens').toBeGreaterThan(0)
  return out
}
const root = rootBlock()

describe('type tokens (plan 3.2, DS-08): size and line in rem, weight unchanged', () => {
  // DS-08: 1rem = 16 px at the default text size, so every px value below is the old one divided by 16.
  const TYPES: Record<string, [string, string, string]> = {
    display: ['2.125rem', '2.375rem', '800'],
    'title-1': ['1.75rem', '2rem', '800'],
    'title-2': ['1.375rem', '1.625rem', '800'],
    'title-3': ['1.125rem', '1.375rem', '800'],
    'body-strong': ['0.9375rem', '1.25rem', '700'],
    body: ['0.9375rem', '1.375rem', '500'],
    meta: ['0.8125rem', '1.125rem', '500'],
    label: ['0.8125rem', '1rem', '700'],
    overline: ['0.75rem', '1rem', '800'],
  }
  it.each(Object.entries(TYPES))('%s', (name, [size, line, weight]) => {
    expect(root[`--text-${name}-size`]).toBe(size)
    expect(root[`--text-${name}-line`]).toBe(line)
    expect(root[`--text-${name}-weight`]).toBe(weight)
  })
  it('overline tracking and chip / nav label sizes', () => {
    expect(root['--text-overline-tracking']).toBe('0.04em')
    expect(root['--text-chip-size']).toBe('0.75rem')
    expect(root['--text-nav-size']).toBe('0.6875rem')
    expect(root['--text-nav-weight']).toBe('800')
  })
  it('every --text-*-size and --text-*-line ends in rem (DS-08)', () => {
    const typed = Object.entries(root).filter(([k]) => /^--text-[\w-]+-(size|line)$/.test(k) && !/^--text-(board|cook-step)-/.test(k))
    expect(typed.length).toBeGreaterThanOrEqual(20)
    for (const [k, v] of typed) expect(v, k).toMatch(/^\d*\.?\d+rem$/)
  })
  it('rem changes no rendered size at 16 px: every role is the old px value (DS-08 proof)', () => {
    const OLD_PX: Record<string, [number, number]> = {
      display: [34, 38], 'title-1': [28, 32], 'title-2': [22, 26], 'title-3': [18, 22], 'body-strong': [15, 20],
      body: [15, 22], meta: [13, 18], label: [13, 16], overline: [12, 16],
    }
    const px = (v: string) => parseFloat(v) * 16
    for (const [name, [size, line]] of Object.entries(OLD_PX)) {
      expect(px(root[`--text-${name}-size`]!), `${name} size`).toBe(size)
      expect(px(root[`--text-${name}-line`]!), `${name} line`).toBe(line)
    }
    expect(px(root['--text-chip-size']!)).toBe(12)
    expect(px(root['--text-nav-size']!)).toBe(11)
  })
  it('no type size is below 0.6875rem (nav, the one 11 px role) and only nav is below 0.75rem', () => {
    for (const [k, v] of Object.entries(root)) {
      if (!/^--text-[\w-]+-size$/.test(k) || /^--text-(board|cook-step)-/.test(k)) continue
      expect(parseFloat(v), k).toBeGreaterThanOrEqual(0.6875)
      if (k !== '--text-nav-size') expect(parseFloat(v), k).toBeGreaterThanOrEqual(0.75)
    }
  })
  it('never sets font-size on html or :root: the User\'s text size is the root (DS-08)', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of code.matchAll(/(^|\})\s*([^{}@]+)\{([^{}]*)\}/g)) {
      const selectors = m[2]!.split(',').map((x) => x.trim())
      if (selectors.some((x) => /^(html|:root)(\[[^\]]*\])?$/.test(x))) expect(m[3], `rule ${m[2]!.trim()}`).not.toMatch(/(^|[;\s])font-size\s*:/)
    }
  })
  it('keeps Figtree and tabular numerals', () => {
    expect(css).toMatch(/font-family:\s*'Figtree'/)
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/)
  })
  it("Cook Mode's Step text is Medium: --text-step-weight is 500 (PC-03, SHORT-01, decision: not extra-bold)", () => {
    expect(root['--text-step-weight']).toBe('500')
  })
})

describe('DS-07 base type roles in styles.css (zero specificity, any class rule wins)', () => {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  /** Declarations of every top-level rule whose selector is exactly `selector`, joined. */
  const base = (selector: string): string => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const all = [...code.matchAll(new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[2]!.replace(/\s+/g, ' ').trim())
    expect(all.length, `${selector} rule`).toBeGreaterThan(0)
    return all.join('; ')
  }
  it('body takes the body role: unclassed text is 15/22, 500', () => {
    const b = base('body')
    expect(b).toMatch(/font-size:\s*var\(--text-body-size\)/)
    expect(b).toMatch(/line-height:\s*var\(--text-body-line\)/)
    expect(b).toMatch(/font-weight:\s*var\(--text-body-weight\)/)
  })
  it(':where(h1, h2, h3, h4) has no margin', () => {
    expect(base(':where(h1, h2, h3, h4)')).toMatch(/margin:\s*0/)
  })
  it(':where(h2) is title-3 with --space-3 below it', () => {
    const b = base(':where(h2)')
    expect(b).toMatch(/margin-block-end:\s*var\(--space-3\)/)
    expect(b).toMatch(/font-size:\s*var\(--text-title-3-size\)/)
    expect(b).toMatch(/line-height:\s*var\(--text-title-3-line\)/)
    expect(b).toMatch(/font-weight:\s*var\(--text-title-3-weight\)/)
  })
  it(':where(h3, h4) is body-strong', () => {
    const b = base(':where(h3, h4)')
    expect(b).toMatch(/font-size:\s*var\(--text-body-strong-size\)/)
    expect(b).toMatch(/line-height:\s*var\(--text-body-strong-line\)/)
    expect(b).toMatch(/font-weight:\s*var\(--text-body-strong-weight\)/)
  })
})

describe('spacing tokens (4-pt)', () => {
  it.each([[1, 4], [2, 8], [3, 12], [4, 16], [5, 20], [6, 24], [8, 32], [10, 40], [14, 56]])('--space-%d is %dpx', (n, px) => {
    expect(root[`--space-${n}`]).toBe(`${px}px`)
  })
  it('layout rhythm: gutter, bento gap, tile padding (phone values)', () => {
    expect(root['--gutter']).toBe('16px')
    expect(root['--bento-gap']).toBe('10px')
    expect(root['--tile-pad']).toBe('16px')
  })
  it('tablet (24 / 12 / 20) and desktop (32 / 16 / 26) overrides exist', () => {
    expect(css).toMatch(/@media[^{]*min-width[^{]*\{\s*:root\s*\{[^}]*--gutter:\s*24px/)
    expect(css).toMatch(/@media[^{]*min-width[^{]*\{\s*:root\s*\{[^}]*--gutter:\s*32px/)
    // DS-09: the desktop step moves from 1200 px to 80em (1280 px at the default text size) with the rest of the breakpoint table
    expect(css).toMatch(/@media\s*\(min-width:\s*80em\)\s*\{\s*:root\s*\{[^}]*--gutter:\s*32px[^}]*--bento-gap:\s*16px[^}]*--tile-pad:\s*26px/)
    expect(css).not.toMatch(/@media\s*\(min-width:\s*1200px\)/)
    expect(css).toMatch(/--bento-gap:\s*12px/)
    expect(css).toMatch(/--bento-gap:\s*16px/)
    expect(css).toMatch(/--tile-pad:\s*20px/)
    expect(css).toMatch(/--tile-pad:\s*26px/)
  })
})

describe('radius tokens', () => {
  it.each([
    ['chip', '999px'], ['control', '14px'], ['button', '16px'], ['button-lg', '20px'], ['tile-sm', '20px'],
    ['tile', '24px'], ['hero', '28px'], ['board', '32px'], ['sheet', '28px'], ['dialog', '28px'],
    ['thumb', '12px'], ['thumb-lg', '16px'], ['nav', '24px'],
    ['tick', '6px'], ['hairline', '2px'],
  ])('--radius-%s is %s', (name, v) => {
    expect(root[`--radius-${name}`]).toBe(v)
  })
  it('keeps --radius-pill (old name) at 999px', () => {
    expect(root['--radius-pill']).toBe('999px')
  })
})

describe('DS-11 spacing token: icon-to-label micro gap', () => {
  it('--space-half is 2px', () => {
    expect(root['--space-half']).toBe('2px')
  })
})

describe('DS-09 grid minimums and the 1024 px rail handover', () => {
  const rem = (v: string) => parseFloat(v) * 16
  it('--tile-min-wide is 27rem (from 28rem) and --tile-min-row is 21.5rem (the Shop card row, SSP)', () => {
    expect(root['--tile-min-wide']).toBe('27rem')
    expect(root['--tile-min-row']).toBe('21.5rem')
    expect(root['--tile-min-metric']).toBe('9.5rem')
    expect(root['--tile-min-card']).toBe('20rem')
    expect(root['--tile-min-day']).toBe('21rem')
  })
  it('every --tile-min-* keeps its columns at the handover: n*min + (n-1)*gap <= 1024 - 88 - 2*gutter (tablet gutter 24, gap 12)', () => {
    const mins = Object.entries(root).filter(([k]) => /^--tile-min-/.test(k))
    expect(mins.map(([k]) => k).sort()).toEqual(['--tile-min-card', '--tile-min-day', '--tile-min-metric', '--tile-min-row', '--tile-min-wide'])
    const gap = 12
    const gutter = 24
    const rail = 88
    const handover = 1024 - rail - 2 * gutter
    for (const [k, v] of mins) {
      const min = rem(v)
      // every n that fits in the content box just below the rail (1023 px, no rail, gutter 24) must still fit with the rail
      const below = 1023 - 2 * gutter
      for (let n = 1; n * min + (n - 1) * gap <= below; n++) {
        expect(n * min + (n - 1) * gap, `${k}: ${n} columns at 1024 px`).toBeLessThanOrEqual(handover)
      }
    }
  })
})

describe('elevation tokens', () => {
  it('light values from the plan', () => {
    expect(root['--elev-0']).toBe('none')
    expect(root['--elev-1']).toBe('0 1px 2px rgb(16 24 20 / .06), 0 0 0 1px rgb(16 24 20 / .03)')
    expect(root['--elev-2']).toBe('0 6px 20px rgb(16 24 20 / .12)')
    expect(root['--elev-3']).toBe('0 -8px 32px rgb(0 0 0 / .18)')
    expect(root['--scrim']).toBe('rgb(8 12 10 / .45)')
  })
  it('dark scheme has no drop shadows (data-scheme=dark sets --elev-1..3 to none)', () => {
    const m = /\[data-scheme=['"]dark['"]\][^{]*\{([^}]*)\}/.exec(css)
    expect(m, 'a [data-scheme="dark"] rule exists').not.toBeNull()
    for (const n of [1, 2, 3]) expect(m![1]).toMatch(new RegExp(`--elev-${n}:\\s*none`))
  })
})

describe('motion tokens', () => {
  it('durations and easings from the plan', () => {
    expect(root['--dur-1']).toBe('120ms')
    expect(root['--dur-2']).toBe('180ms')
    expect(root['--dur-3']).toBe('240ms')
    expect(root['--ease-out']).toBe('cubic-bezier(.2,.8,.2,1)')
    expect(root['--ease-spring']).toBe('cubic-bezier(.34,1.56,.64,1)')
  })
  it('keeps --motion-fast (old name)', () => {
    expect(root['--motion-fast']).toBeDefined()
  })
  it('reduced motion collapses durations to <= 120ms', () => {
    const m = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)
    expect(m, 'reduced-motion :root rule').not.toBeNull()
    for (const n of [1, 2, 3]) {
      const v = new RegExp(`--dur-${n}:\\s*(\\d+)ms`).exec(m![1]!)
      expect(v, `--dur-${n}`).not.toBeNull()
      expect(Number(v![1])).toBeLessThanOrEqual(120)
    }
  })
})

describe('colour defaults in :root (Basil light, first paint) and aliases', () => {
  const BASIL_LIGHT: Record<string, string> = {
    '--color-bg': '#e7f4eb', '--color-surface': '#fafffc', '--color-surface-2': '#daecdf', '--color-surface-3': '#c8e0cf',
    '--color-line': '#c2d7c9', '--color-outline': '#677a6d', '--color-text': '#131d17', '--color-muted': '#4b5a4f',
    '--color-accent': '#34724e', '--color-on-accent': '#ffffff', '--color-accent-text': '#135533',
    '--color-soft': '#bfebcd', '--color-soft-strong': '#9addb2',
  }
  it.each(Object.entries(BASIL_LIGHT))('%s ~ %s (+-1 per channel)', (name, hex) => {
    const got = root[name]
    expect(got, name).toMatch(/^#[0-9a-f]{6}$/i)
    const a = hexToRgb(got!)
    const b = hexToRgb(hex)
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(1)
  })
  it('old names stay defined', () => {
    for (const old of ['background', 'surface-container', 'on-surface', 'primary', 'on-primary', 'primary-container', 'on-primary-container']) {
      expect(root[`--color-${old}`], old).toBeDefined()
    }
  })
  it('status variables have light defaults', () => {
    for (const n of ['leftover', 'spoil', 'danger', 'success', 'pinned', 'warn']) {
      for (const part of ['fg', 'bg', 'solid']) expect(root[`--status-${n}-${part}`], `${n}-${part}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
  it('the hard-coded pre-Bento status colours are gone from styles.css', () => {
    expect(css).not.toMatch(/#ffdad1/i)
    expect(css).not.toMatch(/#fff0b3/i)
  })
})

describe('Figtree 800 is imported', () => {
  it('main.tsx imports every weight 400..800', () => {
    for (const w of [400, 500, 600, 700, 800]) expect(main).toContain(`@fontsource/figtree/${w}.css`)
  })
})

/** Declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(selector: string, source = css): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(source)
  expect(m, `${selector} rule`).not.toBeNull()
  return m![2]!
}

// The tile tones moved from styles.css to ui/Tile.css (WP3): the same status pairs, on the variant/status attributes.
const tileCss = readFileSync(`${cwd}/src/ui/Tile.css`, 'utf8')
describe('tile tones use status foreground tokens (WCAG contrast in dark mode)', () => {
  it.each([
    ['spoil', 'spoil'],
    ['leftover', 'leftover'],
  ])(".tile[data-variant='status'][data-status='%s'] pairs its bg token with its fg token", (tone, name) => {
    const body = ruleBody(`.tile[data-variant='status'][data-status='${tone}']`, tileCss)
    expect(body).toMatch(new RegExp(`background:\\s*var\\(--status-${name}-bg\\)`))
    expect(body).toMatch(new RegExp(`color:\\s*var\\(--status-${name}-fg\\)`))
  })
  it('no hex literals remain in the spoil or leftover tile rules', () => {
    for (const tone of ['spoil', 'leftover']) {
      expect(ruleBody(`.tile[data-variant='status'][data-status='${tone}']`, tileCss), tone).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    }
  })
})

describe('dark OS fallback respects the ThemeProvider scheme attribute', () => {
  it('apply.ts writes the scheme to data-scheme on the root element', () => {
    const apply = readFileSync(`${cwd}/src/theme/apply.ts`, 'utf8')
    expect(apply).toMatch(/root\.dataset\.scheme\s*=\s*scheme/)
  })
  it('the dark fallback is not guarded by data-theme (nothing sets it)', () => {
    expect(css).not.toMatch(/data-theme/)
  })
  it("the dark fallback is skipped when data-scheme='light'", () => {
    const m = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-scheme='light'\]\)\s*\{/.exec(css)
    expect(m, "dark fallback guarded by :not([data-scheme='light'])").not.toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// B9-02: every new token of beta.9 lives in styles.css, named here once. Later packages use these names and never add
// their own (plan 3 section 6, B9-02 traps).
// ---------------------------------------------------------------------------------------------------------------------
describe('A11Y-02 focus tokens', () => {
  it('the ring is 3 px wide, 2 px off, 2 px inside a nested control, accent coloured', () => {
    expect(root['--focus-ring-width']).toBe('3px')
    expect(root['--focus-ring-offset']).toBe('2px')
    expect(root['--focus-ring-inner-width']).toBe('2px')
    expect(root['--focus-ring-color']).toBe('var(--color-accent)')
  })
  it('--focus-ring-offset-inset draws the ring inside a clipping container: minus the ring width', () => {
    expect(root['--focus-ring-offset-inset']).toBe('calc(-1 * var(--focus-ring-width))')
  })
  it('the old box-shadow --focus-ring stays until B9-07 removes it (trap)', () => {
    expect(root['--focus-ring']).toBeDefined()
  })
})

describe('A11Y-06 selected state tokens', () => {
  it('soft fill, accent-text content and ring, 1.5 px ring', () => {
    expect(root['--selected-bg']).toBe('var(--color-soft)')
    expect(root['--selected-fg']).toBe('var(--color-accent-text)')
    expect(root['--selected-ring']).toBe('var(--color-accent-text)')
    expect(root['--selected-ring-width']).toBe('1.5px')
  })
})

describe('A11Y-09 target and icon-set tokens', () => {
  it('--target-min is 44px', () => {
    expect(root['--target-min']).toBe('44px')
  })
  it('--icon-set-gap is 8px on a fine pointer and 12px on a coarse one', () => {
    expect(root['--icon-set-gap']).toBe('var(--space-2)')
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{\s*:root\s*\{[^}]*--icon-set-gap:\s*var\(--space-3\)/)
  })
})

describe('SHORT shell tokens: safe areas, bar gap, keyboard inset, compact rail', () => {
  it.each(['top', 'right', 'bottom', 'left'])('--safe-%s reads the env() inset with a 0px fallback', (side) => {
    expect(root[`--safe-${side}`]).toBe(`env(safe-area-inset-${side}, 0px)`)
  })
  it('--bar-gap is the 12 px nav inset, --keyboard-inset starts at 0px, --rail-compact is 64px', () => {
    expect(root['--bar-gap']).toBe('var(--nav-inset)')
    expect(root['--keyboard-inset']).toBe('0px')
    expect(root['--rail-compact']).toBe('64px')
  })
})

describe('TB board token block (DS-07 board roles)', () => {
  it('one board unit: landscape clamp(13px, min(1.25vw, 2vh), 36px), portrait clamp(13px, min(2vw, 1.25vh), 36px)', () => {
    expect(root['--board-unit']).toBe('clamp(13px, min(1.25vw, 2vh), 36px)')
    expect(css).toMatch(/@media\s*\(orientation:\s*portrait\)\s*\{\s*:root\s*\{[^}]*--board-unit:\s*clamp\(13px,\s*min\(2vw,\s*1\.25vh\),\s*36px\)/)
  })
  it.each([
    ['--text-board-hero', 'calc(3.25 * var(--board-unit))'],
    ['--text-board-title', 'calc(2 * var(--board-unit))'],
    ['--text-board-body', 'calc(1.5 * var(--board-unit))'],
    ['--text-board-meta', 'calc(1.375 * var(--board-unit))'],
    ['--text-board-heading', 'calc(1.3125 * var(--board-unit))'],
    ['--text-board-metric', 'calc(3.5 * var(--board-unit))'],
    ['--text-board-control', 'max(20px, calc(1.25 * var(--board-unit)))'],
    ['--board-control', 'max(56px, calc(3.5 * var(--board-unit)))'],
    ['--board-chip', 'max(40px, calc(2.5 * var(--board-unit)))'],
    ['--board-pad', 'calc(1.5 * var(--board-unit))'],
  ])('%s is %s', (name, value) => {
    expect(root[name]).toBe(value)
  })
})

describe('DS-06 warn tone: first-paint tokens', () => {
  it('light defaults in :root, as 6-digit hex', () => {
    expect(root['--status-warn-fg']).toBe('#564700')
    expect(root['--status-warn-bg']).toBe('#f4e8bb')
    expect(root['--status-warn-solid']).toBe('#766200')
  })
  it('both dark blocks carry the dark warn fg and bg, so the first paint has them', () => {
    const media = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-scheme='light'\]\)\s*\{([^}]*)\}/.exec(css)
    const attr = /:root\[data-scheme='dark'\],\s*\[data-scheme='dark'\]\s*\{([^}]*)\}/.exec(css)
    for (const [where, m] of [['dark OS fallback', media], ['[data-scheme=dark]', attr]] as const) {
      expect(m, where).not.toBeNull()
      expect(m![1], where).toMatch(/--status-warn-fg:\s*#e4d188/)
      expect(m![1], where).toMatch(/--status-warn-bg:\s*#362d07/)
    }
  })
  it('the info tone (Advance Steps) keeps its tokens in light and both dark blocks', () => {
    expect(root['--color-info-fg']).toBe('#1b4a7a')
    expect(root['--color-info-bg']).toBe('#d9e9fb')
    expect((css.match(/--color-info-fg:\s*#a9d0f5/g) ?? []).length).toBe(2)
  })
})
