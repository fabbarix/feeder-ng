import { formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
import { RadioCards } from '../../../ui'
import { conflictKey, type Answers } from '../lib/mergeResolution'
import { strings } from '../strings'
import type { Conflict } from '../types'

export interface MergeConflictListProps {
  conflicts: readonly Conflict[]
  base: BaseUnit
  system: UnitSystem
  answers: Answers
  onAnswer: (key: string, value: number | null) => void
}

interface Option {
  /** Roving value of the RadioCards option. */
  id: string
  label: string
  value: number | null
}

/**
 * One RadioCards group per conflict. A conversion conflict is titled strings.mergeConflictConversion(unit)
 * with two options "Keep <formatQuantity of source>" and "Keep <… of target>" (equal values are not conflicts).
 * The Shelf Life conflict offers "Keep N days" for both sides plus "Keep no Shelf Life" (answer null).
 * Nothing is preselected.
 */
export function MergeConflictList({ conflicts, base, system, answers, onAnswer }: MergeConflictListProps) {
  return (
    <div>
      {conflicts.map((c) => {
        const key = conflictKey(c)
        const options: Option[] =
          c.kind === 'conversion'
            ? [
                { id: 'source', label: strings.mergeKeep(formatQuantity(c.source, base, system)), value: c.source },
                { id: 'target', label: strings.mergeKeep(formatQuantity(c.target, base, system)), value: c.target },
              ]
            : [
                { id: 'source', label: strings.mergeKeep(strings.shelfLife(c.source)), value: c.source },
                { id: 'target', label: strings.mergeKeep(strings.shelfLife(c.target)), value: c.target },
                { id: 'none', label: strings.mergeKeepNoShelfLife, value: null },
              ]
        const title = c.kind === 'conversion' ? strings.mergeConflictConversion(c.unit) : strings.mergeConflictShelfLife
        const chosen = options.find((o) => answers[key] === o.value)
        return (
          <RadioCards
            key={key}
            label={title}
            options={options.map((o) => ({ value: o.id, title: o.label }))}
            value={chosen?.id ?? ''}
            onChange={(id) => onAnswer(key, options.find((o) => o.id === id)?.value ?? null)}
          />
        )
      })}
    </div>
  )
}
