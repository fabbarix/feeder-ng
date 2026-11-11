import { useState, type CSSProperties, type FormEvent } from 'react'
import { Button, Chip, ColorSwatches, FormActions, Segmented } from '../../../ui'
import { usePrefersDark } from '../hooks/usePrefersDark'
import { ACCENT_PRESETS } from '../lib/accents'
import { previewColours } from '../lib/previewColours'
import { preferencesChanged } from '../lib/preferencesForm'
import { settingsStrings } from '../strings'
import type { ColourMode, Preferences } from '../types'
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

/** Segmented "Colour mode" (Light, Dark, System) and "Units" (Metric, Imperial); the accent as ColorSwatches (presets and
 *  Custom) with a live preview tile; "Save preferences" (disabled until something changes). */
export function PreferencesForm({ value, saving, onSave }: PreferencesFormProps) {
  const [draft, setDraft] = useState<Preferences>(value)
  const set = (patch: Partial<Preferences>) => setDraft((d) => ({ ...d, ...patch }))
  const prefersDark = usePrefersDark()
  const preview = previewColours(draft.accent, draft.scheme, prefersDark)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void onSave(draft)
  }

  return (
    <form className="settings__stack" onSubmit={submit}>
      <Segmented label={text.colourMode} options={[...MODES]} value={draft.scheme} onChange={(scheme) => set({ scheme })} />
      <Segmented label={text.units} options={[...UNITS]} value={draft.units} onChange={(units) => set({ units })} />
      <ColorSwatches
        label={text.accent}
        swatches={ACCENT_PRESETS.map((p) => ({ value: p.hex, name: p.name }))}
        value={draft.accent}
        onChange={(accent) => set({ accent })}
        allowCustom
      />
      <div className="settings__preview" data-testid="accent-preview" data-accent={draft.accent} style={{ '--preview-accent': preview.accent, '--preview-on-accent': preview.onAccent } as CSSProperties}>
        <span className="settings__preview-label">{text.preview}</span>
        <Chip kind="filter" selected>
          {text.previewSample}
        </Chip>
      </div>
      <FormActions
        primary={
          <Button type="submit" loading={saving} disabled={!preferencesChanged(value, draft)}>
            {text.save}
          </Button>
        }
      />
    </form>
  )
}
