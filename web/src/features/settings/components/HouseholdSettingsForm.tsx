import { useId, useRef, useState, type FormEvent } from 'react'
import { Button, CurrencySelect, FieldRow, FormActions, Icon, NumberField, TextField, TimeField, TimeZoneSelect } from '../../../ui'
import { useFocusFirstInvalid } from '../../../ui/fields/useFocusFirstInvalid'
import { draftFromSettings, settingsFromDraft, validateSettings, type SettingsDraft } from '../lib/settingsForm'
import { clockIn, timeZoneChanged } from '../lib/timezone'
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
  /** B9-53 (TB 6): "Show on Today" on the hidden setup checklist's row: an immediate write, not part of the form's Save. */
  onShowSetup?: () => void | Promise<void>
  /** The Show write is running. */
  showingSetup?: boolean
}

const text = settingsStrings.form

/** B9-36 (SET-07): Time zone and Currency are the crafted searchable Selects; after an invalid save focus goes to the first invalid field.
 *  Earliest start and Latest start are not here (Planning rules, B9-51): the save leaves them out, so the server keeps them.
 *  Time zone, the day counts (NumberFields bounded in the field: Planning Horizon 1-28, Cool-down 0-365, Leftover Use-by 1-14, Frozen Use-by 1-365),
 *  quiet hours (two TimeFields), Planner Style, Location (its helper says why coordinates matter) and Currency. */
export function HouseholdSettingsForm({ value, canEdit, saving, suggestedTimeZone, onSave, onShowSetup, showingSetup }: HouseholdSettingsFormProps) {
  const setupRowId = useId()
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromSettings(value, suggestedTimeZone))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitCount, setSubmitCount] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalid(formRef, errors, submitCount)
  const fromBrowser = !value.timeZoneConfigured && Boolean(suggestedTimeZone) && draft.timeZone === suggestedTimeZone
  const set = (patch: Partial<SettingsDraft>) => setDraft((d) => ({ ...d, ...patch }))
  /** NumberField gives null for an empty field; the draft keeps NaN so validateSettings reports it. */
  const days = (n: number) => (Number.isNaN(n) ? null : n)
  const fromDays = (n: number | null) => (n === null ? Number.NaN : n)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateSettings(draft)
    setErrors(found)
    setSubmitCount((n) => n + 1)
    if (Object.keys(found).length === 0) void onSave(settingsFromDraft(draft))
  }

  const readOnly = !canEdit
  const zoneHelper = [text.timeZoneHelper(clockIn(draft.timeZone)), fromBrowser ? text.timeZoneFromBrowser : null].filter(Boolean).join(' ')
  return (
    <form ref={formRef} className="settings__stack" onSubmit={submit} noValidate>
      <div className="settings__field-with-notice">
        <TimeZoneSelect
          size="md"
          label={text.timeZone}
          value={draft.timeZone}
          disabled={readOnly}
          error={errors.timeZone}
          helper={zoneHelper}
          onChange={(timeZone) => set({ timeZone })}
        />
        {canEdit && timeZoneChanged(value.timeZone, draft.timeZone) ? (
          <p className="settings__notice" data-tone="info" role="status">
            <Icon name="info" size={16} />
            <span>{text.timeZoneChanged}</span>
          </p>
        ) : null}
      </div>
      <FieldRow>
        <NumberField
          size="xs"
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
          size="xs"
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
          size="xs"
          label={text.leftoverUseBy}
          value={days(draft.defaultLeftoverUseByDays)}
          min={1}
          max={14}
          step={1}
          disabled={readOnly}
          error={errors.defaultLeftoverUseByDays}
          onChange={(n) => set({ defaultLeftoverUseByDays: fromDays(n) })}
        />
        <NumberField
          size="xs"
          label={text.frozenUseBy}
          value={draft.frozenUseByDays === undefined ? null : days(draft.frozenUseByDays)}
          min={1}
          max={365}
          step={1}
          disabled={readOnly}
          error={errors.frozenUseByDays}
          onChange={(n) => set({ frozenUseByDays: fromDays(n) })}
        />
      </FieldRow>
      <FieldRow>
        <TimeField
          size="sm"
          label={text.quietStart}
          value={draft.quietHours.start}
          disabled={readOnly}
          error={errors.quietHours}
          onChange={(start) => set({ quietHours: { ...draft.quietHours, start } })}
        />
        <TimeField size="sm" label={text.quietEnd} value={draft.quietHours.end} disabled={readOnly} onChange={(end) => set({ quietHours: { ...draft.quietHours, end } })} />
      </FieldRow>
      <PlannerStyleSlider value={draft.plannerStyle} disabled={readOnly} onChange={(plannerStyle) => set({ plannerStyle })} />
      <TextField
        size="lg"
        label={text.location}
        value={draft.locationText}
        disabled={readOnly}
        error={errors.location}
        helper={text.locationHint}
        onChange={(locationText) => set({ locationText })}
      />
      <CurrencySelect size="sm" label={text.currency} value={draft.currency} disabled={readOnly} error={errors.currency} onChange={(currency) => set({ currency })} />
      {canEdit && value.setupHidden === true ? (
        <ul className="settings__rows" aria-label={text.rowsLabel}>
          <li className="list-row" data-height="auto" data-actions="true" aria-labelledby={setupRowId}>
            <span className="list-row__text">
              <span id={setupRowId} className="list-row__title">
                {text.setupChecklist}
              </span>
              <span className="list-row__meta">
                <span className="list-row__meta-text">{text.setupHidden}</span>
              </span>
            </span>
            <div className="list-row__actions">
              <Button variant="secondary" size="sm" loading={showingSetup} onClick={() => void onShowSetup?.()}>
                {text.showSetup}
              </Button>
            </div>
          </li>
        </ul>
      ) : null}
      {canEdit ? (
        <FormActions
          primary={
            <Button type="submit" loading={saving}>
              {text.save}
            </Button>
          }
        />
      ) : null}
    </form>
  )
}
