// "Which Line is it?" (SR5, 13.5 step 1): the open Lines as chips, "More Lines" past eight, and "Something else".
import { useId } from 'react'
import { Icon, Thumb } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { lineChipAmount, type LineChip, type LineChips } from '../lib/lineChoice'
import { newProductStrings } from '../newProductStrings'
import './NewProductSheet.css'

export interface NewProductLinesProps {
  chips: LineChips
  /** the units of the amounts on the chips */
  system: UnitSystem
  expanded: boolean
  onExpand: () => void
  onPick: (line: LineChip) => void
  onSomethingElse: () => void
}

export function NewProductLines({ chips, system, expanded, onExpand, onPick, onSomethingElse }: NewProductLinesProps) {
  const labelId = useId()
  const shown = expanded ? [...chips.chips, ...chips.more] : chips.chips
  return (
    <div role="group" aria-labelledby={labelId} className="new-product__lines">
      <p id={labelId} className="new-product__label">
        {newProductStrings.whichLine}
      </p>
      <p className="new-product__hint">{newProductStrings.whichLineHint}</p>
      <div className="new-product__chips">
        {shown.map((line) => (
          <button key={line.ingredientId} type="button" className="new-product__chip" onClick={() => onPick(line)}>
            {line.imageUrl ? <Thumb name={line.name} imageUrl={line.imageUrl} size={40} /> : null}
            <span>{line.name}</span>
            <span className="new-product__chip-tag">{line.restock ? newProductStrings.restock : lineChipAmount(line, system)}</span>
          </button>
        ))}
        {!expanded && chips.more.length > 0 ? (
          <button type="button" className="new-product__chip new-product__chip--quiet" onClick={onExpand}>
            {newProductStrings.moreLines}
          </button>
        ) : null}
        <button type="button" className="new-product__chip new-product__chip--outline" onClick={onSomethingElse}>
          <Icon name="search" />
          {newProductStrings.somethingElse}
        </button>
      </div>
    </div>
  )
}
