import { useState, type ReactNode } from 'react'
import { Button, NumberField, Tile } from '../../../ui'
import { parseToBase } from '../lib/decisions'
import { importStrings as s } from '../strings'
import type { UnitPrompt } from '../types'

export interface UnitPromptTileProps {
  prompt: UnitPrompt
  onAnswer: (toBase: number) => void
}

const text = (n: number | null) => (n === null ? '' : String(n))

/**
 * importStrings.unitPrompt(unit, ingredient) with a number field labelled importStrings.unitAmountLabel(base) and a Save
 * button. A value lib/decisions.parseToBase rejects shows importStrings.conversionInvalid as the field's error and keeps
 * Save disabled. An answered prompt shows its value ("= 30 g") and keeps the field editable.
 */
export function UnitPromptTile({ prompt, onAnswer }: UnitPromptTileProps): ReactNode {
  const [value, setValue] = useState<number | null>(null)
  const toBase = parseToBase(text(value))
  const invalid = value !== null && toBase === null
  return (
    <Tile as="section">
      <p>{s.unitPrompt(prompt.unit, prompt.ingredient)}</p>
      <NumberField
        label={s.unitAmountLabel(prompt.base)}
        hideStepper
        value={value}
        error={invalid ? s.conversionInvalid : undefined}
        onChange={setValue}
      />
      <Button variant="secondary" disabled={toBase === null} onClick={() => toBase !== null && onAnswer(toBase)}>
        {s.saveConversion}
      </Button>
      {prompt.answered && prompt.toBase !== undefined ? <p>= {prompt.toBase} {prompt.base}</p> : null}
    </Tile>
  )
}
