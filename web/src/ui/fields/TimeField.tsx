import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { describedBy, FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps } from './Field'
import { applyDigit, formatTime, parseTime, stepSegment, type TimeParts } from './time'
import { fieldStrings } from './strings'
import './Field.css'
import './TimeField.css'

export interface TimeFieldProps extends FieldProps {
  /** "HH:mm" or "" for none. */
  value: string
  onChange: (value: string) => void
  /** Minute arrows step by this. Default 1. */
  minuteStep?: number
}

const PLACEHOLDER = '––'

type Segment = 'hour' | 'minute'

/**
 * 24 h time as two segments (Hour, Minute) in a group. Arrows wrap without carry; two digits (or a first digit that cannot
 * start a two-digit value) set a segment. Never AM/PM and never the browser's time input.
 */
export function TimeField({ label, helper, error, disabled, required, value, onChange, minuteStep = 1 }: TimeFieldProps) {
  const ids = useFieldIds()
  const parts = parseTime(value)
  const [pending, setPending] = useState<{ segment: Segment; digit: number } | null>(null)
  const minuteRef = useRef<HTMLSpanElement>(null)

  const emit = (next: Partial<TimeParts>) => {
    const merged = { hour: next.hour ?? parts?.hour ?? 0, minute: next.minute ?? parts?.minute ?? 0 }
    const formatted = formatTime(merged)
    if (formatted !== value) onChange(formatted)
  }

  const onSegmentKey = (segment: Segment) => (e: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      setPending(null)
      const current = segment === 'hour' ? (parts?.hour ?? 0) : (parts?.minute ?? 0)
      emit({ [segment]: stepSegment(current, e.key === 'ArrowUp' ? 1 : -1, segment, minuteStep) })
    } else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      const result = applyDigit(pending?.segment === segment ? pending.digit : null, Number(e.key), segment)
      emit({ [segment]: result.value })
      setPending(result.pending === null ? null : { segment, digit: result.pending })
      if (result.advance && segment === 'hour') minuteRef.current?.focus()
    }
  }

  const describe = describedBy(ids, helper, error)
  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <div role="group" aria-labelledby={ids.labelId} aria-describedby={describe} aria-required={required || undefined} className="time-field" data-disabled={disabled || undefined}>
        <Segment name={fieldStrings.hour} value={parts?.hour} max={23} disabled={disabled} onKeyDown={onSegmentKey('hour')} />
        <span className="time-field__colon" aria-hidden="true">
          :
        </span>
        <Segment name={fieldStrings.minute} value={parts?.minute} max={59} disabled={disabled} onKeyDown={onSegmentKey('minute')} segmentRef={minuteRef} />
      </div>
    </FieldFrame>
  )
}

interface SegmentProps {
  name: string
  value: number | undefined
  max: number
  disabled?: boolean
  onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => void
  segmentRef?: RefObject<HTMLSpanElement | null>
}

function Segment({ name, value, max, disabled, onKeyDown, segmentRef }: SegmentProps) {
  return (
    <span
      ref={segmentRef}
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled || undefined}
      className="time-field__segment"
      onKeyDown={onKeyDown}
    >
      {value === undefined ? PLACEHOLDER : String(value).padStart(2, '0')}
    </span>
  )
}
