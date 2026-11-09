import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api'
import type { HouseholdSettings, SettingsInput } from '../types'
import { settingsKeys } from './queryKeys'

export interface HouseholdSettingsState {
  settings: HouseholdSettings | undefined
  isPending: boolean
  isError: boolean
  /** PUT; refreshes the cached settings. Rejects with ApiError. */
  save: (input: SettingsInput) => Promise<HouseholdSettings>
  saving: boolean
}

export function useHouseholdSettings(): HouseholdSettingsState {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: settingsKeys.settings, queryFn: settingsApi.getSettings })
  const mutation = useMutation({
    mutationFn: settingsApi.saveSettings,
    onSuccess: (saved) => queryClient.setQueryData(settingsKeys.settings, saved),
  })
  return {
    settings: query.data,
    isPending: query.isPending,
    isError: query.isError,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  }
}
