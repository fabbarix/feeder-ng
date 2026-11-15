import { EditableStepper, type EditableStepperProps } from '../EditableStepper'
import { Stepper } from '../Stepper'
import { FieldFrame, describedBy, useFieldIds } from './FieldFrame'
import './Field.css'

interface StepperFieldBase {
  label: string
  helper?: string
  error?: string
  min?: number
  max?: number
  step?: number
  unit?: string
}

/** The step-only field: the value is a spinbutton you step with −, + and the arrow keys. */
export interface FixedStepperFieldProps extends StepperFieldBase {
  editable?: false
  value: number
  onChange: (next: number) => void
}

/**
 * B9-48 "type or step": the value is a text input you can type into, with − and + beside it (EditableStepper). It can be empty
 * (null), drawn as the placeholder.
 */
export interface EditableStepperFieldProps extends StepperFieldBase, Pick<EditableStepperProps, 'start' | 'placeholder' | 'nullable' | 'decimal' | 'inputRef' | 'name'> {
  editable: true
  value: number | null
  onChange: (next: number | null) => void
}

export type StepperFieldProps = FixedStepperFieldProps | EditableStepperFieldProps

/** A Stepper with a visible label and helper line, both associated with the control. */
export function StepperField(props: StepperFieldProps) {
  const { label, helper, error, min, max, step, unit } = props
  const ids = useFieldIds()
  const described = describedBy(ids, helper, error)
  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      {props.editable ? (
        <EditableStepper
          label={label}
          value={props.value}
          onChange={props.onChange}
          min={min}
          max={max}
          step={step}
          unit={unit}
          start={props.start}
          placeholder={props.placeholder}
          nullable={props.nullable}
          decimal={props.decimal}
          inputRef={props.inputRef}
          name={props.name}
          describedBy={described}
          invalid={Boolean(error)}
        />
      ) : (
        <Stepper
          label={label}
          value={props.value}
          onChange={props.onChange}
          min={min}
          max={max}
          step={step}
          unit={unit}
          describedBy={described}
          invalid={Boolean(error)}
        />
      )}
    </FieldFrame>
  )
}
