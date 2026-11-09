import type { HouseholdSettings, SettingsInput } from '../types'

export interface HouseholdSettingsState {
  settings: HouseholdSettings | undefined
  isPending: boolean
  isError: boolean
  /** PUT; refreshes the cached settings. Rejects with ApiError. */
  save: (input: SettingsInput) => Promise<HouseholdSettings>
  saving: boolean
}

export function useHouseholdSettings(): HouseholdSettingsState {
  throw new Error('not implemented')
}
