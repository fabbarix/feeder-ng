import { useId } from 'react'
import { formatQuantity, type BaseUnit, type UnitSystem } from '../../../lib/units'
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
  label: string
  value: number | null
}

/**
 * One radio group per conflict. A conversion conflict is titled strings.mergeConflictConversion(unit)
 * with two options "Keep <formatQuantity of source>" and "Keep <… of target>" (equal values are not conflicts).
 * The Shelf Life conflict offers "Keep N days" for both sides plus "Keep no Shelf Life" (answer null).
 * Nothing is preselected.
 */
export function MergeConflictList({ conflicts, base, system, answers, onAnswer }: MergeConflictListProps) {
  const groupPrefix = useId()
  return (
    <div>
      {conflicts.map((c) => {
        const key = conflictKey(c)
        const options: Option[] =
          c.kind === 'conversion'
            ? [
                { label: strings.mergeKeep(formatQuantity(c.source, base, system)), value: c.source },
                { label: strings.mergeKeep(formatQuantity(c.target, base, system)), value: c.target },
              ]
            : [
                { label: strings.mergeKeep(strings.shelfLife(c.source)), value: c.source },
                { label: strings.mergeKeep(strings.shelfLife(c.target)), value: c.target },
                { label: strings.mergeKeepNoShelfLife, value: null },
              ]
        const title = c.kind === 'conversion' ? strings.mergeConflictConversion(c.unit) : strings.mergeConflictShelfLife
        return (
          <fieldset key={key}>
            <legend>{title}</legend>
            {options.map((o) => (
              <label key={String(o.value)}>
                <input
                  type="radio"
                  name={`${groupPrefix}-${key}`}
                  checked={answers[key] === o.value}
                  onChange={() => onAnswer(key, o.value)}
                />{' '}
                {o.label}
              </label>
            ))}
          </fieldset>
        )
      })}
    </div>
  )
}
