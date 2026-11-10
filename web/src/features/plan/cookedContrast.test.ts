// R11b N6: Cooked (and Not cooked) meals on Plan must stay WCAG AA. They used to be dimmed with opacity (slot name
// 2.78:1, Recipe name 3.85:1, Cooked chip 2.56:1). Now the state is marked by the Cooked chip (check icon, success
// colours) and a muted text colour, never by opacity. Two parts: the token pairs meet 4.5:1 in every accent and scheme,
// and plan.css uses exactly those tokens without opacity on text.
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../theme/contrast'
import { generatePalette, STATUS_PALETTE, type Scheme } from '../../theme/palette'
import { ACCENT_PRESETS } from '../settings/lib/accents'
import { readFeatureCss } from './test-css'

const SCHEMES: Scheme[] = ['light', 'dark']
const AA = 4.5

describe('Cooked state token pairs meet AA (4.5:1)', () => {
  it.each(ACCENT_PRESETS.flatMap((p) => SCHEMES.map((s) => [p.name, p.hex, s] as const)))('%s %s', (_name, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    // The day tile is a surface Tile: slot name, Recipe name (text or muted) sit on --color-surface.
    expect(contrastRatio(c.muted, c.surface), 'muted on surface').toBeGreaterThanOrEqual(AA)
    expect(contrastRatio(c.text, c.surface), 'text on surface').toBeGreaterThanOrEqual(AA)
    // The Cooked chip (success) and the Not cooked chip (danger).
    for (const status of ['success', 'danger'] as const) {
      const { fg, bg } = STATUS_PALETTE[status][scheme]
      expect(contrastRatio(fg, bg), `${status} chip`).toBeGreaterThanOrEqual(AA)
    }
    // N9: the neutral Step pill on Cook (tag chip).
    expect(contrastRatio(c.muted, c.surface2), 'tag chip').toBeGreaterThanOrEqual(AA)
  })
})

const css = readFeatureCss('plan.css')
/** Declaration blocks whose selector list mentions `needle`. */
const blocks = (needle: string) =>
  css
    .split('}')
    .map((b) => b.trim())
    .filter((b) => b.includes('{') && b.slice(0, b.indexOf('{')).includes(needle))
    .map((b) => b.slice(b.indexOf('{') + 1))

describe('plan.css Cooked state (N6)', () => {
  it('no rule that styles a Planned Meal (.plan-meal...) uses opacity: nothing is dimmed', () => {
    const all = blocks('.plan-meal')
    expect(all.length).toBeGreaterThan(0)
    for (const b of all) expect(b, b).not.toMatch(/(^|[;\s])opacity\s*:/)
  })

  it.each(['cooked', 'skipped'])('the %s Recipe name and slot name use the muted token, not a faded text colour', (state) => {
    for (const part of ['.plan-meal__recipe', '.plan-meal__slot']) {
      const found = css
        .split('}')
        .filter((b) => b.includes(`[data-state='${state}']`) && b.slice(0, b.indexOf('{')).includes(part))
      expect(found.length, `${state} ${part} rule`).toBeGreaterThan(0)
      expect(found.join('\n')).toMatch(/color:\s*var\(--color-muted\)/)
    }
  })
})
