import { useState, type FormEvent } from 'react'
import { Button, NumberField, TextField, TimeField } from '../../../ui'
import { draftFromSettings, settingsFromDraft, validateSettings, type SettingsDraft } from '../lib/settingsForm'
import { settingsStrings } from '../strings'
import type { HouseholdSettings, SettingsInput } from '../types'
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

/** Time zone, the day counts (NumberFields bounded in the field: Planning Horizon 1-28, Cool-down 0-365, Leftover Use-by 1-14),
 *  quiet hours (two TimeFields), Planner Style, Location (its helper says why coordinates matter) and Currency. */
export function HouseholdSettingsForm({ value, canEdit, saving, suggestedTimeZone, onSave }: HouseholdSettingsFormProps) {
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromSettings(value, suggestedTimeZone))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fromBrowser = !value.timeZoneConfigured && Boolean(suggestedTimeZone) && draft.timeZone === suggestedTimeZone
  const set = (patch: Partial<SettingsDraft>) => setDraft((d) => ({ ...d, ...patch }))
  /** NumberField gives null for an empty field; the draft keeps NaN so validateSettings reports it. */
  const days = (n: number) => (Number.isNaN(n) ? null : n)
  const fromDays = (n: number | null) => (n === null ? Number.NaN : n)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateSettings(draft)
    setErrors(found)
    if (Object.keys(found).length === 0) void onSave(settingsFromDraft(draft))
  }

  const readOnly = !canEdit
  return (
    <form className="settings__stack" onSubmit={submit} noValidate>
      <TextField
        label={text.timeZone}
        value={draft.timeZone}
        disabled={readOnly}
        error={errors.timeZone}
        helper={fromBrowser ? text.timeZoneFromBrowser : undefined}
        onChange={(timeZone) => set({ timeZone })}
      />
      <NumberField
        label={text.planningHorizon}
        value={days(draft.planningHorizonDays)}
        min={1}
        max={28}
        step={1}
        disabled={readOnly}
        error={errors.planningHorizonDays}
        onChange={(n) => set({ planningHorizonDays: fromDays(n) })}
      />
      <NumberField
        label={text.cooldown}
        value={days(draft.defaultCooldownDays)}
        min={0}
        max={365}
        step={1}
        disabled={readOnly}
        error={errors.defaultCooldownDays}
        onChange={(n) => set({ defaultCooldownDays: fromDays(n) })}
      />
      <NumberField
        label={text.leftoverUseBy}
        value={days(draft.defaultLeftoverUseByDays)}
        min={1}
        max={14}
        step={1}
        disabled={readOnly}
        error={errors.defaultLeftoverUseByDays}
        onChange={(n) => set({ defaultLeftoverUseByDays: fromDays(n) })}
      />
      <div className="settings__row settings__row--wrap-start">
        <TimeField
          label={text.quietStart}
          value={draft.quietHours.start}
          disabled={readOnly}
          error={errors.quietHours}
          onChange={(start) => set({ quietHours: { ...draft.quietHours, start } })}
        />
        <TimeField label={text.quietEnd} value={draft.quietHours.end} disabled={readOnly} onChange={(end) => set({ quietHours: { ...draft.quietHours, end } })} />
      </div>
      <PlannerStyleSlider value={draft.plannerStyle} disabled={readOnly} onChange={(plannerStyle) => set({ plannerStyle })} />
      <TextField
        label={text.location}
        value={draft.locationText}
        disabled={readOnly}
        error={errors.location}
        helper={text.locationHint}
        onChange={(locationText) => set({ locationText })}
      />
      <TextField label={text.currency} value={draft.currency} disabled={readOnly} error={errors.currency} onChange={(currency) => set({ currency })} />
      {canEdit ? (
        <Button type="submit" loading={saving}>
          {text.save}
        </Button>
      ) : null}
    </form>
  )
}
