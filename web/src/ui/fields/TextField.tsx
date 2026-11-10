import type { InputHTMLAttributes } from 'react'
import { describedBy, FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps } from './Field'
import './Field.css'

export interface TextFieldProps extends FieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'name' | 'disabled' | 'required' | 'size'> {
  value: string
  /** Called on every keystroke with the new text. */
  onChange: (value: string) => void
  /** Unit or hint shown at the end of the control, e.g. "min". */
  suffix?: string
}

/** A single-line text input in the shared field frame. Controlled: onChange(value) per keystroke. */
export function TextField({ label, helper, error, disabled, required, name, value, onChange, suffix, type = 'text', id, ...rest }: TextFieldProps) {
  const ids = useFieldIds()
  const inputId = id ?? `${ids.labelId}-input`
  return (
    <FieldFrame ids={ids} label={label} labelFor={inputId} helper={helper} error={error}>
      <span className="ui-field__control">
        <input
          {...rest}
          id={inputId}
          name={name}
          type={type}
          className="ui-field__input"
          value={value}
          disabled={disabled}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, helper, error)}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix ? <span className="ui-field__suffix">{suffix}</span> : null}
      </span>
    </FieldFrame>
  )
}

