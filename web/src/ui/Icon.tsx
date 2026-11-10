import type { IconName } from './icons'

export type IconSize = 14 | 16 | 20 | 22 | 24 | 28 | 64
export type IconWeight = 'regular' | 'bold' | 'fill' | 'duotone'

export interface IconProps {
  name: IconName
  size?: IconSize
  weight?: IconWeight
  label?: string
}

/** Renders a registered Phosphor icon (docs/design/ui-fix-plan.md 4.1). STUB: the Developer implements it. */
export function Icon(_props: IconProps): null {
  return null
}
