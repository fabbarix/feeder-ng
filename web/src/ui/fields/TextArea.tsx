import { useRef, type TextareaHTMLAttributes } from 'react'
import { useAutoGrow } from '../lib/useAutoGrow'
import { describedBy, FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps, FieldSizeProps } from './Field'
import './Field.css'

export interface TextAreaProps extends FieldProps, FieldSizeProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'name' | 'disabled' | 'required'> {
  value: string
  onChange: (value: string) => void
  /** Visible lines. Default 3. */
  rows?: number
  maxRows?: number
}

/** A multi-line text input in the shared field frame. */
export function TextArea({ size = 'full', label, helper, error, disabled, required, name, value, onChange, rows = 3, maxRows, id, 'aria-describedby': extraDescribedBy, ...rest }: TextAreaProps) {
  const ids = useFieldIds()
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(ref, value, { maxRows })
  const areaId = id ?? `${ids.labelId}-input`
  return (
    <FieldFrame ids={ids} size={size} label={label} labelFor={areaId} helper={helper} error={error}>
      <span className="ui-field__control">
        <textarea
          {...rest}
          ref={ref}
          id={areaId}
          name={name}
          rows={rows}
          className="ui-field__textarea"
          value={value}
          disabled={disabled}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, helper, error, extraDescribedBy)}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </FieldFrame>
  )
}
