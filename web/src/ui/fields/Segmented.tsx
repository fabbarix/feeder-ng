import { useFieldIds, FieldFrame, describedBy } from './FieldFrame'
import { Icon } from '../Icon'
import type { FieldProps, FieldSizeProps } from './Field'
import { useRovingRadios } from './useRovingRadios'
import './Field.css'
import './Segmented.css'

export interface SegmentedOption<V extends string> {
  value: V
  label: string
  disabled?: boolean
  /** The id of the element that says why the option is off; becomes the radio's aria-describedby. */
  describedBy?: string
  /** B9-37: the radio's accessible name when the visible label is shortened ("Advance" named "Advance Step"). */
  ariaLabel?: string
}

export interface SegmentedProps<V extends string> extends Omit<FieldProps, 'name'>, FieldSizeProps {
  options: SegmentedOption<V>[]
  value: V
  onChange: (value: V) => void
  /** The label stays the group's name, visually hidden (hf-recipes-filter: a toolbar's "Kind"). */
  labelHidden?: boolean
  /** Sized by its options (max-content), for a toolbar row; the options do not stretch. */
  compact?: boolean
}

/** Two to four short choices in one row (Light · Dark · System). A radiogroup with roving tabindex. */
export function Segmented<V extends string>({ size, label, helper, error, disabled, options, value, onChange, labelHidden, compact }: SegmentedProps<V>) {
  const ids = useFieldIds()
  const roving = useRovingRadios(options.map((o) => ({ value: o.value, disabled: disabled || o.disabled })), value, onChange)
  return (
    <FieldFrame ids={ids} size={size} label={label} helper={helper} error={error} labelHidden={labelHidden}>
      <div
        role="radiogroup"
        aria-labelledby={ids.labelId}
        aria-describedby={describedBy(ids, helper, error)}
        aria-invalid={error ? true : undefined}
        className="segmented"
        data-disabled={disabled || undefined}
        data-compact={compact || undefined}
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <button
              key={option.value}
              ref={roving.register(option.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.ariaLabel}
              aria-describedby={option.describedBy}
              tabIndex={option.value === roving.tabStop ? 0 : -1}
              disabled={disabled || option.disabled}
              className="segmented__option"
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => roving.onKeyDown(e, option.value)}
            >
              {checked && !compact ? <Icon name="selected" size={16} weight="bold" className="segmented__check" /> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    </FieldFrame>
  )
}
