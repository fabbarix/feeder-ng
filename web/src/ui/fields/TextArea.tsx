import type { TextareaHTMLAttributes } from 'react'
import { describedBy, FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps, FieldSizeProps } from './Field'
import './Field.css'

export interface TextAreaProps extends FieldProps, FieldSizeProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'name' | 'disabled' | 'required'> {
  value: string
  onChange: (value: string) => void
  /** Visible lines. Default 3. */
  rows?: number
}

/** A multi-line text input in the shared field frame. */
export function TextArea({ label, helper, error, disabled, required, name, value, onChange, rows = 3, id, ...rest }: TextAreaProps) {
  const ids = useFieldIds()
  const areaId = id ?? `${ids.labelId}-input`
  return (
    <FieldFrame ids={ids} label={label} labelFor={areaId} helper={helper} error={error}>
      <span className="ui-field__control">
        <textarea
          {...rest}
          id={areaId}
          name={name}
          rows={rows}
          className="ui-field__textarea"
          value={value}
          disabled={disabled}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, helper, error)}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </FieldFrame>
  )
}
