import { useId, type ReactNode } from 'react'
import { Icon } from '../Icon'
import type { FieldSize } from './Field'

/** The ids a field needs: its label, helper line and error line (aria-describedby is built from the last two). */
export interface FieldIds {
  labelId: string
  helperId: string
  errorId: string
}

export function useFieldIds(): FieldIds {
  const base = useId()
  return { labelId: `${base}-label`, helperId: `${base}-helper`, errorId: `${base}-error` }
}

/** aria-describedby for the helper and error lines that are shown. */
export function describedBy(ids: FieldIds, helper?: string, error?: string): string | undefined {
  const parts = [helper ? ids.helperId : null, error ? ids.errorId : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

export interface FieldFrameProps {
  ids: FieldIds
  label: string
  /** The control's id when the label is a real <label>; otherwise the label is a span named by ids.labelId. */
  labelFor?: string
  helper?: string
  error?: string
  /** Extra class for the outer frame. */
  className?: string
  /** Max inline size token; sets data-size on the frame. Type-only until the Developer step. */
  size?: FieldSize
  children: ReactNode
}

/** Label above the control, helper and error below (docs/design/ui-fix-plan.md 4.10). */
export function FieldFrame({ ids, label, labelFor, helper, error, className, children }: FieldFrameProps) {
  const frameClass = ['ui-field', className].filter(Boolean).join(' ')
  return (
    <div className={frameClass} data-invalid={error ? '' : undefined}>
      {labelFor ? (
        <label id={ids.labelId} htmlFor={labelFor} className="ui-field__label">
          {label}
        </label>
      ) : (
        <span id={ids.labelId} className="ui-field__label">
          {label}
        </span>
      )}
      {children}
      {helper ? (
        <p id={ids.helperId} className="ui-field__helper">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} className="ui-field__error">
          <Icon name="error" size={14} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
