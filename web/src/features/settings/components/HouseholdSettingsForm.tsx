import type { HouseholdSettings, SettingsInput } from '../types'

export interface HouseholdSettingsFormProps {
  value: HouseholdSettings
  /** Admins edit; everyone else sees read-only fields and no save button. */
  canEdit: boolean
  saving?: boolean
  /** The browser's zone, offered while the Household's zone was never set. */
  suggestedTimeZone?: string
  onSave: (next: SettingsInput) => void | Promise<void>
}

/** Labelled fields: Time zone, Planning Horizon (days), Default Cool-down (days), Default Leftover Use-by (days),
 *  Quiet hours start / end, Planner Style, Location, Currency; button "Save household settings". */
export function HouseholdSettingsForm(_props: HouseholdSettingsFormProps) {
  return null
}
