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

/** aria-describedby for the `lead` id (a unit or suffix, announced first), the helper and error lines that are shown, then any `extra` ids the caller passed (e.g. why the field is off). */
export function describedBy(ids: FieldIds, helper?: string, error?: string, extra?: string, lead?: string): string | undefined {
  const parts = [lead?.trim() || null, helper ? ids.helperId : null, error ? ids.errorId : null, extra?.trim() || null].filter(Boolean)
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
  /** Max inline size token; sets data-size on the frame. */
  size?: FieldSize
  /** DS-SHOP round 2: "chip" is a compact toolbar picker; the frame carries data-appearance. */
  appearance?: 'chip'
  /** The label is still the accessible name, only visually hidden. */
  labelHidden?: boolean
  children: ReactNode
}

/** Label above the control, helper and error below (docs/design/ui-fix-plan.md 4.10). */
export function FieldFrame({ ids, label, labelFor, helper, error, className, size, appearance, labelHidden, children }: FieldFrameProps) {
  const frameClass = ['ui-field', className].filter(Boolean).join(' ')
  const labelClass = labelHidden ? 'ui-field__label visually-hidden' : 'ui-field__label'
  return (
    <div className={frameClass} data-size={size} data-appearance={appearance} data-invalid={error ? '' : undefined}>
      {labelFor ? (
        <label id={ids.labelId} htmlFor={labelFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span id={ids.labelId} className={labelClass}>
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
        <p id={ids.errorId} className="ui-field__error" role="alert">
          <Icon name="error" size={14} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
