import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps } from './Field'
import { clamp, stepValue } from './number'
import './Field.css'
import './Slider.css'

export interface SliderStop {
  value: number
  label: string
}

export interface SliderProps extends Omit<FieldProps, 'name' | 'required'> {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  /** Labelled positions under the track (Planner Style: Familiar, Balanced, Adventurous). */
  stops?: SliderStop[]
}

/** A role=slider on a 6 px track. Pointer press or drag snaps to the nearest step; the keys step, Home/End jump. */
export function Slider({ label, helper, error, disabled, value, onChange, min, max, step = 1, stops }: SliderProps) {
  const ids = useFieldIds()
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const fraction = max === min ? 0 : (clamp(value, min, max) - min) / (max - min)
  const stopLabel = stops?.find((s) => s.value === value)?.label
  const valueText = stopLabel ?? String(value)

  const emit = (next: number) => {
    if (disabled || next === value) return
    onChange(next)
  }

  const fromPointer = (clientX: number) => {
    const el = track.current
    if (!el) return value
    const rect = el.getBoundingClientRect()
    const ratio = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0
    const raw = min + ratio * (max - min)
    const snapped = min + Math.round((raw - min) / step) * step
    return Number(clamp(snapped, min, max).toFixed(decimals(step)))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    dragging.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    emit(fromPointer(e.clientX))
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) emit(fromPointer(e.clientX))
  }
  const onPointerUp = () => {
    dragging.current = false
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const keys: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 }
    if (e.key in keys) {
      e.preventDefault()
      emit(stepValue(value, keys[e.key] as 1 | -1, { step, min, max }))
    } else if (e.key === 'Home') {
      e.preventDefault()
      emit(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      emit(max)
    }
  }

  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <div className="ui-slider" data-disabled={disabled || undefined}>
        <div
          ref={track}
          className="slider__track"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="slider__fill" style={{ inlineSize: `${fraction * 100}%` }} />
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={ids.labelId}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={valueText}
            aria-disabled={disabled || undefined}
            className="slider__thumb"
            style={{ insetInlineStart: `${fraction * 100}%` }}
            onKeyDown={onKeyDown}
          />
        </div>
        {stops ? (
          <div className="slider__stops">
            {stops.map((stop) => (
              <span key={stop.value} className="slider__stop" data-current={stop.value === value || undefined}>
                {stop.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </FieldFrame>
  )
}

function decimals(n: number): number {
  const text = String(n)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}
