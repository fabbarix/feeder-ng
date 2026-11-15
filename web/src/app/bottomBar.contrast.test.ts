// B9-19 (DS-02 / R-F, A11Y-06; the main session's ruling 2): the current page in the bottom bar carries no ring. Its state is the soft
// 40 px squircle, the filled icon weight, the accent colour and aria-current, and at 375 px (icons only) the icon is the only visible
// cue. So the filled accent-text icon must read at >= 3:1 against its squircle (soft) and against the bar around it (surface), in light
// and dark, for every accent preset; and the bar's other pairs hold too.
import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS } from '../features/settings/lib/accents'
import { contrastRatio } from '../theme/contrast'
import { generatePalette, type Scheme } from '../theme/palette'

const cases = ACCENT_PRESETS.flatMap((p) => (['light', 'dark'] as const).map((scheme) => [p.name, scheme] as const))
const colours = (preset: string, scheme: Scheme) =>
  generatePalette({ accent: ACCENT_PRESETS.find((p) => p.name === preset)!.hex }, scheme).colors as unknown as Record<string, string>

describe('bottom bar pairs on every palette (R-F, A11Y-06)', () => {
  it.each(cases)('%s %s: the current page\'s filled icon (accent-text) is >= 3 on its squircle (soft) and on the bar (surface)', (preset, scheme) => {
    const c = colours(preset, scheme)
    expect(contrastRatio(c.accentText!, c.soft!), 'icon on the squircle').toBeGreaterThanOrEqual(3)
    expect(contrastRatio(c.accentText!, c.surface!), 'icon against the bar').toBeGreaterThanOrEqual(3)
  })

  it.each(cases)('%s %s: the current label (accent-text) and the other labels (muted) are >= 4.5 on the bar', (preset, scheme) => {
    const c = colours(preset, scheme)
    expect(contrastRatio(c.accentText!, c.surface!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.muted!, c.surface!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(cases)('%s %s: Scan\'s icon (on-accent) is >= 4.5 on its squircle, and the accent squircle is >= 3 against the bar', (preset, scheme) => {
    const c = colours(preset, scheme)
    expect(contrastRatio(c.onAccent!, c.accent!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.accent!, c.surface!)).toBeGreaterThanOrEqual(3)
  })
})
