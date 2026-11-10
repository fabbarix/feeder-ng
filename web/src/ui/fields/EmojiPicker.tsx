import { fieldStrings } from './strings'
import { FieldFrame, describedBy, useFieldIds } from './FieldFrame'
import { useRovingRadios } from './useRovingRadios'
import './Field.css'
import './EmojiPicker.css'

export interface EmojiOption {
  value: string
  name: string
}
export interface EmojiPickerProps {
  label: string
  helper?: string
  /** Accessible name of the "no emoji" choice (value ""). */
  noneLabel: string
  options: EmojiOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** Emoji choices in a radiogroup, "none" first. A stored value outside the list stays visible and checked. */
export function EmojiPicker({ label, helper, noneLabel, options, value, onChange, disabled }: EmojiPickerProps) {
  const ids = useFieldIds()
  const custom = value !== '' && !options.some((o) => o.value === value) ? [{ value, name: value }] : []
  const all: EmojiOption[] = [{ value: '', name: noneLabel }, ...options, ...custom]
  const roving = useRovingRadios(
    all.map((o) => ({ value: o.value, disabled })),
    value,
    onChange,
  )
  return (
    <FieldFrame ids={ids} label={label} helper={helper}>
      <div role="radiogroup" aria-labelledby={ids.labelId} aria-describedby={describedBy(ids, helper)} className="emoji-picker">
        {all.map((o) => (
          <button
            key={o.value === '' ? '__none__' : o.value}
            ref={roving.register(o.value)}
            type="button"
            role="radio"
            aria-label={o.name}
            aria-checked={o.value === value}
            tabIndex={o.value === roving.tabStop ? 0 : -1}
            disabled={disabled}
            className="emoji-choice"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => roving.onKeyDown(e, o.value)}
          >
            {o.value === '' ? fieldStrings.initialsGlyph : o.value}
          </button>
        ))}
      </div>
    </FieldFrame>
  )
}
