import { useState, type FormEvent } from 'react'
import { Button } from '../../../ui'
import { draftFromSettings, settingsFromDraft, validateSettings, type SettingsDraft } from '../lib/settingsForm'
import { settingsStrings } from '../strings'
import type { HouseholdSettings, SettingsInput } from '../types'
import { Field } from './Field'
import { PlannerStyleSlider } from './PlannerStyleSlider'
import '../settings.css'

export interface HouseholdSettingsFormProps {
  value: HouseholdSettings
  /** Admins edit; everyone else sees read-only fields and no save button. */
  canEdit: boolean
  saving?: boolean
  /** The browser's zone, offered while the Household's zone was never set. */
  suggestedTimeZone?: string
  onSave: (next: SettingsInput) => void | Promise<void>
}

const text = settingsStrings.form

/** Labelled fields: Time zone, Planning Horizon (days), Default Cool-down (days), Default Leftover Use-by (days),
 *  Quiet hours start / end, Planner Style, Location, Currency; button "Save household settings". */
export function HouseholdSettingsForm({ value, canEdit, saving, suggestedTimeZone, onSave }: HouseholdSettingsFormProps) {
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromSettings(value, suggestedTimeZone))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fromBrowser = !value.timeZoneConfigured && Boolean(suggestedTimeZone) && draft.timeZone === suggestedTimeZone
  const set = (patch: Partial<SettingsDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const days = (n: number) => (Number.isNaN(n) ? '' : n)
  const toDays = (raw: string) => (raw === '' ? Number.NaN : Number(raw))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateSettings(draft)
    setErrors(found)
    if (Object.keys(found).length === 0) void onSave(settingsFromDraft(draft))
  }

  const readOnly = !canEdit
  return (
    <form className="settings__stack" onSubmit={submit} noValidate>
      <Field label={text.timeZone} error={errors.timeZone} hint={fromBrowser ? text.timeZoneFromBrowser : undefined}>
        {(c) => <input {...c} type="text" value={draft.timeZone} disabled={readOnly} onChange={(e) => set({ timeZone: e.target.value })} />}
      </Field>
      <Field label={text.planningHorizon} error={errors.planningHorizonDays}>
        {(c) => (
          <input {...c} type="number" value={days(draft.planningHorizonDays)} disabled={readOnly} onChange={(e) => set({ planningHorizonDays: toDays(e.target.value) })} />
        )}
      </Field>
      <Field label={text.cooldown} error={errors.defaultCooldownDays}>
        {(c) => (
          <input {...c} type="number" value={days(draft.defaultCooldownDays)} disabled={readOnly} onChange={(e) => set({ defaultCooldownDays: toDays(e.target.value) })} />
        )}
      </Field>
      <Field label={text.leftoverUseBy} error={errors.defaultLeftoverUseByDays}>
        {(c) => (
          <input
            {...c}
            type="number"
            value={days(draft.defaultLeftoverUseByDays)}
            disabled={readOnly}
            onChange={(e) => set({ defaultLeftoverUseByDays: toDays(e.target.value) })}
          />
        )}
      </Field>
      <div className="settings__row settings__row--wrap-start">
        <Field label={text.quietStart} error={errors.quietHours}>
          {(c) => (
            <input {...c} type="time" value={draft.quietHours.start} disabled={readOnly} onChange={(e) => set({ quietHours: { ...draft.quietHours, start: e.target.value } })} />
          )}
        </Field>
        <Field label={text.quietEnd}>
          {(c) => (
            <input {...c} type="time" value={draft.quietHours.end} disabled={readOnly} onChange={(e) => set({ quietHours: { ...draft.quietHours, end: e.target.value } })} />
          )}
        </Field>
      </div>
      <PlannerStyleSlider value={draft.plannerStyle} disabled={readOnly} onChange={(plannerStyle) => set({ plannerStyle })} />
      <Field label={text.location} error={errors.location} hint={text.locationHint}>
        {(c) => <input {...c} type="text" value={draft.locationText} disabled={readOnly} onChange={(e) => set({ locationText: e.target.value })} />}
      </Field>
      <Field label={text.currency} error={errors.currency}>
        {(c) => <input {...c} type="text" value={draft.currency} disabled={readOnly} onChange={(e) => set({ currency: e.target.value })} />}
      </Field>
      {canEdit ? (
        <Button type="submit" loading={saving}>
          {text.save}
        </Button>
      ) : null}
    </form>
  )
}
