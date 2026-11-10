import { useEffect, useState, type KeyboardEvent } from 'react'
import { IconButton } from '../IconButton'
import { uiStrings } from '../strings'
import { describedBy, FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps } from './Field'
import { clamp, parseNumber, stepValue } from './number'
import './Field.css'

export interface NumberFieldProps extends FieldProps {
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Hides the − and + buttons (keys still step). */
  hideStepper?: boolean
  placeholder?: string
}

const format = (value: number | null) => (value === null ? '' : String(value))

/**
 * A number in a text input (inputmode decimal, accepts "2,5"). Commit-based: typing does not call onChange; blur, Enter,
 * the arrows and ± do. Values are clamped to min/max and the text is rewritten; invalid text reverts without a change.
 */
export function NumberField({ label, helper, error, disabled, required, name, value, onChange, min, max, step = 1, unit, hideStepper, placeholder }: NumberFieldProps) {
  const ids = useFieldIds()
  const [text, setText] = useState(format(value))
  useEffect(() => setText(format(value)), [value])

  const commit = (raw: string) => {
    const parsed = parseNumber(raw)
    if (parsed.kind === 'invalid') {
      setText(format(value))
      return
    }
    if (parsed.kind === 'empty') {
      setText('')
      if (value !== null) onChange(null)
      return
    }
    const next = clamp(parsed.value, min, max)
    setText(format(next))
    if (next !== value) onChange(next)
  }

  const nudge = (direction: 1 | -1) => {
    const next = stepValue(value ?? 0, direction, { step, min, max })
    setText(format(next))
    if (next !== value) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit(e.currentTarget.value)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      nudge(e.key === 'ArrowUp' ? 1 : -1)
    }
  }

  const inputId = `${ids.labelId}-input`
  return (
    <FieldFrame ids={ids} label={label} labelFor={inputId} helper={helper} error={error}>
      <span className="ui-field__control">
        {hideStepper ? null : (
          <IconButton icon="minus" label={uiStrings.decrease(label)} disabled={disabled || (min !== undefined && (value ?? 0) <= min)} onClick={() => nudge(-1)} />
        )}
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="decimal"
          role="spinbutton"
          className="ui-field__input ui-field__number"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, helper, error)}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value ?? undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        {unit ? <span className="ui-field__suffix">{unit}</span> : null}
        {hideStepper ? null : (
          <IconButton icon="add" label={uiStrings.increase(label)} disabled={disabled || (max !== undefined && (value ?? 0) >= max)} onClick={() => nudge(1)} />
        )}
      </span>
    </FieldFrame>
  )
}
