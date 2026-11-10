import { useEffect, useId, useRef } from 'react'
import { Icon } from '../Icon'
import './Checkbox.css'

export interface CheckboxProps {
  label: string
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
export function Checkbox({ label, description, checked, indeterminate = false, disabled, name, onChange }: CheckboxProps) {
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
        <span className="checkbox__label">{label}</span>
      </label>
      {description ? (
        <p id={descriptionId} className="checkbox__description">
          {description}
        </p>
      ) : null}
    </div>
  )
}
