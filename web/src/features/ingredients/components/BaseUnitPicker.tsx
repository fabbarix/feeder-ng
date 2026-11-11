import { useId } from 'react'
import { Icon } from '../../../ui'
import { useRovingRadios } from '../../../ui/fields/useRovingRadios'
import type { BaseUnit } from '../../../lib/units'
import { baseUnitIcon } from '../lib/newIngredient'
import { strings } from '../strings'
import '../ingredients.css'

export const BASE_UNITS: readonly BaseUnit[] = ['g', 'ml', 'piece']

export interface BaseUnitPickerProps {
  value: BaseUnit
  onChange: (unit: BaseUnit) => void
  disabled?: boolean
}

/**
 * The Base Unit as a radiogroup of three big options, each with its glyph; the chosen one is filled and carries a check, so the
 * state never rests on colour alone. Same anatomy as the Segmented field (label above, helper below); it lives here only because
 * Segmented has no per-option icon yet.
 */
export function BaseUnitPicker({ value, onChange, disabled }: BaseUnitPickerProps) {
  const base = useId()
  const labelId = `${base}-label`
  const helperId = `${base}-helper`
  const roving = useRovingRadios(BASE_UNITS.map((v) => ({ value: v, disabled })), value, onChange)
  return (
    <div className="new-ingredient__section">
      <span id={labelId} className="new-ingredient__label">
        {strings.baseUnitLabel}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={helperId} className="new-ingredient__options">
        {BASE_UNITS.map((unit) => {
          const checked = unit === value
          return (
            <button
              key={unit}
              ref={roving.register(unit)}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={unit === roving.tabStop ? 0 : -1}
              disabled={disabled}
              className="new-ingredient__unit"
              onClick={() => onChange(unit)}
              onKeyDown={(e) => roving.onKeyDown(e, unit)}
            >
              <Icon name={baseUnitIcon(unit)} size={20} />
              {strings.sheet.baseUnitOptions[unit]}
              {checked ? <Icon name="tick" size={16} weight="bold" /> : null}
            </button>
          )
        })}
      </div>
      <p id={helperId} className="new-ingredient__helper">
        {strings.sheet.baseUnitHelper}
      </p>
    </div>
  )
}
