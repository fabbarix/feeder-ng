// ds-plan: the Plan's colour roles hold for EVERY accent theme (Tomato included) in light and dark. Pairs checked at WCAG AA
// from the golden palettes: the title of today (accent text on the tile), a why chip (text on the neutral container, its
// accent-coloured icon at 3:1), the today ring (accent against the page and the tile, 3:1).
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../theme/contrast'
import { GOLDEN_PALETTES } from '../../theme/palette.golden'

const cases = Object.entries(GOLDEN_PALETTES).flatMap(([name, p]) => (['light', 'dark'] as const).map((scheme) => [`${name} ${scheme}`, p[scheme]] as const))

describe.each(cases)('%s', (_label, c) => {
  it("today's title: accent text on the tile surface is AA text (4.5)", () => {
    expect(contrastRatio(c.accentText, c.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('a why chip: body text on surface-2 is AA (4.5); its accent icon (accent-text) is a 3:1 graphic', () => {
    expect(contrastRatio(c.text, c.surface2)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c.accentText, c.surface2)).toBeGreaterThanOrEqual(3)
  })

  it('the muted Course label and the Cooked row title: --color-muted on the tile is AA (4.5)', () => {
    expect(contrastRatio(c.muted, c.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('the today ring: accent against the page background and the tile is a 3:1 non-text boundary', () => {
    expect(contrastRatio(c.accent, c.bg)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(c.accent, c.surface)).toBeGreaterThanOrEqual(3)
  })
})
