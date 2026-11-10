import { useEffect, useRef, type ButtonHTMLAttributes } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { resolveButtonVariant, type LegacyButtonVariant } from './lib/legacy'
import './Button.css'

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

const ICON_SIZE = { sm: 16, md: 20, lg: 22, xl: 22 } as const

/** Scopes already warned about, so each warns once. */
const warnedScopes = new WeakSet<Element | Document>()

/** Dev only: a primary Button checks, once on mount, that its scope holds one primary. */
function checkSinglePrimary(el: HTMLButtonElement) {
  const scope: Element | Document = el.closest(`[${PRIMARY_SCOPE_ATTR}]`) ?? el.ownerDocument
  if (warnedScopes.has(scope)) return
  if (scope.querySelectorAll('button[data-variant="primary"]').length > 1) {
    warnedScopes.add(scope)
    console.warn('Feeder UI: more than one primary Button in the same scope (docs/design/ui-fix-plan.md 4.2).')
  }
}

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
  const resolved = resolveButtonVariant(variant)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (import.meta.env.DEV && resolved === 'primary' && ref.current) checkSinglePrimary(ref.current)
  }, [resolved])

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={['button', className].filter(Boolean).join(' ')}
      data-variant={resolved}
      data-size={size}
      data-spinner={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {loading ? (
        <span className="button__spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={ICON_SIZE[size]} />
      ) : null}
      {children}
    </button>
  )
}
