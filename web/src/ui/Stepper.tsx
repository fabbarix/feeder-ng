import { uiStrings } from './strings'

export interface StepperProps {
  value: number
  onChange: (next: number) => void
  label: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

/** A − value + control for small whole-number amounts. Clamps to its bounds. */
export function Stepper({ value, onChange, label, min = 0, max, step = 1, unit }: StepperProps) {
  const upper = max ?? Number.POSITIVE_INFINITY
  const decreaseDisabled = value <= min
  const increaseDisabled = value >= upper
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__button"
        aria-label={uiStrings.decrease(label)}
        disabled={decreaseDisabled}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <span className="stepper__value">{value}</span>
      {unit ? <span className="stepper__unit">{unit}</span> : null}
      <button
        type="button"
        className="stepper__button"
        aria-label={uiStrings.increase(label)}
        disabled={increaseDisabled}
        onClick={() => onChange(Math.min(upper, value + step))}
      >
        +
      </button>
    </div>
  )
}
