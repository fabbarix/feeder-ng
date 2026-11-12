import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { FieldFrame, describedBy, useFieldIds } from '../fields/FieldFrame'
import type { FieldProps } from '../fields/Field'
import { useRovingRadios } from '../fields/useRovingRadios'
import { TAG_PALETTE, isTagColour } from '../../lib/tags/palette'
import type { TagColourId } from '../../lib/tags/types'
import './TagColour.css'

export interface TagColourPickerProps extends Omit<FieldProps, 'name' | 'required'> {
  label: string
  /** The chosen TagColourId; an unknown id leaves nothing checked. */
  value: string
  onChange: (id: TagColourId) => void
  /** A live pill preview, drawn under the swatches (the sheet passes a Chip). */
  preview?: ReactNode
}

/** Ten 40 px swatches in a radiogroup, each named ("Sage"), the chosen one ticked. No Custom swatch, no native colour input. */
export function TagColourPicker({ label, helper, error, disabled, value, onChange, preview }: TagColourPickerProps): ReactNode {
  const ids = useFieldIds()
  const checked = isTagColour(value) ? value : undefined
  const roving = useRovingRadios(
    TAG_PALETTE.map((c) => ({ value: c.id, disabled })),
    checked ?? '',
    (next) => onChange(next as TagColourId),
  )
  return (
    <>
      <FieldFrame ids={ids} label={label} helper={helper} error={error}>
        <div role="radiogroup" aria-labelledby={ids.labelId} aria-describedby={describedBy(ids, helper, error)} className="tag-colour-picker">
          {TAG_PALETTE.map((colour) => {
            const on = colour.id === checked
            return (
              <button
                key={colour.id}
                ref={roving.register(colour.id)}
                type="button"
                role="radio"
                aria-label={colour.name}
                aria-checked={on}
                tabIndex={colour.id === roving.tabStop ? 0 : -1}
                disabled={disabled}
                className="tag-swatch"
                data-tag-colour={colour.id}
                onClick={() => onChange(colour.id)}
                onKeyDown={(e) => roving.onKeyDown(e, colour.id)}
              >
                {on ? <Icon name="tick" size={20} /> : null}
              </button>
            )
          })}
        </div>
      </FieldFrame>
      {preview ? <div className="tag-colour-picker__preview">{preview}</div> : null}
    </>
  )
}
