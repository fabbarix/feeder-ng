import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../Icon'
import { IconButton } from '../IconButton'
import { addMonths, monthMatrix, moveIso, parseIsoDate, toIsoDate } from './calendar'
import { describedBy, FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps, FieldSizeProps } from './Field'
import { floatingPopoverAttr, useFloatingPopover } from '../lib/useFloatingPopover'
import { fieldStrings } from './strings'
import './Field.css'
import './DateField.css'

export interface DateFieldProps extends FieldProps, FieldSizeProps {
  /** ISO "YYYY-MM-DD" or "" for none. */
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  /** Injectable for tests; default: the device's today. */
  today?: string
  /** Default en-GB. */
  locale?: string
}

const todayIso = () => {
  const now = new Date()
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** A date from an ISO string, as local time (no time zone shifts). */
function localDate(iso: string): Date {
  const parts = parseIsoDate(iso)
  return parts ? new Date(parts.year, parts.month - 1, parts.day) : new Date()
}

/**
 * A field showing the date, opening a non-modal calendar popover: Monday-first grid, arrows by day and week, PageUp/PageDown
 * by month, Enter or Space selects, Escape closes and returns focus to the trigger. Days outside min/max are disabled.
 */
export function DateField({ size = 'md', label, helper, error, disabled, required, value, onChange, min, max, today, locale = 'en-GB' }: DateFieldProps) {
  const ids = useFieldIds()
  const [open, setOpen] = useState(false)
  const [focusIso, setFocusIso] = useState(value || today || todayIso())
  const [view, setView] = useState(() => {
    return viewOf(value || today || todayIso())
  })
  const [focusTick, setFocusTick] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const todayValue = today ?? todayIso()

  const formatDay = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }), [locale])
  const longDay = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }), [locale])
  const monthName = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }), [locale])

  const openCalendar = () => {
    const start = value || todayValue
    setFocusIso(start)
    setView(viewOf(start))
    setFocusTick((t) => t + 1)
    setOpen(true)
  }
  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useFloatingPopover(open, triggerRef, popoverRef)

  // Latest roving day, read by the focus effect below. Effects run in order, so this is current when the tick fires.
  const focusIsoRef = useRef(focusIso)
  useEffect(() => {
    focusIsoRef.current = focusIso
  })

  // Focus follows the roving day on open and on keyboard moves only (the tick), never on a month change: the month
  // buttons keep focus.
  useEffect(() => {
    if (!open || focusTick === 0) return
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIsoRef.current}"]`)?.focus()
  }, [focusTick])

  // Outside click closes the popover.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  const moveFocus = (iso: string) => {
    setFocusIso(iso)
    const d = localDate(iso)
    setView({ year: d.getFullYear(), month: d.getMonth() + 1 })
    setFocusTick((t) => t + 1)
  }

  // The month buttons move the roving day too (clamped), so exactly one day stays tabbable. DOM focus stays on the button.
  const shiftMonth = (months: number) => {
    const next = addMonths(focusIso, months)
    setFocusIso(next)
    setView(viewOf(next))
  }

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
      return
    }
    const next = moveIso(focusIso, e.key)
    if (next !== null) {
      e.preventDefault()
      moveFocus(next)
    }
  }

  const choose = (iso: string) => {
    if (isDisabled(iso)) return
    onChange(iso)
    close(true)
  }
  const isDisabled = (iso: string) => (min !== undefined && iso < min) || (max !== undefined && iso > max)

  const weeks = monthMatrix(view.year, view.month)
  const headingId = `${ids.labelId}-month`
  const shown = value ? formatDay.format(localDate(value)) : fieldStrings.chooseDate
  const describe = describedBy(ids, helper, error)

  return (
    <FieldFrame ids={ids} size={size} label={label} helper={helper} error={error}>
      <div ref={wrapRef} className="date-field">
        <button
          ref={triggerRef}
          type="button"
          className="date-field__trigger"
          aria-labelledby={ids.labelId}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-required={required || undefined}
          aria-describedby={describe}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          data-placeholder={value ? undefined : ''}
          onClick={() => (open ? close(true) : openCalendar())}
        >
          <span className="date-field__value">{shown}</span>
          <Icon name="planEmpty" size={20} />
        </button>
        {open ? (
          <div
            ref={popoverRef}
            popover={floatingPopoverAttr()}
            role="dialog"
            aria-labelledby={ids.labelId}
            className="date-field__popover"
            onKeyDown={onGridKey}
          >
            <div className="date-field__header">
              <IconButton icon="back" label={fieldStrings.previousMonth} size="compact" onClick={() => shiftMonth(-1)} />
              <span id={headingId} className="date-field__month" aria-live="polite">
                {monthName.format(new Date(view.year, view.month - 1, 1))}
              </span>
              <IconButton icon="next" label={fieldStrings.nextMonth} size="compact" onClick={() => shiftMonth(1)} />
            </div>
            <div ref={gridRef}>
              <table role="grid" aria-labelledby={headingId} className="date-field__grid">
                <thead>
                  <tr>
                    {fieldStrings.weekdays.map((name) => (
                      <th key={name} scope="col">
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week[0]?.iso}>
                      {week.map((day) => {
                        const selected = day.iso === value
                        const disabledDay = isDisabled(day.iso)
                        return (
                          <td key={day.iso} role="gridcell" aria-selected={selected ? 'true' : 'false'}>
                            <button
                              type="button"
                              data-iso={day.iso}
                              aria-label={longDay.format(localDate(day.iso))}
                              aria-current={day.iso === todayValue ? 'date' : undefined}
                              disabled={disabledDay || undefined}
                              aria-disabled={disabledDay || undefined}
                              data-outside={day.inMonth ? undefined : 'true'}
                              data-selected={selected || undefined}
                              tabIndex={day.iso === focusIso ? 0 : -1}
                              onClick={() => choose(day.iso)}
                            >
                              {day.day}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </FieldFrame>
  )
}

function viewOf(iso: string): { year: number; month: number } {
  const d = localDate(iso)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}
