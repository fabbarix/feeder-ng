// DS-TODAY round 2 (review of 52dc410f in a real browser): the stylesheet contract behind the layout fixtures
// (scripts/test/fixtures/ds-layout/today-*.html, run by scripts/test/ds-layout_test.sh). jsdom does not lay out: stylesheet text.
import { describe, expect, it } from 'vitest'
import { generatePalette, type Scheme } from '../../theme/palette'
import { contrastRatio } from '../../theme/contrast'
import { ACCENT_PRESETS } from '../settings/lib/accents'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss } from './test-css'

const raw = readFeatureCss('components/TonightHero.css')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
const frame = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = ruleBlocks(css)
const bodies = (pred: (s: string) => boolean) => blocks.filter((b) => b.selectors.some(pred)).map((b) => b.body).join(';')

describe('To confirm: the row is the ActionGroup\'s container with a real actions track', () => {
  it('wide: badge | text (shrinks) | actions on max-content, never an `auto` track (it collapsed to 0 px on a size-contained host)', () => {
    const cols = declarations(css, '.to-confirm__row')['grid-template-columns'] ?? ''
    expect(cols).toMatch(/^auto minmax\(0, 1fr\) (max-content|var\(--action-group-min-inline-size\)|minmax\(max-content, auto\))$/)
  })

  it('narrow (container query, same 35 rem as the group): the group drops to its own row spanning every column', () => {
    expect(raw).toMatch(/@container[^{]*max-width:\s*35rem/)
    const d = bodies((s) => /\.to-confirm__row\s+\.action-group$/.test(s))
    expect(d).toMatch(/grid-column:\s*1\s*\/\s*-1/)
  })

  it('the text never overlaps the actions: the text track has min-inline-size 0 and the group never shrinks', () => {
    expect(declarations(css, '.to-confirm__text')['min-inline-size']).toBe('0')
  })

  it('the count is a pill: round, padded, filled with the neutral container', () => {
    const d = declarations(css, '.to-confirm__count')
    expect(d['border-radius']).toMatch(/var\(--radius-/)
    expect(d['padding-inline']).toMatch(/var\(--space-/)
    expect(d['background']).toBe('var(--color-surface-2)')
    expect(d['color']).toBe('var(--color-text)')
  })

  it('"+ Side" is emphasised against the muted name', () => {
    const d = declarations(css, '.to-confirm__meta strong')
    expect(d['font-weight']).toBe('800')
    expect(d['color']).toBe('var(--color-text)')
  })
})

describe('TonightHero.css: tokens only, no raw breakpoint', () => {
  it('no raw px or rem in a gap, margin or padding', () => {
    for (const m of css.matchAll(/(?:^|[;{\s])(gap|row-gap|column-gap|margin[a-z-]*|padding[a-z-]*)\s*:\s*([^;}]+)/g)) {
      const value = m[2]!.replace(/var\([^)]*\)/g, '').replace(/\b0(px|rem)?\b/g, '').replace(/\b1px\b/g, '')
      expect(value, m[0]).not.toMatch(/\d+(\.\d+)?(px|rem)/)
    }
  })

  it('the hero title steps up with a container query on the hero, not a raw @media (min-width: 520px)', () => {
    expect(css).not.toMatch(/@media[^{]*\b520px/)
    expect(css).toMatch(/@container[^{]*min-width/)
    expect(declarations(css, '.plan-hero')['container-type']).toBe('inline-size')
  })
})

describe('the hero\'s slot menu and rows follow the content inset and the mockup', () => {
  it('the slot ⋮ sits at the tile padding (top and end), aligned with the content, not at 8 px', () => {
    const d = { ...declarations(frame, '.plan-hero__menu'), ...(css.includes('.plan-hero__menu') ? declarations(css, '.plan-hero__menu') : {}) }
    expect(d['inset-inline-end']).toBe('var(--tile-pad)')
    expect(d['top'] ?? d['inset-block-start']).toBe('var(--tile-pad)')
  })

  it('the Course list has a divider above it and a caption column on a wide hero (container query)', () => {
    expect(bodies((s) => s === '.plan-hero__courses')).toMatch(/border-block-start:\s*1px solid color-mix\(/)
    expect(raw).toMatch(/@container[^{]*min-width[^{]*\{[^}]*\}?[\s\S]*\.plan-hero \.plan-course\s*\{[^}]*grid-template-columns/)
  })

  it('the name and the chip sit side by side on a wide hero and stacked on a phone; the name is never cut with an ellipsis', () => {
    const what = bodies((s) => s === '.plan-course__what')
    expect(what).toMatch(/display:\s*flex/)
    expect(what).toMatch(/flex-wrap:\s*wrap/)
    const name = bodies((s) => /\.plan-hero .*\.plan-meal__recipe$/.test(s) || s === '.plan-course .plan-meal__recipe')
    expect(name).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(name).not.toMatch(/white-space:\s*nowrap/)
  })

  it('the three icon actions are one evenly sized group: equal tracks, the group at the row end', () => {
    const d = declarations(css, '.plan-course__actions')
    expect(d['display']).toMatch(/^(grid|inline-grid)$/)
    expect(d['grid-auto-columns'] ?? d['grid-template-columns']).toMatch(/1fr|var\(--/)
    expect(d['margin-inline-start']).toBe('auto')
  })
})

describe('the hero caption is readable on the accent (it was --color-muted: invisible)', () => {
  const mixed = (fg: string, bg: string, a: number) => {
    const c = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const [f, b] = [c(fg), c(bg)]
    return '#' + f.map((v, i) => Math.round(v * a + b[i]! * (1 - a)).toString(16).padStart(2, '0')).join('')
  }

  it('uses the hero\'s own text colour at 85 %, never --color-muted, in light and dark', () => {
    expect(bodies((s) => s === '.plan-hero .plan-course__caption')).toMatch(/color:\s*color-mix\(in srgb, var\(--color-on-accent\) 85%, transparent\)/)
    expect(bodies((s) => /data-theme='dark'\] \.plan-hero .plan-course__caption$/.test(s))).toMatch(/color:\s*color-mix\(in srgb, var\(--color-text\) 85%, transparent\)/)
    for (const b of blocks.filter((x) => x.selectors.some((s) => s.includes('.plan-hero')))) expect(b.body).not.toMatch(/var\(--color-muted\)/)
  })

  it.each(ACCENT_PRESETS.flatMap((p) => (['light', 'dark'] as Scheme[]).map((s) => [p.name, p.hex, s] as const)))('%s %s: caption, name and chip text reach AA on the hero', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    // light: on-accent over the accent; dark: text over the accent container
    const [bg, fg] = scheme === 'light' ? [c.accent, c.onAccent] : [c.softStrong, c.text]
    expect(contrastRatio(mixed(fg, bg, 0.85), bg), 'caption (85 %)').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(fg, bg), 'title').toBeGreaterThanOrEqual(4.5)
  })
})
