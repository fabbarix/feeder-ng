// Pack size (SR5, 13.5 step 3): chips of the Ingredient's usual sizes and common sizes, then Other (a number and a unit).
import { useId } from 'react'
import { ChoiceChip, NumberField, UnitSelect } from '../../../ui'
import type { PackChip } from '../lib/packChips'
import { numberText, numberValue, unitChoices, type PackSelection } from '../lib/newProductSelect'
import { newProductStrings } from '../newProductStrings'
import type { BaseUnit } from '../types'
import './NewProductSheet.css'

export interface NewProductPackProps {
  chips: PackChip[]
  pack: PackSelection
  base: BaseUnit
  /** 'pick': no size yet; 'positive': the Other size is not a number above 0 */
  error?: 'pick' | 'positive'
  onPick: (chip: PackChip) => void
  onOther: () => void
  onSize: (size: string) => void
  onUnit: (unit: string) => void
}

export function NewProductPack({ chips, pack, base, error, onPick, onOther, onSize, onUnit }: NewProductPackProps) {
  const labelId = useId()
  const hintId = useId()
  const pickHint = error === 'pick'
  return (
    <div className="new-product__pack">
      <span id={labelId} className="new-product__label">
        {newProductStrings.packSize}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={pickHint ? hintId : undefined}
        aria-invalid={pickHint || undefined}
        tabIndex={-1}
        className="new-product__chips"
      >
        {chips.map((chip) => (
          <ChoiceChip key={chip.key} pressed={pack.key === chip.key} onClick={() => onPick(chip)}>
            {chip.label}
          </ChoiceChip>
        ))}
        <ChoiceChip pressed={pack.other} onClick={onOther}>
          {newProductStrings.packOther}
        </ChoiceChip>
      </div>
      {pickHint ? (
        <p id={hintId} className="new-product__hint">
          {newProductStrings.needPack}
        </p>
      ) : null}
      {pack.other ? (
        <div className="new-product__other">
          <NumberField
            label={newProductStrings.packOtherLabel}
            value={numberValue(pack.size)}
            onChange={(n) => onSize(numberText(n))}
            error={error === 'positive' ? newProductStrings.mustBePositive : undefined}
          />
          <UnitSelect label={newProductStrings.packUnit} units={unitChoices(base)} value={pack.unit} onChange={onUnit} />
        </div>
      ) : null}
    </div>
  )
}
