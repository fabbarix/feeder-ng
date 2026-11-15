import type { ButtonHTMLAttributes, Ref } from 'react'
import { Link } from 'react-router-dom'
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
  /** 'circle': a round button (CloseButton, the toast's Dismiss). Default: the 12 px squircle. */
  shape?: 'circle'
  /**
   * B9-55: a route to go to. The IconButton is then a router Link with the same look and the label as its name (a row's "Edit
   * <Recipe>" that opens the editor), so no feature hand-writes the icon-button class on a Link.
   */
  to?: string
  /** React 19 passes `ref` as a prop (Menu anchors its popover to the button). */
  ref?: Ref<HTMLButtonElement>
}

/** The only place an icon is allowed without a visible text label. */
export function IconButton({ icon, label, size = 'md', pressed, shape, type = 'button', className, to, ...rest }: IconButtonProps) {
  if (label.trim() === '') throw new Error('IconButton needs a non-blank label (it is its accessible name)')
  const classes = ['icon-button', className].filter(Boolean).join(' ')
  const glyph = <Icon name={icon} size={size === 'compact' ? 16 : 20} weight={pressed ? 'fill' : undefined} />
  if (to !== undefined) {
    return (
      <Link to={to} className={classes} aria-label={label} data-size={size} data-shape={shape} id={rest.id} title={rest.title}>
        {glyph}
      </Link>
    )
  }
  return (
    <button {...rest} type={type} className={classes} aria-label={label} aria-pressed={pressed} data-size={size} data-shape={shape}>
      {glyph}
    </button>
  )
}
