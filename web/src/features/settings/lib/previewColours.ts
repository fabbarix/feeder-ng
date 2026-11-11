import { contrastRatio } from '../../../theme/color'
import { generatePalette, type Hex, type Scheme } from '../../../theme/palette'

/** The accent and its text colour for the preview chip: one pair of the generated palette, so the text always reads on the fill. */
export function previewColours(accent: Hex, scheme: Scheme | 'system', prefersDark: boolean): { accent: Hex; onAccent: Hex } {
  const resolved: Scheme = scheme === 'system' ? (prefersDark ? 'dark' : 'light') : scheme
  const { colors } = generatePalette({ accent }, resolved)
  return { accent: colors.accent, onAccent: colors.onAccent }
}

export { contrastRatio }
