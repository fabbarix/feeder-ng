import { useId, type ReactNode } from 'react'
import { useRovingRadios } from '../../../ui/fields/useRovingRadios'

export interface ReadSourceOption<V extends string> {
  value: V
  label: string
  disabled?: boolean
  /** The id of the element that says why it is disabled; the option's accessible description. */
  describedBy?: string
}

export interface ReadSourceChoiceProps<V extends string> {
  label: string
  options: ReadSourceOption<V>[]
  value: V
  onChange: (value: V) => void
  disabled?: boolean
}

/**
 * The input choice of "Read a recipe" (Web page · Text · Photo): a radiogroup with roving tabindex, like Segmented. It lives here only
 * because Segmented cannot describe one disabled option ("This model can't read photos.") to a screen reader.
 */
export function ReadSourceChoice<V extends string>({ label, options, value, onChange, disabled }: ReadSourceChoiceProps<V>): ReactNode {
  const base = useId()
  const labelId = `${base}-label`
  const roving = useRovingRadios(options.map((o) => ({ value: o.value, disabled: disabled || o.disabled })), value, onChange)
  return (
    <div className="read-source">
      <span id={labelId} className="read-source__label">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="read-source__options" data-disabled={disabled || undefined}>
        {options.map((o) => (
          <button
            key={o.value}
            ref={roving.register(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-describedby={o.describedBy}
            tabIndex={o.value === roving.tabStop ? 0 : -1}
            disabled={disabled || o.disabled}
            className="read-source__option"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => roving.onKeyDown(e, o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
