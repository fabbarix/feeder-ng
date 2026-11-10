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
  /** 'sm' is the compact group (40 px buttons, never stretched). Type-only until the Developer step. */
  size?: 'md' | 'sm'
}

/** A − value + control for small amounts. Accessible: a group named by `label`, the value is a spinbutton (arrows, Home, End). */
export function Stepper({ value, onChange, label, min = 0, max, step = 1, unit, describedBy }: StepperProps) {
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
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="stepper">
      <IconButton
        icon="minus"
        label={uiStrings.decrease(label)}
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
        className="stepper__value"
        onKeyDown={onKeyDown}
      >
        {String(value)}
      </span>
      {unit ? <span className="stepper__unit">{unit}</span> : null}
      <IconButton
        icon="add"
        label={uiStrings.increase(label)}
        disabled={max !== undefined && value >= max}
        onClick={() => move(stepValue(value, 1, bounds))}
      />
    </div>
  )
}
