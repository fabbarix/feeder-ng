// A11Y-05 / A11Y-06: the contrast pairs of the ruled shape and of the selected ring, for all 7 accents in light and dark. These pairs
// are the ones the chapter adds to theme/contrast.test.ts BENTO_PAIRS; they are repeated here because theme/ is not in B9-16's files.
// Also the palette guard: a CUSTOM accent still gets an outline that is at least 3:1 on surface-3, surface-2, surface and bg.
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../theme/contrast'
import { generatePalette } from '../../theme/palette'
import { ACCENT_PRESETS } from '../../features/settings/lib/accents'

type Key = 'bg' | 'surface' | 'surface2' | 'surface3' | 'outline' | 'text' | 'muted' | 'accent' | 'accentText' | 'soft'
const PAIRS: ReadonlyArray<readonly [Key, Key, number, string]> = [
  ['outline', 'surface3', 3, 'ruled field: rule / its surface-3 fill'],
  ['outline', 'bg', 3, 'ruled field: rule / page'],
  ['outline', 'surface', 3, 'rule / tile'],
  ['outline', 'surface2', 3, 'outline / surface-2'],
  ['muted', 'surface3', 4.5, 'Segmented option label / ruled track'],
  ['text', 'surface3', 4.5, 'search text / ruled fill'],
  ['accentText', 'surface3', 3, 'selected ring / ruled track'],
  ['accentText', 'surface2', 3, 'selected ring / surface-2'],
  ['accentText', 'surface', 3, 'selected ring / surface'],
  ['accentText', 'soft', 3, 'selected ring / soft fill'],
  ['accent', 'surface3', 3, 'focus ring / ruled fill'],
]
const colours = (accent: string, scheme: 'light' | 'dark') => generatePalette({ accent }, scheme).colors as unknown as Record<string, string>

const cases = ACCENT_PRESETS.flatMap((p) => (['light', 'dark'] as const).flatMap((scheme) => PAIRS.map(([fg, bg, min, label]) => [p.name, scheme, label, fg, bg, min, p.hex] as const)))

describe('ruled field and selected ring contrast', () => {
  it.each(cases)('%s %s: %s', (_preset, scheme, _label, fg, bg, min, hex) => {
    const c = colours(hex, scheme)
    expect(contrastRatio(c[fg]!, c[bg]!)).toBeGreaterThanOrEqual(min)
  })
})

describe('palette guard for custom accents', () => {
  it.each(['#ffeb3b', '#00e5ff', '#f5f5f5', '#101010', '#7f7f7f', '#ff00ff'])('the outline of accent %s is at least 3:1 on surface-3, surface-2, surface and bg, in both schemes', (hex) => {
    for (const scheme of ['light', 'dark'] as const) {
      const c = colours(hex, scheme)
      for (const bg of ['surface3', 'surface2', 'surface', 'bg'] as const) {
        expect(contrastRatio(c.outline!, c[bg]!), `${scheme} outline / ${bg}`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
