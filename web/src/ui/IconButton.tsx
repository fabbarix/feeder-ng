import type { ButtonHTMLAttributes } from 'react'
import type { IconName } from './icons'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  icon: IconName
  /** Required, non-blank: becomes aria-label. A blank label throws. */
  label: string
  /** `compact` is 32 px inside day tiles; the hit area stays 44 px. */
  size?: 'md' | 'compact'
  /** Toggle: sets aria-pressed and renders the icon with weight `fill` while true. */
  pressed?: boolean
}

/** STUB (WP3 designer). The only place an icon is allowed without a visible text label. */
export function IconButton(_props: IconButtonProps): never {
  throw new Error('not implemented')
}
