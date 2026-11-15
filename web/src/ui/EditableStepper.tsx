import { useEffect, useState, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'
import { IconButton } from './IconButton'
import { parseNumber } from './fields/number'
import { stepValue } from './lib/stepValue'
import { uiStrings } from './strings'
import './Stepper.css'

export interface EditableStepperProps {
  /** null = empty ("Not set"): the placeholder shows, Decrease is off and Increase gives `start`. */
  value: number | null
  /**
   * Every keystroke that leaves a number (or nothing) reports it; the value is not clamped, so a typed 0 or 5000 reaches the form's
   * own check and is reported at the field. − and + stay inside min and max.
   */
  onChange: (next: number | null) => void
  label: string
  /** The smallest value − reaches; − from it empties the control when `nullable`. Default 0. */
  min?: number
  max?: number
  step?: number
  /** What Increase gives from empty. Default `min` when it is above 0, else `step`. */
  start?: number
  unit?: string
  /** Shown while empty, and the spinbutton's aria-valuetext then ("Not set"). */
  placeholder?: string
  /** Default true: − from `min` empties the control. */
  nullable?: boolean
  /** Accepts a decimal point or comma (inputmode decimal); otherwise whole numbers only (inputmode numeric). */
  decimal?: boolean
  describedBy?: string
  invalid?: boolean
  size?: 'md' | 'sm'
  inputRef?: Ref<HTMLInputElement>
  /** The input's name (a form finds the field to focus by it). */
  name?: string
  /** Enter in the input (the input sits in a form: Enter submits it anyway); for callers outside a form. */
  onEnter?: () => void
}

const shown = (value: number | null) => (value === null ? '' : String(value))

/** What a keystroke leaves: digits, and one decimal mark when `decimal`. Anything else is dropped as it is typed. */
function clean(text: string, decimal: boolean): string {
  if (!decimal) return text.replace(/[^\d]/g, '')
  let seen = false
  return text.replace(/[^\d.,]/g, '').replace(/[.,]/g, (mark) => {
    if (seen) return ''
    seen = true
    return mark
  })
}

/**
 * "Type or step" (B9-48, user decision): the Stepper's − value + whose value is our own styled text input. Type any amount (365
 * days, 1.5 l), or nudge it with − and +, ArrowUp and ArrowDown. It keeps the spinbutton semantics (role, aria-valuenow, min and
 * max) and the Stepper's look; no native number spinner. Empty is a real state (null), drawn as the placeholder.
 */
export function EditableStepper({
  value,
  onChange,
  label,
  min = 0,
  max,
  step = 1,
  start,
  unit,
  placeholder,
  nullable = true,
  decimal = false,
  describedBy,
  invalid,
  size = 'md',
  inputRef,
  name,
  onEnter,
}: EditableStepperProps) {
  const [text, setText] = useState(shown(value))
  // Follow a value set from outside (−, +, Clear, Cancel) unless the text already says it ("0," while typing "0,5").
  useEffect(() => {
    setText((current) => {
      const parsed = parseNumber(current)
      const now = parsed.kind === 'number' ? parsed.value : parsed.kind === 'empty' ? null : undefined
      return now === value ? current : shown(value)
    })
  }, [value])

  const bounds = { step, min, max }
  const first = start ?? (min > 0 ? min : step)
  const set = (next: number | null) => {
    setText(shown(next))
    if (next !== value) onChange(next)
  }
  const up = () => set(value === null ? first : stepValue(value, 1, bounds))
  const down = () => {
    if (value === null) return
    if (value <= min) {
      if (nullable) set(null)
      return
    }
    set(stepValue(value, -1, bounds))
  }

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const next = clean(e.target.value, decimal)
    setText(next)
    const parsed = parseNumber(next.replace(/[.,]$/, ''))
    if (parsed.kind === 'empty') {
      if (value !== null) onChange(null)
    } else if (parsed.kind === 'number' && parsed.value !== value) onChange(parsed.value)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (e.key === 'ArrowUp') up()
      else down()
    } else if (e.key === 'Enter' && onEnter) {
      e.preventDefault()
      onEnter()
    }
  }

  const atMax = max !== undefined && value !== null && value >= max
  const cannotGoDown = value === null || (!nullable && value <= min)
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="stepper" data-size={size} data-editable="">
      <IconButton icon="minus" label={uiStrings.decrease(label)} disabled={cannotGoDown} onClick={down} />
      <input
        ref={inputRef}
        name={name}
        type="text"
        role="spinbutton"
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        className="stepper__value stepper__input"
        aria-label={label}
        aria-describedby={describedBy}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? placeholder : undefined}
        aria-invalid={invalid ? true : undefined}
        placeholder={placeholder}
        value={text}
        onChange={onInput}
        onKeyDown={onKeyDown}
        onBlur={() => setText(shown(value))}
      />
      {unit ? <span className="stepper__unit">{unit}</span> : null}
      <IconButton icon="add" label={uiStrings.increase(label)} disabled={atMax} onClick={up} />
    </div>
  )
}
