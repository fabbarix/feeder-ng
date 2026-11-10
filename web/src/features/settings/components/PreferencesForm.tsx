import { useState, type FormEvent } from 'react'
import { Button, Chip } from '../../../ui'
import { ACCENT_PRESETS } from '../lib/accents'
import { preferencesChanged } from '../lib/preferencesForm'
import { settingsStrings } from '../strings'
import type { ColourMode, Preferences } from '../types'
import { Field } from './Field'
import { RadioGroup } from './RadioGroup'
import '../settings.css'

export interface PreferencesFormProps {
  value: Preferences
  saving?: boolean
  onSave: (next: Preferences) => void | Promise<void>
}

const text = settingsStrings.prefs

const MODES: ReadonlyArray<{ value: ColourMode; label: string }> = [
  { value: 'light', label: text.light },
  { value: 'dark', label: text.dark },
  { value: 'system', label: text.system },
]
const UNITS: ReadonlyArray<{ value: Preferences['units']; label: string }> = [
  { value: 'metric', label: text.metric },
  { value: 'imperial', label: text.imperial },
]

/** Radio groups "Colour mode" (Light, Dark, System) and "Units" (Metric, Imperial); accent presets as chips plus
 *  "Custom accent colour"; "Save preferences" (disabled until something changes). */
export function PreferencesForm({ value, saving, onSave }: PreferencesFormProps) {
  const [draft, setDraft] = useState<Preferences>(value)
  const set = (patch: Partial<Preferences>) => setDraft((d) => ({ ...d, ...patch }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void onSave(draft)
  }

  return (
    <form className="settings__stack" onSubmit={submit}>
      <RadioGroup legend={text.colourMode} name="scheme" value={draft.scheme} options={MODES} onChange={(scheme) => set({ scheme })} />
      <RadioGroup legend={text.units} name="units" value={draft.units} options={UNITS} onChange={(units) => set({ units })} />
      <div className="settings__stack">
        <span className="field__label">{text.accent}</span>
        <div className="settings__row">
          {ACCENT_PRESETS.map((p) => (
            <Chip
              key={p.hex}
              selected={p.hex.toLowerCase() === draft.accent.toLowerCase()}
              icon={<span className="settings__swatch" style={{ background: p.hex }} />}
              onClick={() => set({ accent: p.hex })}
            >
              {p.name}
            </Chip>
          ))}
        </div>
        <Field label={text.customAccent}>
          {(c) => <input {...c} type="color" value={draft.accent} onChange={(e) => set({ accent: e.target.value })} />}
        </Field>
      </div>
      <Button type="submit" loading={saving} disabled={!preferencesChanged(value, draft)}>
        {text.save}
      </Button>
    </form>
  )
}
