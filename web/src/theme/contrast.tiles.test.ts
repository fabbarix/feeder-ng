// B9-17 (DS-06, DS 3, VC9, TB-05, PC-04, A11Y-02): the contrast of every tone on every tile tone, in light and dark, for every accent
// preset. Pure colour maths over theme/palette.ts and the fixed info pair of styles.css; no DOM. A tone is a text colour (the label and
// the icon: the icon is currentColor, so it is held to the text figure), a fill and a boundary (the status tile's 1 px border is its fg).
// theme/contrast.tokens.test.ts is B9-02's (the warn tokens and their palette); this file is the matrix of the primitives' pairs.
import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, rgbToHex, type Hex } from './color'
import { generatePalette, STATUS_PALETTE, type Palette, type Scheme, type StatusName } from './palette'
import { ACCENT_PRESETS } from '../features/settings/lib/accents'
import { readUiCss } from '../ui/test-utils'

const SCHEMES: Scheme[] = ['light', 'dark']
const CASES = ACCENT_PRESETS.flatMap((p) => SCHEMES.map((s) => [p.name, p.hex, s] as const))

// styles.css: the info pair is fixed, not derived from the accent (it is not in STATUS_PALETTE).
const INFO: Record<Scheme, { fg: Hex; bg: Hex }> = {
  light: { fg: '#1b4a7a', bg: '#d9e9fb' },
  dark: { fg: '#a9d0f5', bg: '#14304c' },
}

type ToneName = StatusName | 'info'
const TONES: ToneName[] = ['leftover', 'spoil', 'danger', 'success', 'pinned', 'warn', 'info']
const pair = (t: ToneName, scheme: Scheme): { fg: Hex; bg: Hex } => (t === 'info' ? INFO[scheme] : STATUS_PALETTE[t][scheme])

/** color-mix(in srgb, <fg> <pct>%, transparent) painted over <bg>, as the browser composites it (an sRGB tint). */
function tint(fg: Hex, bg: Hex, pct: number): Hex {
  const a = hexToRgb(fg)
  const b = hexToRgb(bg)
  return rgbToHex(...([0, 1, 2].map((i) => a[i]! * (pct / 100) + b[i]! * (1 - pct / 100)) as [number, number, number]))
}

/** The percentage of the hero why chip's `color-mix(in srgb, currentColor N%, transparent)` in ui/Tile.css (NaN when the rule is absent). */
function whyTintPercent(): number {
  const css = readUiCss('Tile.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const m = /\.tile\[data-variant=['"]hero['"]\]\s+\.chip\[data-kind=['"]why['"]\]\s*\{[^}]*color-mix\(in srgb,\s*currentColor\s+(\d+(?:\.\d+)?)%/.exec(css)
  return m ? Number(m[1]) : Number.NaN
}

/** The fills a tile or a chip can have in a scheme: the plain tiles, and every tone's own fill. */
function tileFills(p: Palette, scheme: Scheme): Record<string, Hex> {
  const out: Record<string, Hex> = { page: p.colors.bg, surface: p.colors.surface, 'surface-2': p.colors.surface2, soft: p.colors.soft }
  for (const t of TONES) out[`${t} tile`] = pair(t, scheme).bg
  return out
}

describe('every tone: text and icon on its own fill, boundary on the page and on every tile fill', () => {
  it.each(CASES)('%s %s %s', (_n, hex, scheme) => {
    const p = generatePalette({ accent: hex }, scheme)
    const fills = tileFills(p, scheme)
    for (const t of TONES) {
      const { fg, bg } = pair(t, scheme)
      // the label and the icon (currentColor) on the tone's own fill: a chip, a tile
      expect(contrastRatio(fg, bg), `${t}: fg on its bg`).toBeGreaterThanOrEqual(4.5)
      // the tile's 1 px border is its fg: a boundary against the page (3:1) and, as text, against the plain surfaces (4.5:1)
      expect(contrastRatio(fg, p.colors.bg), `${t}: border on the page`).toBeGreaterThanOrEqual(3)
      for (const on of ['surface', 'surface-2'] as const) expect(contrastRatio(fg, fills[on]!), `${t}: fg on ${on}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('a tone chip sits on any tile: the chip carries its own fill, so its text never depends on the tile', () => {
  it.each(CASES)('%s %s %s: every chip tone on every tile fill reads as a chip (its text >= 4.5 on its own fill) and a chip ring or a tile border never vanishes into the tile (>= 3:1 for the outline against each fill)', (_n, hex, scheme) => {
    const p = generatePalette({ accent: hex }, scheme)
    const fills = tileFills(p, scheme)
    for (const t of TONES) expect(contrastRatio(pair(t, scheme).fg, pair(t, scheme).bg), t).toBeGreaterThanOrEqual(4.5)
    // R-A: a secondary button, an IconButton and the neutral chip carry a 1 px --color-outline boundary on every tile fill
    for (const [name, fill] of Object.entries(fills)) {
      if (name === 'page') continue
      expect(contrastRatio(p.colors.outline, fill), `outline boundary on ${name}`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('the neutral state chip (DS-06 "Not cooked"): a surface-2 fill, a text label and a muted icon', () => {
  it.each(CASES)('%s %s %s', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    expect(contrastRatio(c.text, c.surface2), 'label on surface-2').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.muted, c.surface2), 'muted icon on surface-2 (text figure, 4.5:1)').toBeGreaterThanOrEqual(4.5)
    // on a plain tile (surface) the chip's fill is a different shade: the label needs nothing from the tile
    expect(contrastRatio(c.text, c.surface), 'label if the fill is lost (forced colours)').toBeGreaterThanOrEqual(4.5)
  })
})

describe('the Overdue chip (an info chip on a surface fill with a 1 px info ring)', () => {
  it.each(CASES)('%s %s %s', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    expect(contrastRatio(INFO[scheme].fg, c.surface), 'text and ring on surface').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(INFO[scheme].fg, c.surface2), 'text and ring on surface-2 (the board tile)').toBeGreaterThanOrEqual(4.5)
    // it sits on the info status tile (Advance Steps, overdue): the ring against the tile's fill
    expect(contrastRatio(INFO[scheme].fg, INFO[scheme].bg), 'ring against the info tile fill').toBeGreaterThanOrEqual(3)
  })
})

describe('warn and info side by side on one Planned Meal (A2): "Start Tue 21:30" (info) and a held meal (warn) tell apart in the figures', () => {
  it.each(SCHEMES)('%s: each pair reads (4.5:1) and the two fills are not the same colour', (scheme) => {
    const warn = STATUS_PALETTE.warn[scheme]
    const info = INFO[scheme]
    expect(contrastRatio(warn.fg, warn.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(info.fg, info.bg)).toBeGreaterThanOrEqual(4.5)
    expect(warn.bg).not.toBe(info.bg)
    expect(warn.fg).not.toBe(info.fg)
  })
})

describe('the hero (TB-05, A11Y-02, A11Y-03): text, why chips, the Cook button and the ring, light and dark, every preset', () => {
  it.each(CASES)('%s %s %s', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    // light: accent fill with on-accent text, a surface Cook button with accent-text. dark: soft-strong fill with text, an accent Cook button.
    const heroBg = scheme === 'light' ? c.accent : c.softStrong
    const heroFg = scheme === 'light' ? c.onAccent : c.text
    expect(contrastRatio(heroFg, heroBg), 'hero text on the hero').toBeGreaterThanOrEqual(4.5)
    // the why chip on a hero is a 14 % currentColor tint, the text inherited (TB-05; system.md says 18 %, the docs package reconciles)
    // The percentage is read from ui/Tile.css: the chapter says 14 %, but 14 % of the on-accent text colour over the light hero lands at
    // 4.25 to 4.36:1 for Basil, Teal and Slate (the hero text itself is 5.7:1), under the 4.5:1 a 12 px label needs. The rule may use
    // 14 % or less, whatever keeps every preset at 4.5:1 in both schemes (design choice 3 of the hand-back).
    const pct = whyTintPercent()
    expect(pct, 'the why-chip tint is at most 14 %').toBeLessThanOrEqual(14)
    expect(pct, 'and is a visible tint').toBeGreaterThanOrEqual(6)
    const whyFill = tint(heroFg, heroBg, pct)
    expect(contrastRatio(heroFg, whyFill), `why chip text on its ${pct} % tint`).toBeGreaterThanOrEqual(4.5)
    // the Cook button
    const cookBg = scheme === 'light' ? c.surface : c.accent
    const cookFg = scheme === 'light' ? c.accentText : c.onAccent
    expect(contrastRatio(cookFg, cookBg), 'Cook label on its fill').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(cookBg, heroBg), 'Cook fill against the hero (a UI component)').toBeGreaterThanOrEqual(3)
    // the ring inside a hero is the hero's own text colour
    expect(contrastRatio(heroFg, heroBg), 'focus ring on the hero').toBeGreaterThanOrEqual(3)
  })

  it.each(CASES)('%s %s %s: the hero in the OTHER scheme (a subtree scheme scope) has the same pairs: both hero looks pass in both directions', (_n, hex, scheme) => {
    // the Gallery's dark panel on a light page, and the reverse: a hero's pairs depend only on its own scheme, never on the page behind it
    const other: Scheme = scheme === 'light' ? 'dark' : 'light'
    const own = generatePalette({ accent: hex }, other).colors
    const bg = other === 'light' ? own.accent : own.softStrong
    const fg = other === 'light' ? own.onAccent : own.text
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the Timer pill (PC-04, PC-03, R-C+): boundary, finished tone, "+N" badge, inner focus ring', () => {
  it.each(CASES)('%s %s %s', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    const success = STATUS_PALETTE.success[scheme]
    // the pill: a surface fill with a 1 px outline boundary (3:1 against what is behind it: the page and the bar)
    expect(contrastRatio(c.outline, c.surface), 'boundary on the pill fill').toBeGreaterThanOrEqual(3)
    expect(contrastRatio(c.outline, c.bg), 'boundary against the page').toBeGreaterThanOrEqual(3)
    expect(contrastRatio(c.text, c.surface), 'label and time on the pill').toBeGreaterThanOrEqual(4.5)
    // finished: the success tone, its 2 px boundary is the fg (7.3 / 9.0 in the chapter)
    expect(contrastRatio(success.fg, success.bg), 'finished text on its fill').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(success.fg, c.bg), 'finished boundary against the page').toBeGreaterThanOrEqual(3)
    // the "+N" badge: text on surface-2 (13.5 / 12.0), its boundary (3.7 / 4.2); on the finished pill it turns to a surface fill
    expect(contrastRatio(c.text, c.surface2), 'badge text on surface-2').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.outline, c.surface2), 'badge boundary on surface-2').toBeGreaterThanOrEqual(3)
    expect(contrastRatio(c.text, c.surface), 'badge text on a surface fill (finished)').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.outline, c.surface), 'badge boundary on a surface fill (finished)').toBeGreaterThanOrEqual(3)
    // R-C+: the inner ring (accent) on the control's soft fill, and its icon (accent-text) on the soft fill
    expect(contrastRatio(c.accent, c.soft), 'inner ring on the soft fill').toBeGreaterThanOrEqual(3)
    expect(contrastRatio(c.accentText, c.soft), 'icon on the soft fill').toBeGreaterThanOrEqual(4.5)
    // the pill's accent boundary (the timer that holds Next) against the page
    expect(contrastRatio(c.accent, c.bg), 'gate boundary against the page').toBeGreaterThanOrEqual(3)
  })
})

describe('the camera bar (SSP-06): danger text on danger fill, its border against the page', () => {
  it.each(CASES)('%s %s %s', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    const danger = STATUS_PALETTE.danger[scheme]
    expect(contrastRatio(danger.fg, danger.bg), 'message on the bar').toBeGreaterThanOrEqual(7)
    expect(contrastRatio(danger.fg, c.bg), 'bar border against the page').toBeGreaterThanOrEqual(3)
    // Try again: a surface fill with an outline ring, on the danger tint
    expect(contrastRatio(c.outline, danger.bg), 'Try again ring on the tint').toBeGreaterThanOrEqual(3)
    expect(contrastRatio(c.text, c.surface), 'Try again label').toBeGreaterThanOrEqual(4.5)
  })
})

describe('MemberPill selected={false}: outlined and struck through, never faded (B9-07 built it)', () => {
  it.each(CASES)('%s %s %s', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    expect(contrastRatio(c.muted, c.bg), 'struck-through name on the page').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.muted, c.surface), 'on a tile').toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.outline, c.surface), 'ring on a tile').toBeGreaterThanOrEqual(3)
  })
})
