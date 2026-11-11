import { useId, useRef, type KeyboardEvent } from 'react'
import { Icon } from '../Icon'
import { sortIsoDays, weekdayLongName, weekdayOrder, weekdayShortName, type WeekStart } from './weekdays'
import './WeekdayPicker.css'

export interface WeekdayPickerProps {
  /** The visible group label ("Apply to", "Days"); also the group's accessible name. */
  label: string
  /** Selected ISO weekdays (1 Monday .. 7 Sunday). */
  value: number[]
  /** Always ascending ISO order, whatever the week start. */
  onChange: (days: number[]) => void
  /** First weekday shown (default Monday, 1). */
  weekStart?: WeekStart
  /** BCP 47 locale for the short and full names (default 'en'). */
  locale?: string
  disabled?: boolean
  helper?: string
  /** A problem with the choice: shown as role="alert" and linked with aria-describedby. */
  error?: string
}

/** Seven toggle chips for choosing weekdays; every chip is a tab stop, arrows move focus without changing the selection. */
export function WeekdayPicker({ label, value, onChange, weekStart = 1, locale = 'en', disabled, helper, error }: WeekdayPickerProps) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const order = weekdayOrder(weekStart)
  const selected = new Set(value)
  const describedBy = [helper ? `${id}-helper` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined

  const toggle = (day: number) => onChange(sortIsoDays(selected.has(day) ? value.filter((d) => d !== day) : [...value, day]))
  const focusAt = (i: number) => refs.current[(i + 7) % 7]?.focus()
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: 6 }[e.key]
    if (target === undefined) return
    e.preventDefault()
    focusAt(target)
  }

  return (
    <div className="weekday-picker" role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
      <span className="weekday-picker__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="weekday-picker__chips">
        {order.map((day, i) => {
          const on = selected.has(day)
          return (
            <button
              key={day}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              className="weekday-picker__chip"
              aria-pressed={on}
              aria-label={weekdayLongName(day, locale)}
              disabled={disabled}
              onClick={() => toggle(day)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {on ? <Icon name="tick" size={14} /> : null}
              <span aria-hidden="true">{weekdayShortName(day, locale)}</span>
            </button>
          )
        })}
      </div>
      {helper ? (
        <p className="weekday-picker__helper" id={`${id}-helper`}>
          {helper}
        </p>
      ) : null}
      {error ? (
        <p className="weekday-picker__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
