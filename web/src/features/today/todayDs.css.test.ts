// DS-TODAY (docs/design/system.md §1, §4, §8; ADR 0016): the Today stylesheet follows the system. jsdom does not lay out: stylesheet text.
// today.css is a beta.5.1 screen, so the check-ui rules (type-scale, opacity-muting, word-break) FAIL on it.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss } from './test-css'

const raw = readFeatureCss('today.css')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = ruleBlocks(css)

describe('today.css: the system rules', () => {
  it('has no font-size that is not a --text-* token (type scale)', () => {
    for (const m of css.matchAll(/font-size\s*:\s*([^;}]+)/g)) expect(m[1]!.trim(), m[0]).toMatch(/^var\(--text-[a-z0-9-]+-size\)$/)
    expect(css).not.toMatch(/(^|[;{\s])font\s*:/)
  })

  it('mutes with --color-muted, never with opacity (opacity-muting)', () => {
    for (const m of css.matchAll(/opacity\s*:\s*([0-9.]+)/g)) {
      const v = Number(m[1])
      expect(v < 0.5 || v > 0.95, m[0]).toBe(true)
    }
  })

  it('never breaks a word (word-break)', () => {
    expect(css).not.toMatch(/hyphens\s*:\s*auto/)
    expect(css).not.toMatch(/overflow-wrap\s*:\s*(anywhere|break-word)/)
    expect(css).not.toMatch(/word-break\s*:\s*(break-all|break-word)/)
  })

  it('has no raw px or rem gap, margin or padding (spacing tokens: --space-*, --bento-gap, --tile-pad, --section-gap)', () => {
    for (const m of css.matchAll(/(?:^|[;{\s])(gap|row-gap|column-gap|margin[a-z-]*|padding[a-z-]*)\s*:\s*([^;}]+)/g)) {
      const value = m[2]!.replace(/var\([^)]*\)/g, '').replace(/\b0(px|rem)?\b/g, '').replace(/\b1px\b/g, '')
      expect(value, m[0]).not.toMatch(/\d+(\.\d+)?(px|rem)/)
    }
  })

  it('the loading paragraph and its opacity are gone (.today__muted): nothing says "Loading" any more', () => {
    expect(css).not.toContain('.today__muted')
  })
})

describe('today.css: the page and its grid', () => {
  it('the sections are spaced by --section-gap', () => {
    expect(declarations(css, '.today')['gap']).toBe('var(--section-gap)')
  })

  it('the page ends above the floating nav: .today adds no bottom padding or margin and does not fill the viewport (P12)', () => {
    const d = declarations(css, '.today')
    for (const p of ['padding', 'padding-block', 'padding-bottom', 'padding-block-end', 'margin', 'margin-block', 'margin-bottom', 'margin-block-end'])
      expect(d[p], p).toBeUndefined()
    expect(d['min-block-size'] ?? '').not.toMatch(/vh|dvh|svh/)
    expect(d['min-height'] ?? '').not.toMatch(/vh|dvh|svh/)
    expect(d['overflow'] ?? 'visible').toBe('visible')
    expect(d['position'] ?? 'static').toBe('static')
  })

  it('no fixed column count (ADR 0016): no data-columns rule, no 3-column dense grid, no hero span', () => {
    expect(css).not.toMatch(/data-columns/)
    expect(css).not.toMatch(/repeat\(\s*3\s*,/)
    expect(css).not.toMatch(/grid-auto-flow:\s*row dense/)
    expect(css).not.toMatch(/data-hero-span/)
    expect(css).not.toMatch(/grid-row:\s*span/)
  })

  it('no status or "today" rule widens a tile (only span="full" fills a row)', () => {
    expect(css).not.toMatch(/grid-column:\s*span\s*[2-9]/)
  })

  it('the metric strip takes the whole row of the Today grid, so a metric is never a half-width orphan', () => {
    expect(declarations(css, '.today-metrics')['grid-column']).toBe('1 / -1')
  })

  it('the old half-width streak tile rule is gone', () => {
    expect(css).not.toContain('.today-streak')
  })

  it('the slot wrapper is still display: contents, so the tiles are the grid items', () => {
    expect(declarations(css, '.today__slot')['display']).toBe('contents')
  })

  it('tile titles use the title-3 token and no ad-hoc margin', () => {
    const d = declarations(css, '.today__tile-title')
    expect(d['font-size']).toBe('var(--text-title-3-size)')
    expect(blocks.some((b) => b.selectors.includes('.today__tile-title') && /margin\s*:\s*0\s+0\s+8px/.test(b.body))).toBe(false)
  })

  it('the hero actions are still not restyled here (plan.css owns them)', () => {
    expect(css).not.toMatch(/plan-hero/)
  })
})
