import { FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps } from './Field'
import { useRovingRadios } from './useRovingRadios'
import './Field.css'
import './RadioCards.css'

export interface RadioCard<V extends string> {
  value: V
  title: string
  description?: string
  disabled?: boolean
}

export interface RadioCardsProps<V extends string> extends Omit<FieldProps, 'name'> {
  options: RadioCard<V>[]
  value: V
  onChange: (value: V) => void
}

/** Two to four choices, each with a short explanation (Metric · Imperial). Same radio semantics as Segmented. */
export function RadioCards<V extends string>({ label, helper, error, disabled, options, value, onChange }: RadioCardsProps<V>) {
  const ids = useFieldIds()
  const roving = useRovingRadios(options.map((o) => ({ value: o.value, disabled: disabled || o.disabled })), value, onChange)
  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <div role="radiogroup" aria-labelledby={ids.labelId} aria-describedby={helper ? ids.helperId : undefined} className="radio-cards">
        {options.map((option) => {
          const checked = option.value === value
          return (
            <button
              key={option.value}
              ref={roving.register(option.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={option.value === roving.tabStop ? 0 : -1}
              disabled={disabled || option.disabled}
              className="radio-card"
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => roving.onKeyDown(e, option.value)}
            >
              <span className="radio-card__mark" aria-hidden="true" />
              <span className="radio-card__text">
                <span className="radio-card__title">{option.title}</span>
                {option.description ? <span className="radio-card__description">{option.description}</span> : null}
              </span>
            </button>
          )
        })}
      </div>
    </FieldFrame>
  )
}
