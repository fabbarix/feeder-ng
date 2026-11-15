import type { KeyboardEvent } from 'react'
import { IconButton } from './IconButton'
import { stepValue } from './lib/stepValue'
import { uiStrings } from './strings'
import './Stepper.css'

export interface StepperProps {
  value: number
  onChange: (next: number) => void
  label: string
  min?: number
  max?: number
  step?: number
  unit?: string
  /** The id(s) of the helper/error line that describes the control. */
  describedBy?: string
  /**
   * 'sm' is the compact group (40 px buttons, never stretched). 'xs' is the smallest: 32 px outline buttons (44 px to hit) and a
   * regular-weight count, for a control inside a list row. 'lg' (Cook Mode, Reheat) is 56 px circular buttons round a large value
   * that takes the rest of the width.
   */
  size?: 'md' | 'sm' | 'xs' | 'lg'
  /** Sets aria-invalid on the value (a StepperField with an error). */
  invalid?: boolean
  /** The − and + names when "Decrease <label>" does not say it ("Remove 30 seconds"). */
  decreaseLabel?: string
  increaseLabel?: string
  /** The shown value and its aria-valuetext ("4:00"); aria-valuenow stays the number. */
  format?: (n: number) => string
}

/** A − value + control for small amounts. Accessible: a group named by `label`, the value is a spinbutton (arrows, Home, End). */
export function Stepper({ value, onChange, label, min = 0, max, step = 1, unit, describedBy, size = 'md', invalid, decreaseLabel, increaseLabel, format }: StepperProps) {
  const bounds = { step, min, max }
  const move = (next: number) => {
    if (next !== value) onChange(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(stepValue(value, e.key === 'ArrowUp' ? 1 : -1, bounds))
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(min)
    } else if (e.key === 'End' && max !== undefined) {
      e.preventDefault()
      move(max)
    }
  }
  const shown = format ? format(value) : String(value)
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="stepper" data-size={size}>
      <IconButton
        icon="minus"
        label={decreaseLabel ?? uiStrings.decrease(label)}
        size={size === 'xs' ? 'compact' : 'md'}
        disabled={value <= min}
        onClick={() => move(stepValue(value, -1, bounds))}
      />
      <span
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-describedby={describedBy}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format ? shown : undefined}
        aria-invalid={invalid ? true : undefined}
        className="stepper__value"
        onKeyDown={onKeyDown}
      >
        {shown}
      </span>
      {unit ? <span className="stepper__unit">{unit}</span> : null}
      <IconButton
        icon="add"
        label={increaseLabel ?? uiStrings.increase(label)}
        size={size === 'xs' ? 'compact' : 'md'}
        disabled={max !== undefined && value >= max}
        onClick={() => move(stepValue(value, 1, bounds))}
      />
    </div>
  )
}
