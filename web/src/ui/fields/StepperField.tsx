import { Stepper } from '../Stepper'
import { FieldFrame, describedBy, useFieldIds } from './FieldFrame'
import './Field.css'

export interface StepperFieldProps {
  label: string
  helper?: string
  error?: string
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
}

/** A Stepper with a visible label and helper line, both associated with the control. */
export function StepperField({ label, helper, error, value, onChange, min, max, step, unit }: StepperFieldProps) {
  const ids = useFieldIds()
  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <Stepper
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        unit={unit}
        describedBy={describedBy(ids, helper, error)}
      />
    </FieldFrame>
  )
}
