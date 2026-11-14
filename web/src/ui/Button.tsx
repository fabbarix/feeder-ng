import { useCallback, useEffect, useRef, type ButtonHTMLAttributes, type Ref } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { useActionSurface } from './lib/actionSurface'
import { resolveButtonVariant, type LegacyButtonVariant } from './lib/legacy'
import './Button.css'

/**
 * DS-12 R-A: every action looks like a button. `secondary` and `danger-secondary` have a fill and a 1 px boundary; there is no
 * tertiary (bare text) action. `link` is only for a link inside running text, never on an action surface.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-secondary' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `tonal` and `ghost` are deprecated aliases of `secondary`. */
  variant?: ButtonVariant | LegacyButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: IconName
  /** Full width: 'phone' below 600 px, 'always', or 'never' (default). */
  block?: 'phone' | 'always' | 'never'
  /** DS-03: 'narrow' shows only the icon in the narrow band (useNarrow: 375 px and below at 16 px text); the label stays the accessible name. Needs `icon`. */
  iconOnly?: 'narrow'
  /** The button element (React 19 ref-as-prop); merged with the Button's own ref. */
  ref?: Ref<HTMLButtonElement>
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
  block = 'never',
  iconOnly,
  type = 'button',
  disabled,
  className,
  children,
  ref: forwardedRef,
  ...rest
}: ButtonProps) {
  const resolved = resolveButtonVariant(variant)
  const onActionSurface = useActionSurface()
  const ref = useRef<HTMLButtonElement | null>(null)
  const setRef = useCallback(
    (el: HTMLButtonElement | null) => {
      ref.current = el
      if (typeof forwardedRef === 'function') return forwardedRef(el)
      if (forwardedRef) forwardedRef.current = el
    },
    [forwardedRef],
  )

  useEffect(() => {
    if (import.meta.env.DEV && resolved === 'primary' && ref.current) checkSinglePrimary(ref.current)
  }, [resolved])

  useEffect(() => {
    if (resolved === 'link' && onActionSurface)
      console.error('Feeder UI: a link Button sits on an action surface (tile, toast, sheet footer, dialog, banner); use secondary (DS-12 R-A).')
  }, [resolved, onActionSurface])

  return (
    <button
      {...rest}
      ref={setRef}
      type={type}
      className={['button', className].filter(Boolean).join(' ')}
      data-variant={resolved}
      data-size={size}
      data-block={block === 'never' ? undefined : block}
      data-icon-only={iconOnly}
      data-spinner={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {loading ? (
        <span className="button__spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={ICON_SIZE[size]} />
      ) : null}
      {iconOnly ? <span className="button__label">{children}</span> : children}
    </button>
  )
}
