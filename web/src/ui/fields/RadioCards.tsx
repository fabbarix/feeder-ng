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

export interface RadioCardsProps<V extends string> extends Omit<FieldProps, 'name' | 'label'> {
  /** The group's visible label (a FieldFrame). Not needed with `bare`. */
  label?: string
  options: RadioCard<V>[]
  /** The checked option; null = nothing checked (the first enabled option is the tab stop). */
  value: V | null
  onChange: (value: V) => void
  /** Names the group from another element (its id). */
  labelledBy?: string
  /** Describes the group by other elements (ids, space separated), e.g. the Problems it answers. */
  describedBy?: string
  /** No FieldFrame: the radiogroup is the root element, and it has no label or helper of its own. */
  bare?: boolean
  /** `auto` (default): an arrow chooses. `manual`: arrows only move the focus; Space, Enter or a click chooses. */
  activation?: 'auto' | 'manual'
}

/** Two to four choices, each with a short explanation (Metric · Imperial). Same radio semantics as Segmented. */
export function RadioCards<V extends string>({ label, helper, error, disabled, options, value, onChange, labelledBy, describedBy, bare, activation = 'auto' }: RadioCardsProps<V>) {
  const ids = useFieldIds()
  const roving = useRovingRadios(
    options.map((o) => ({ value: o.value, disabled: disabled || o.disabled })),
    value,
    onChange,
    activation,
  )
  const group = (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy ?? (bare ? undefined : ids.labelId)}
      aria-describedby={describedBy ?? (helper && !bare ? ids.helperId : undefined)}
      className="radio-cards"
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
  )
  if (bare) return group
  return (
    <FieldFrame ids={ids} label={label ?? ''} helper={helper} error={error}>
      {group}
    </FieldFrame>
  )
}
