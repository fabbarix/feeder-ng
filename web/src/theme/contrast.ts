// WCAG AA checks and a lightness-shifting fixer that keeps the hue.
import { BLACK_WHITE_CROSSOVER, contrastRatio, hexToHsl, hslToHex, normalizeHex, relativeLuminance, type Hex } from './color'

export { contrastRatio, normalizeHex, type Hex } from './color'

/** WCAG AA: 4.5:1 for normal text, 3:1 for large text. */
export function meetsAA(fg: Hex, bg: Hex, opts: { large?: boolean } = {}): boolean {
  return contrastRatio(fg, bg) >= (opts.large ? 3 : 4.5)
}

/**
 * Returns fg when it already reaches min against bg. Otherwise moves its
 * lightness (keeping hue and saturation) towards black or white, whichever
 * contrasts more with bg, until it does.
 */
export function ensureContrast(fg: Hex, bg: Hex, min = 4.5): Hex {
  const start = normalizeHex(fg)
  const background = normalizeHex(bg)
  if (contrastRatio(start, background) >= min) return start
  const hsl = hexToHsl(start)
  const target = relativeLuminance(background) > BLACK_WHITE_CROSSOVER ? 0 : 1
  for (let step = 1; step <= 100; step++) {
    const l = hsl.l + (target - hsl.l) * (step / 100)
    const candidate = hslToHex({ h: hsl.h, s: hsl.s, l })
    if (contrastRatio(candidate, background) >= min) return candidate
  }
  return hslToHex({ h: hsl.h, s: hsl.s, l: target })
}
