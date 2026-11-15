import { useRef, type FormEvent } from 'react'
import { Button, ColorSwatches, FormActions, Icon, StickyActionBar, Tile, Segmented } from '../../../ui'
import { ACCENT_PRESETS } from '../lib/accents'
import { previewSummary } from '../lib/preferencePreview'
import { settingsStrings } from '../strings'
import type { ColourMode, Preferences } from '../types'
import '../settings.css'

export interface PreferencesFormProps {
  /** What the controls show: the effective value (the preview, else the saved one). */
  value: Preferences
  /** The server's value: what Revert puts back and what the "Not saved yet" line names. */
  saved: Preferences
  /** The preview differs from the saved value: the status line shows and the actions are the sticky bar. */
  dirty: boolean
  /** Every choice, at once (the page previews it across the app). */
  onChange: (next: Preferences) => void
  onRevert: () => void
  saving?: boolean
  onSave: (next: Preferences) => void | Promise<void>
  /** The tile's accessible name. */
  label?: string
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

/**
 * B9-36 (SAFE-08, decision SAFE 6 B): render-only. Segmented "Colour mode" and "Units" and the accent swatches hand every choice up at
 * once (the whole app is the preview). While dirty, an info "Not saved yet" line and the actions as the sticky bar (Revert, Save
 * preferences); while clean, the same group sits in the flow at the end of the tile with both buttons disabled.
 */
export function PreferencesForm({ value, saved, dirty, onChange, onRevert, saving, onSave, label }: PreferencesFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const set = (patch: Partial<Preferences>) => onChange({ ...value, ...patch })
  const summary = dirty ? previewSummary(saved, value) : null
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!dirty || saving) return
    void onSave(value)
  }
  // The sticky bar goes with the preview: focus would fall to the page, so it goes to the chosen Colour mode instead.
  const revert = () => {
    onRevert()
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true }))
  }
  const actions = (
    <FormActions
      tertiary={
        <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={revert}>
          {text.revert}
        </Button>
      }
      primary={
        <Button type="submit" loading={saving} disabled={!dirty}>
          {text.save}
        </Button>
      }
    />
  )

  return (
    <form ref={formRef} className="prefs" onSubmit={submit}>
      <Tile as="section" span="full" aria-label={label}>
        <div className="settings__stack">
          <p className="prefs__intro">{text.intro}</p>
          {summary ? (
            <p className="settings__notice" role="status" data-tone="info">
              <Icon name="info" size={16} />
              <span>{summary}</span>
            </p>
          ) : null}
          <Segmented label={text.colourMode} options={[...MODES]} value={value.scheme} onChange={(scheme) => set({ scheme })} />
          <Segmented label={text.units} options={[...UNITS]} value={value.units} onChange={(units) => set({ units })} />
          <ColorSwatches
            label={text.accent}
            swatches={ACCENT_PRESETS.map((p) => ({ value: p.hex, name: p.name }))}
            value={value.accent}
            onChange={(accent) => set({ accent })}
            allowCustom
          />
          {dirty ? null : (
            <div className="prefs__actions" role="group" aria-label={text.actions}>
              {actions}
            </div>
          )}
        </div>
      </Tile>
      {dirty ? (
        <StickyActionBar label={text.actions} column="narrow">
          {actions}
        </StickyActionBar>
      ) : null}
    </form>
  )
}
