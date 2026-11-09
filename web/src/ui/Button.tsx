import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'tonal' | 'ghost'
  size?: 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}

/** A button. type="button" unless told otherwise, so it never submits a form by accident. */
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
