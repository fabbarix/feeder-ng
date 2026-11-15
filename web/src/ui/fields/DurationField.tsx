import { useEffect, useState, type KeyboardEvent } from 'react'
import { fromMinutes, splitMinutes, toMinutes, type DurationUnit } from '../../lib/time/duration'
import { Select } from '../Select/Select'
import type { FieldProps } from './Field'
import { describedBy, FieldFrame, useFieldIds } from './FieldFrame'
import { clamp, parseNumber } from './number'
import { fieldStrings } from './strings'
import './Field.css'
import './DurationField.css'

export interface DurationFieldProps extends FieldProps {
  /** Whole minutes; null is empty. */
  value: number | null
  onChange: (minutes: number | null) => void
  /** The units offered. Default min and h (a Step's Duration); a Lead time adds d. */
  units?: DurationUnit[]
}

const DEFAULT_UNITS: DurationUnit[] = ['min', 'h']

interface Shown {
  text: string
  unit: DurationUnit
}

const shownFor = (minutes: number | null, units: readonly DurationUnit[], unit: DurationUnit): Shown => {
  if (minutes === null) return { text: '', unit }
  const split = splitMinutes(minutes, units)
  return { text: String(split.value), unit: split.unit }
}

/** The minutes the text means in `unit`, or undefined when the text is empty or not a number. */
const minutesOf = (text: string, unit: DurationUnit): number | null | undefined => {
  const parsed = parseNumber(text)
  if (parsed.kind === 'empty') return null
  if (parsed.kind === 'invalid') return undefined
  return toMinutes(parsed.value, unit)
}

/**
 * RX-08: a Duration or Lead time in min, h or d. A group named by its visible label, holding a number (decimals allowed, "1,5"
 * too) and a unit Select named "<label> unit". The value is whole minutes; on load the largest unit that divides it evenly is
 * shown. Changing the unit converts the shown number and keeps the minutes. The number commits on blur or Enter; the arrows step
 * it by 1 in the shown unit.
 */
export function DurationField({ label, helper, error, disabled, required, name, value, onChange, units = DEFAULT_UNITS }: DurationFieldProps) {
  const ids = useFieldIds()
  const [shown, setShown] = useState<Shown>(() => shownFor(value, units, units[0] ?? 'min'))

  // A value from outside (the draft loaded) is split again; our own commits already show what they mean.
  useEffect(() => {
    setShown((current) => (minutesOf(current.text, current.unit) === value ? current : shownFor(value, units, current.unit)))
    // `units` is a list literal at most call sites; only the value decides a re-split.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // The number on screen is the stored minutes rounded to 2 decimals in the shown unit (50 min is 0.03 d). While it is still that
  // number it means the stored minutes, not the rounded amount: a unit change or a blur never turns 50 min into 43.
  const meansStored = (n: number, unit: DurationUnit) => value !== null && n === fromMinutes(value, unit)

  const commitNumber = (n: number) => {
    const next = clamp(n, 0, undefined)
    setShown((s) => ({ ...s, text: String(next) }))
    if (meansStored(next, shown.unit)) return
    const minutes = toMinutes(next, shown.unit)
    if (minutes !== value) onChange(minutes)
  }

  const commit = (raw: string) => {
    const parsed = parseNumber(raw)
    if (parsed.kind === 'invalid') {
      setShown((s) => ({ ...s, text: value === null ? '' : String(fromMinutes(value, s.unit)) }))
      return
    }
    if (parsed.kind === 'empty') {
      setShown((s) => ({ ...s, text: '' }))
      if (value !== null) onChange(null)
      return
    }
    commitNumber(parsed.value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit(e.currentTarget.value)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const parsed = parseNumber(e.currentTarget.value)
      const current = parsed.kind === 'number' ? parsed.value : 0
      commitNumber(Math.floor(current) + (e.key === 'ArrowUp' ? 1 : current === Math.floor(current) ? -1 : 0))
    }
  }

  const changeUnit = (unit: DurationUnit) => {
    setShown((s) => {
      const parsed = parseNumber(s.text)
      const minutes = parsed.kind === 'number' && meansStored(parsed.value, s.unit) ? value : minutesOf(s.text, s.unit)
      return { unit, text: minutes === null || minutes === undefined ? s.text : String(fromMinutes(minutes, unit)) }
    })
  }

  const inputId = `${ids.labelId}-input`
  const invalid = error ? true : undefined
  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <div role="group" aria-labelledby={ids.labelId} aria-invalid={invalid} className="duration-field__controls">
        <span className="ui-field__control duration-field__number">
          <input
            id={inputId}
            name={name}
            type="text"
            inputMode="decimal"
            role="spinbutton"
            aria-label={label}
            className="ui-field__input ui-field__number"
            value={shown.text}
            disabled={disabled}
            aria-required={required || undefined}
            aria-invalid={invalid}
            aria-describedby={describedBy(ids, helper, error)}
            aria-valuemin={0}
            aria-valuenow={value ?? undefined}
            onChange={(e) => {
              const text = e.target.value
              setShown((s) => ({ ...s, text }))
            }}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
        </span>
        <div className="duration-field__unit">
          <Select<DurationUnit>
            size="full"
            label={fieldStrings.durationUnit(label)}
            options={units.map((u) => ({ value: u, label: u }))}
            value={shown.unit}
            disabled={disabled}
            onChange={changeUnit}
          />
        </div>
      </div>
    </FieldFrame>
  )
}
