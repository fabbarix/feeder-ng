import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS } from './accents'
import { contrastRatio, previewColours } from './previewColours'

describe('previewColours (L12: "Sample" was 3.66:1 in dark)', () => {
  it.each(ACCENT_PRESETS.flatMap((p) => (['light', 'dark'] as const).map((s) => [p.name, p.hex, s] as const)))(
    '%s in %s mode: the sample text reads at 4.5:1 or more on the accent',
    (_name, hex, scheme) => {
      const c = previewColours(hex, scheme, false)
      expect(contrastRatio(c.accent, c.onAccent)).toBeGreaterThanOrEqual(4.5)
    },
  )
  it('follows prefers-color-scheme for System', () => {
    expect(previewColours('#3f7d58', 'system', true)).toEqual(previewColours('#3f7d58', 'dark', false))
    expect(previewColours('#3f7d58', 'system', false)).toEqual(previewColours('#3f7d58', 'light', true))
  })
})
