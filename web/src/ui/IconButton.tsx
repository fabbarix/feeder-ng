import type { ButtonHTMLAttributes, Ref } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import './IconButton.css'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  icon: IconName
  /** Required, non-blank: becomes aria-label. A blank label throws. */
  label: string
  /** `compact` is 32 px inside day tiles; the hit area stays 44 px. */
  size?: 'md' | 'compact'
  /** Toggle: sets aria-pressed and renders the icon with weight `fill` while true. */
  pressed?: boolean
  /** React 19 passes `ref` as a prop (Menu anchors its popover to the button). */
  ref?: Ref<HTMLButtonElement>
}

/** The only place an icon is allowed without a visible text label. */
export function IconButton({ icon, label, size = 'md', pressed, type = 'button', className, ...rest }: IconButtonProps) {
  if (label.trim() === '') throw new Error('IconButton needs a non-blank label (it is its accessible name)')
  return (
    <button
      {...rest}
      type={type}
      className={['icon-button', className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-pressed={pressed}
      data-size={size}
    >
      <Icon name={icon} size={size === 'compact' ? 16 : 20} weight={pressed ? 'fill' : undefined} />
    </button>
  )
}
