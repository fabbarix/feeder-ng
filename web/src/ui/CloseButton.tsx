// DS-12 R-B: the one Close. A 40 px circle (transparent fill, 1 px --color-outline boundary, 20 px X) with a 52 px target,
// `flex: none` and top-aligned with the title, so it is never squashed or stretched. A sheet with a Cancel has no Close.
import type { ButtonHTMLAttributes } from 'react'
import { Icon } from './Icon'
import { uiStrings } from './strings'
import './CloseButton.css'

export interface CloseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Accessible name; default `uiStrings.close`. */
  label?: string
}

export function CloseButton({ label = uiStrings.close, type = 'button', className, ...rest }: CloseButtonProps) {
  return (
    <button {...rest} type={type} className={['close-button', className].filter(Boolean).join(' ')} aria-label={label}>
      <Icon name="close" size={20} />
    </button>
  )
}
