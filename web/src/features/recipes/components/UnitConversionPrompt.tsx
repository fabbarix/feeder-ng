import { useState, type ReactNode } from 'react'
import { BottomSheet, Button } from '../../../ui'
import { parseToBase, promptQuestion, type UnitPrompt } from '../lib/unitPrompt'
import { recipeStrings } from '../strings'

export interface UnitConversionPromptProps {
  prompt: UnitPrompt
  onSave: (toBase: number) => void
  onCancel: () => void
}

/**
 * The inline Unit Conversion prompt of the Recipe editor (a ui/BottomSheet): the question from
 * promptQuestion, one number field labelled "Amount in <base unit>", Save and Cancel. A value
 * parseToBase rejects shows strings.unitConversion.invalid and does not call onSave.
 */
export function UnitConversionPrompt({ prompt, onSave, onCancel }: UnitConversionPromptProps): ReactNode {
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const label = `Amount in ${prompt.baseUnit}`

  const save = () => {
    const toBase = parseToBase(text)
    if (toBase === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSave(toBase)
  }

  return (
    <BottomSheet open title={recipeStrings.unitConversion.title} onClose={onCancel}>
      <p>{promptQuestion(prompt)}</p>
      <label>
        {label}
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={invalid || undefined}
        />
      </label>
      {invalid ? <p role="alert">{recipeStrings.unitConversion.invalid}</p> : null}
      <div>
        <Button onClick={save}>{recipeStrings.unitConversion.save}</Button>
        <Button variant="ghost" onClick={onCancel}>
          {recipeStrings.unitConversion.cancel}
        </Button>
      </div>
    </BottomSheet>
  )
}
