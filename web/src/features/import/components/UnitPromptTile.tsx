import { useId, useState, type ReactNode } from 'react'
import { Button, Tile } from '../../../ui'
import { parseToBase } from '../lib/decisions'
import { importStrings as s } from '../strings'
import type { UnitPrompt } from '../types'

export interface UnitPromptTileProps {
  prompt: UnitPrompt
  onAnswer: (toBase: number) => void
}

/**
 * importStrings.unitPrompt(unit, ingredient) with a number field labelled importStrings.unitAmountLabel(base) and a Save button.
 * Typed text goes through lib/decisions.parseToBase: invalid input shows importStrings.conversionInvalid and keeps Save disabled.
 * An answered prompt shows its value ("= 30 g") and keeps the field editable.
 */
export function UnitPromptTile({ prompt, onAnswer }: UnitPromptTileProps): ReactNode {
  const [text, setText] = useState('')
  const inputId = useId()
  const value = parseToBase(text)
  const invalid = text.trim() !== '' && value === null
  return (
    <Tile as="section">
      <p>{s.unitPrompt(prompt.unit, prompt.ingredient)}</p>
      <label htmlFor={inputId}>{s.unitAmountLabel(prompt.base)}</label>
      <input id={inputId} type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      {invalid ? <p role="note">{s.conversionInvalid}</p> : null}
      <Button variant="tonal" disabled={value === null} onClick={() => value !== null && onAnswer(value)}>
        {s.saveConversion}
      </Button>
      {prompt.answered && prompt.toBase !== undefined ? <p>= {prompt.toBase} {prompt.base}</p> : null}
    </Tile>
  )
}
