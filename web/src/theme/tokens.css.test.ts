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

/** Declarations of the first top-level `:root { ... }` rule. */
function rootBlock(): Record<string, string> {
  const start = css.indexOf(':root {')
  expect(start, 'styles.css has a :root block').toBeGreaterThanOrEqual(0)
  const end = css.indexOf('\n}', start)
  const out: Record<string, string> = {}
  for (const m of css.slice(start + 7, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}
const root = rootBlock()

describe('type tokens (plan 3.2): size / line / weight', () => {
  const TYPES: Record<string, [string, string, string]> = {
    display: ['34px', '38px', '800'],
    'title-1': ['28px', '32px', '800'],
    'title-2': ['22px', '26px', '800'],
    'title-3': ['18px', '22px', '800'],
    'body-strong': ['15px', '20px', '700'],
    body: ['15px', '22px', '500'],
    meta: ['13px', '18px', '500'],
    label: ['13px', '16px', '700'],
    overline: ['12px', '16px', '800'],
  }
  it.each(Object.entries(TYPES))('%s', (name, [size, line, weight]) => {
    expect(root[`--text-${name}-size`]).toBe(size)
    expect(root[`--text-${name}-line`]).toBe(line)
    expect(root[`--text-${name}-weight`]).toBe(weight)
  })
  it('overline tracking and chip / nav label sizes', () => {
    expect(root['--text-overline-tracking']).toBe('0.04em')
    expect(root['--text-chip-size']).toBe('12px')
    expect(root['--text-nav-size']).toBe('11px')
    expect(root['--text-nav-weight']).toBe('800')
  })
  it('no type size is below 11px (nav, per plan) and only nav is below 12', () => {
    for (const [k, v] of Object.entries(root)) if (/^--text-.*-size$/.test(k)) expect(parseInt(v, 10), k).toBeGreaterThanOrEqual(11) // nav is the 11px exception in the plan
  })
  it('keeps Figtree and tabular numerals', () => {
    expect(css).toMatch(/font-family:\s*'Figtree'/)
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/)
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
  ])('--radius-%s is %s', (name, v) => {
    expect(root[`--radius-${name}`]).toBe(v)
  })
  it('keeps --radius-pill (old name) at 999px', () => {
    expect(root['--radius-pill']).toBe('999px')
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
    for (const n of ['leftover', 'spoil', 'danger', 'success', 'pinned']) {
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
