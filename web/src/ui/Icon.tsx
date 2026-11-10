import { icons, type IconName } from './icons'

export type IconSize = 14 | 16 | 20 | 22 | 24 | 28 | 64
export type IconWeight = 'regular' | 'bold' | 'fill' | 'duotone'

export interface IconProps {
  name: IconName
  size?: IconSize
  weight?: IconWeight
  label?: string
}

/** Weight follows size: dense chips and meta (14/16 px) read bold, larger glyphs regular. */
const defaultWeight = (size: IconSize): IconWeight => (size <= 16 ? 'bold' : 'regular')

/**
 * Renders a registered Phosphor icon (docs/design/ui-fix-plan.md 4.1). Colour is currentColor.
 * Decorative unless a non-empty `label` is given (`label=""` counts as decorative), in which case it is announced as an image.
 */
export function Icon({ name, size = 20, weight, label }: IconProps) {
  const Glyph = icons[name]
  const a11y = label === undefined || label === '' ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': label }
  return <Glyph size={size} weight={weight ?? defaultWeight(size)} color="currentColor" {...a11y} />
}
