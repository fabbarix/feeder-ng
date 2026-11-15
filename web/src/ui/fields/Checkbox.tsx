import { useEffect, useId, useRef } from 'react'
import { Icon } from '../Icon'
import './Checkbox.css'

export interface CheckboxProps {
  /**
   * The visible label. Absent: the Checkbox draws only its box, and the caller names it with its own `<label htmlFor={id}>`
   * (a list row whose name sits elsewhere in the row, B9-42 Attendance).
   */
  label?: string
  /** The input's id, for a `<label htmlFor>` outside the Checkbox. */
  id?: string
  /** Second line under the label, muted; described to assistive tech. */
  description?: string
  checked: boolean
  /** Mixed state (a parent over some children checked). */
  indeterminate?: boolean
  disabled?: boolean
  name?: string
  onChange: (checked: boolean) => void
}

/** A 22 px checkbox: the native input is visually replaced by .checkbox__box with a Check (or Minus when mixed). */
export function Checkbox({ label, id: inputId, description, checked, indeterminate = false, disabled, name, onChange }: CheckboxProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate
  }, [indeterminate])
  const descriptionId = `${id}-description`
  return (
    <div className="checkbox" data-disabled={disabled || undefined}>
      <label className="checkbox__control">
        <input
          ref={input}
          id={inputId}
          type="checkbox"
          className="checkbox__input"
          name={name}
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? descriptionId : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="checkbox__box" data-state={indeterminate ? 'mixed' : checked ? 'checked' : 'unchecked'} aria-hidden="true">
          {indeterminate ? <Icon name="minus" size={16} /> : checked ? <Icon name="tick" size={16} /> : null}
        </span>
        {label ? <span className="checkbox__label">{label}</span> : null}
      </label>
      {description ? (
        <p id={descriptionId} className="checkbox__description">
          {description}
        </p>
      ) : null}
    </div>
  )
}
