import type { ButtonHTMLAttributes } from 'react'
import type { IconName } from './icons'
import type { LegacyButtonVariant } from './lib/legacy'

export type ButtonVariant = 'primary' | 'secondary' | 'accent-secondary' | 'tertiary' | 'danger' | 'danger-tertiary'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `tonal` and `ghost` are deprecated aliases of `secondary` and `tertiary`. */
  variant?: ButtonVariant | LegacyButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: IconName
}

/** Attribute that scopes the single-primary dev warning; Tile, BottomSheet and Dialog set it. */
export const PRIMARY_SCOPE_ATTR = 'data-primary-scope'

/**
 * STUB (WP3 designer, existing implementation retained so unmigrated screens keep working).
 * Spec: docs/dev/design/wp3-primitives-a.md.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  type = 'button',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={['button', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {icon ? <span className="button__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  )
}
