import { useState } from 'react'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { Icon } from '../Icon'
import { FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldProps } from './Field'
import { fieldStrings } from './strings'
import { hexToHue, hueToHex, isHex, normaliseHex } from './color'
import { Slider } from './Slider'
import { TextField } from './TextField'
import { useRovingRadios } from './useRovingRadios'
import './Field.css'
import './ColorSwatches.css'

/** Roving value of the Custom swatch (never a colour). */
const CUSTOM = '__custom__'

export interface Swatch {
  value: string
  name: string
}

export interface ColorSwatchesProps extends Omit<FieldProps, 'name' | 'required'> {
  label: string
  swatches: Swatch[]
  /** A "#rrggbb" value (preset or custom). */
  value: string
  onChange: (value: string) => void
  /** Adds a "Custom" swatch that opens a picker (hue slider and hex field). */
  allowCustom?: boolean
}

/** Accent presets as 40 px circles in a radiogroup; optional "Custom" opens a dialog to craft a colour. */
export function ColorSwatches({ label, helper, error, disabled, swatches, value, onChange, allowCustom }: ColorSwatchesProps) {
  const ids = useFieldIds()
  const [customOpen, setCustomOpen] = useState(false)
  const current = value.toLowerCase()
  const presetChosen = swatches.some((s) => s.value.toLowerCase() === current)
  const customChecked = Boolean(allowCustom) && !presetChosen
  const roving = useRovingRadios(
    [...swatches.map((s) => ({ value: s.value, disabled })), ...(allowCustom ? [{ value: CUSTOM, disabled }] : [])],
    customChecked ? CUSTOM : current,
    (next) => {
      if (next === CUSTOM) setCustomOpen(true)
      else onChange(next)
    },
  )

  return (
    <FieldFrame ids={ids} label={label} helper={helper} error={error}>
      <div role="radiogroup" aria-labelledby={ids.labelId} className="colour-swatches">
        {swatches.map((swatch) => (
          <button
            key={swatch.value}
            ref={roving.register(swatch.value)}
            type="button"
            role="radio"
            aria-label={swatch.name}
            aria-checked={swatch.value.toLowerCase() === current}
            tabIndex={swatch.value === roving.tabStop ? 0 : -1}
            disabled={disabled}
            className="colour-swatch"
            style={{ background: swatch.value }}
            onClick={() => onChange(swatch.value)}
            onKeyDown={(e) => roving.onKeyDown(e, swatch.value)}
          />
        ))}
        {allowCustom ? (
          <button
            ref={roving.register(CUSTOM)}
            type="button"
            role="radio"
            aria-label={fieldStrings.custom}
            aria-checked={customChecked}
            tabIndex={customChecked || roving.tabStop === CUSTOM ? 0 : -1}
            disabled={disabled}
            className="colour-swatch colour-swatch--custom"
            style={customChecked ? { background: value } : undefined}
            onClick={() => setCustomOpen(true)}
            onKeyDown={(e) => roving.onKeyDown(e, CUSTOM)}
          >
            <Icon name="appearance" size={20} />
          </button>
        ) : null}
      </div>
      {allowCustom && customOpen ? (
        <CustomColourDialog
          initial={value}
          onCancel={() => setCustomOpen(false)}
          onUse={(hex) => {
            onChange(hex)
            setCustomOpen(false)
          }}
        />
      ) : null}
    </FieldFrame>
  )
}


interface CustomColourDialogProps {
  initial: string
  onCancel: () => void
  onUse: (hex: string) => void
}

function CustomColourDialog({ initial, onCancel, onUse }: CustomColourDialogProps) {
  const [hex, setHex] = useState(initial)
  const [hue, setHue] = useState(() => hexToHue(initial))
  const normal = normaliseHex(hex)
  const invalid = !isHex(hex)
  return (
    <Dialog
      open
      onClose={onCancel}
      title={fieldStrings.customColour}
      actions={
        <>
          <Button variant="tertiary" onClick={onCancel}>
            {fieldStrings.cancel}
          </Button>
          <Button disabled={invalid || normal === null} onClick={() => normal && onUse(normal)}>
            {fieldStrings.useColour}
          </Button>
        </>
      }
    >
      <div className="colour-swatches__picker">
        <Slider
          label={fieldStrings.hue}
          min={0}
          max={359}
          value={hue}
          onChange={(next) => {
            setHue(next)
            setHex(hueToHex(next))
          }}
        />
        <TextField
          label={fieldStrings.hexColour}
          value={hex}
          onChange={(next) => {
            setHex(next)
            const parsed = normaliseHex(next)
            if (parsed) setHue(hexToHue(parsed))
          }}
          error={invalid ? fieldStrings.hexHint : undefined}
        />
      </div>
    </Dialog>
  )
}
