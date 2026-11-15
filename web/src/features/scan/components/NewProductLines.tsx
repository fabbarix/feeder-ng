// "Which Line is it?" (SR5, 13.5 step 1): the open Lines as chips, "More Lines" past eight, and "Something else".
import { useId } from 'react'
import { ChoiceChip } from '../../../ui'
import type { UnitSystem } from '../../../lib/units'
import { lineChipAmount, type LineChip, type LineChips } from '../lib/lineChoice'
import { newProductStrings } from '../newProductStrings'
import './NewProductSheet.css'

export interface NewProductLinesProps {
  chips: LineChips
  /** the units of the amounts on the chips */
  system: UnitSystem
  expanded: boolean
  /** the hint under the heading (a weighed code: "Lines in grams are listed first.") */
  hint?: string
  onExpand: () => void
  onPick: (line: LineChip) => void
  onSomethingElse: () => void
}

export function NewProductLines({ chips, system, expanded, hint = newProductStrings.whichLineHint, onExpand, onPick, onSomethingElse }: NewProductLinesProps) {
  const labelId = useId()
  const shown = expanded ? [...chips.chips, ...chips.more] : chips.chips
  return (
    <div role="group" aria-labelledby={labelId} className="new-product__lines">
      {/* A11Y-07: the step's heading; a step change focuses it (tabIndex -1, no ring) */}
      <h3 id={labelId} className="new-product__label" tabIndex={-1} data-step-heading="">
        {newProductStrings.whichLine}
      </h3>
      <p className="new-product__hint">{hint}</p>
      <div className="new-product__chips">
        {shown.map((line) => (
          <ChoiceChip
            key={line.ingredientId}
            {...(line.imageUrl ? { thumb: { name: line.name, imageUrl: line.imageUrl } } : { icon: line.restock ? 'supply' : 'successOpen' })}
            note={line.restock ? newProductStrings.restock : lineChipAmount(line, system)}
            onClick={() => onPick(line)}
          >
            {line.name}
          </ChoiceChip>
        ))}
        {!expanded && chips.more.length > 0 ? (
          <ChoiceChip variant="quiet" onClick={onExpand}>
            {newProductStrings.moreLines}
          </ChoiceChip>
        ) : null}
        <ChoiceChip variant="outline" icon="search" onClick={onSomethingElse}>
          {newProductStrings.somethingElse}
        </ChoiceChip>
      </div>
    </div>
  )
}
