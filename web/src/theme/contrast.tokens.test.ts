// B9-02 (DS-06, A11Y-12): the contrast of the new tokens, for every accent preset in both schemes, and the proof that
// styles.css carries the same status colours as theme/palette.ts (the first paint must not differ from the runtime values).
// theme/contrast.test.ts is B9-01's file; this one is B9-02's.
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'
import { generatePalette, STATUS_PALETTE, type Scheme } from './palette'
import { ACCENT_PRESETS } from '../features/settings/lib/accents'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/styles.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const SCHEMES: Scheme[] = ['light', 'dark']
const CASES = ACCENT_PRESETS.flatMap((p) => SCHEMES.map((s) => [p.name, p.hex, s] as const))
const ratio = (a: string, b: string) => contrastRatio(a, b)

describe('DS-06 warn tone: every pair, every preset, both schemes', () => {
  it.each(CASES)('%s %s %s', (_name, hex, scheme) => {
    const warn = STATUS_PALETTE.warn[scheme]
    const c = generatePalette({ accent: hex }, scheme).colors
    // text on its own tint
    expect(ratio(warn.fg, warn.bg), 'fg on bg').toBeGreaterThanOrEqual(4.5)
    // a status tile's border is its fg: on the page it is a boundary (3:1); on the surfaces it is text (4.5:1)
    expect(ratio(warn.fg, c.bg), 'border on the page').toBeGreaterThanOrEqual(3)
    for (const on of ['bg', 'surface', 'surface2'] as const) expect(ratio(warn.fg, c[on]), `fg on ${on}`).toBeGreaterThanOrEqual(4.5)
    // the solid carries white text
    expect(ratio('#ffffff', warn.solid), 'white on solid').toBeGreaterThanOrEqual(4.5)
  })

  it('the tinted fill alone does not read against the page, which is why every status tile has a border', () => {
    expect(ratio(STATUS_PALETTE.warn.light.bg, '#e7f4eb')).toBeLessThan(1.5)
    expect(ratio(STATUS_PALETTE.warn.light.fg, STATUS_PALETTE.warn.light.bg)).toBeCloseTo(7.45, 1)
    expect(ratio(STATUS_PALETTE.warn.dark.fg, STATUS_PALETTE.warn.dark.bg)).toBeCloseTo(8.97, 1)
  })
})

describe('DS-06 Overdue chip (an info chip on a surface fill with a 1 px info ring)', () => {
  // The info pair is fixed in styles.css (--color-info-fg / --color-info-bg), not derived from the accent.
  const infoFg = { light: '#1b4a7a', dark: '#a9d0f5' }
  const infoBg = { light: '#d9e9fb', dark: '#14304c' }
  it.each(CASES)('%s %s %s', (_name, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    expect(ratio(infoFg[scheme], c.surface), 'text on surface').toBeGreaterThanOrEqual(4.5)
    expect(ratio(infoFg[scheme], infoBg[scheme]), 'ring against the info fill').toBeGreaterThanOrEqual(3)
  })
})

describe('A11Y-12 dark danger solid #ba4f4b', () => {
  it.each(CASES.filter(([, , s]) => s === 'dark'))('%s %s: at least 3:1 on bg, surface and surface-2 (non-text, WCAG 1.4.11); white on it 4.5:1 or more', (_n, hex, scheme) => {
    const solid = STATUS_PALETTE.danger[scheme].solid
    const c = generatePalette({ accent: hex }, scheme).colors
    for (const on of ['bg', 'surface', 'surface2'] as const) expect(ratio(solid, c[on]), `on ${on}`).toBeGreaterThanOrEqual(3)
    expect(ratio('#ffffff', solid)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('styles.css carries the palette status colours (first paint equals the runtime values)', () => {
  /** Declarations of every rule whose selector list matches `selector` (a regexp source), merged in source order. */
  function rules(selector: RegExp, source = css): Record<string, string> {
    const out: Record<string, string> = {}
    for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.test(m[1]!.trim())) continue
      for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim()
    }
    return out
  }
  const lightRoot = rules(/^:root(,\s*\[data-scheme='light'\])?$/)
  const darkMedia = (() => {
    const m = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-scheme='light'\]\)\s*\{([^}]*)\}/.exec(css)
    expect(m, 'the dark OS fallback block').not.toBeNull()
    const out: Record<string, string> = {}
    for (const d of m![1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim()
    return out
  })()
  const darkAttr = rules(/^:root\[data-scheme='dark'\],\s*\[data-scheme='dark'\]$/)

  it.each(['warn', 'danger'] as const)('%s: light :root block equals STATUS_PALETTE.light', (n) => {
    for (const part of ['fg', 'bg', 'solid'] as const) expect(lightRoot[`--status-${n}-${part}`], `${n}-${part}`).toBe(STATUS_PALETTE[n].light[part])
  })

  it.each([['the dark OS fallback', darkMedia], ['the [data-scheme=dark] block', darkAttr]] as const)('warn and danger in %s equal STATUS_PALETTE.dark', (_where, block) => {
    for (const n of ['warn', 'danger'] as const) {
      for (const part of ['fg', 'bg', 'solid'] as const) {
        const v = block[`--status-${n}-${part}`]
        // fg and bg are always written; the solid is written wherever the status differs from the light value
        if (v === undefined) {
          expect(STATUS_PALETTE[n].dark[part], `${n}-${part} is inherited, so it must equal the light value`).toBe(STATUS_PALETTE[n].light[part])
        } else {
          expect(v, `${n}-${part}`).toBe(STATUS_PALETTE[n].dark[part])
        }
      }
    }
  })

  it('the dark danger solid is written as #ba4f4b in both dark blocks (A11Y-12)', () => {
    expect(darkMedia['--status-danger-solid']).toBe('#ba4f4b')
    expect(darkAttr['--status-danger-solid']).toBe('#ba4f4b')
    expect((css.match(/--status-danger-solid:\s*#ab413e/g) ?? []).length, 'only the light block keeps #ab413e').toBe(1)
  })
})
