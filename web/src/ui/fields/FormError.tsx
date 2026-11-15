import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import './Field.css'

export interface FormErrorProps {
  /** So an action bar can point at it with aria-describedby. */
  id?: string
  children?: ReactNode
}

/**
 * The form's one live error (SAFE-04): a server or save error that belongs to no field. It is the only role="alert" in a form;
 * a field's own error is a plain line in its frame, reached by focusFirstInvalid.
 */
export function FormError({ id, children }: FormErrorProps) {
  if (children === null || children === undefined || children === false || children === '') return null
  return (
    <p id={id} role="alert" className="ui-field__error form-error">
      <Icon name="error" size={14} />
      <span>{children}</span>
    </p>
  )
}
