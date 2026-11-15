import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { settingsApi } from '../api'
import type { HouseholdSettings, SettingsInput } from '../types'
import { settingsKeys } from './queryKeys'

export interface HouseholdSettingsState {
  /** B9-20 (RES-02): the page's screen state; offline and never loaded is offlineUnknown, never an empty or default page. */
  state: ScreenState
  /** Fetches again (the error state's Try again). */
  refetch: () => void
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
  const state = useScreenState(query, { isEmpty: false, hasFilter: false })
  return {
    state,
    refetch: () => void query.refetch(),
    settings: query.data,
    isPending: query.isPending,
    isError: query.isError,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  }
}
