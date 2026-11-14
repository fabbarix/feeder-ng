// Beta.8 (scan): "What it is" on the new-Product sheet: the label, then a radiogroup of two picture chips, Ingredient and
// Supply (shop-scan-proposals.md 13.5). A chip is a real button with role radio, aria-checked and a roving tab stop; the arrow
// keys move and choose. Render only.
import { useId } from 'react'
import { Icon } from '../../../ui/Icon'
import type { IconName } from '../../../ui/icons'
import { useRovingRadios } from '../../../ui/fields/useRovingRadios'
import '../../../ui/ChoiceChip.css'
import type { IngredientKind } from '../../ingredients/types'
import { newProductStrings } from '../newProductStrings'

const KINDS: { value: IngredientKind; label: string; icon: IconName }[] = [
  { value: 'food', label: newProductStrings.kindIngredient, icon: 'ingredients' },
  { value: 'supply', label: newProductStrings.kindSupply, icon: 'supply' },
]

export interface KindChipsProps {
  kind: IngredientKind
  onKind: (kind: IngredientKind) => void
}

export function KindChips({ kind, onKind }: KindChipsProps) {
  const labelId = useId()
  const roving = useRovingRadios(
    KINDS.map((k) => ({ value: k.value })),
    kind,
    onKind,
  )
  return (
    <>
      <p id={labelId} className="new-product__label">
        {newProductStrings.kindLabel}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="new-product__chips">
        {KINDS.map((k) => (
          <button
            key={k.value}
            ref={roving.register(k.value)}
            type="button"
            role="radio"
            aria-checked={k.value === kind}
            tabIndex={k.value === roving.tabStop ? 0 : -1}
            className="choice-chip new-product__kind-chip"
            onClick={() => onKind(k.value)}
            onKeyDown={(e) => roving.onKeyDown(e, k.value)}
          >
            <span className="choice-chip__lead" aria-hidden="true">
              <Icon name={k.icon} size={20} />
            </span>
            <span className="choice-chip__label">{k.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
