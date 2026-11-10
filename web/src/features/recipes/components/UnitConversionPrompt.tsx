import { useState, type ReactNode } from 'react'
import { BottomSheet, Button, NumberField } from '../../../ui'
import { parseToBase, promptQuestion, type UnitPrompt } from '../lib/unitPrompt'
import { numberText } from '../lib/draft'
import { recipeStrings } from '../strings'

export interface UnitConversionPromptProps {
  prompt: UnitPrompt
  onSave: (toBase: number) => void
  onCancel: () => void
}

/**
 * The inline Unit Conversion prompt of the Recipe editor (a BottomSheet): the question from promptQuestion, one number
 * field "Amount in <base unit>", Save and Cancel. A value parseToBase rejects shows strings.unitConversion.invalid and
 * does not call onSave.
 */
export function UnitConversionPrompt({ prompt, onSave, onCancel }: UnitConversionPromptProps): ReactNode {
  const [value, setValue] = useState<number | null>(null)
  const [invalid, setInvalid] = useState(false)
  const c = recipeStrings.unitConversion

  const save = () => {
    const toBase = parseToBase(numberText(value))
    if (toBase === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onSave(toBase)
  }

  return (
    <BottomSheet open title={c.title} onClose={onCancel}>
      <p>{promptQuestion(prompt)}</p>
      <NumberField
        label={c.amount(prompt.baseUnit)}
        hideStepper
        value={value}
        error={invalid ? c.invalid : undefined}
        onChange={(n) => {
          setValue(n)
          setInvalid(false)
        }}
      />
      <div className="unit-prompt__actions">
        <Button onClick={save}>{c.save}</Button>
        <Button variant="tertiary" onClick={onCancel}>
          {c.cancel}
        </Button>
      </div>
    </BottomSheet>
  )
}
