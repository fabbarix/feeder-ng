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
  /**
   * B9-48 (SET-05): inside a Keeping row the row draws the label and the hint; the picker is then only the radiogroup, named and
   * described by the row's ids.
   */
  bare?: { labelledBy: string; describedBy?: string }
}

/**
 * The Base Unit as a radiogroup of three big options, each with its glyph; the chosen one is filled and carries a check, so the
 * state never rests on colour alone. Same anatomy as the Segmented field (label above, helper below); it lives here only because
 * Segmented has no per-option icon yet.
 */
export function BaseUnitPicker({ value, onChange, disabled, bare }: BaseUnitPickerProps) {
  const base = useId()
  const labelId = `${base}-label`
  const helperId = `${base}-helper`
  const roving = useRovingRadios(BASE_UNITS.map((v) => ({ value: v, disabled })), value, onChange)
  const group = (
      <div
        role="radiogroup"
        aria-labelledby={bare ? bare.labelledBy : labelId}
        aria-describedby={bare ? bare.describedBy : helperId}
        className="base-unit__options"
      >
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
              className="base-unit__option"
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
  )
  if (bare) return group
  return (
    <div className="base-unit">
      <span id={labelId} className="base-unit__label">
        {strings.baseUnitLabel}
      </span>
      {group}
      <p id={helperId} className="base-unit__helper">
        {strings.sheet.baseUnitHelper}
      </p>
    </div>
  )
}
