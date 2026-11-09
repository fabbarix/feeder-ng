import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api'
import { DEFAULT_PREFERENCES } from '../lib/defaults'
import type { Preferences } from '../types'
import { settingsKeys } from './queryKeys'

export interface PreferencesState {
  /** The server's value, or the defaults while loading. */
  preferences: Preferences
  isPending: boolean
  save: (next: Preferences) => Promise<Preferences>
  saving: boolean
}

export function usePreferences(enabled = true): PreferencesState {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: settingsKeys.preferences, queryFn: settingsApi.getPreferences, enabled })
  const mutation = useMutation({
    mutationFn: settingsApi.savePreferences,
    onSuccess: (saved) => queryClient.setQueryData(settingsKeys.preferences, saved),
  })
  return {
    preferences: query.data ?? DEFAULT_PREFERENCES,
    isPending: enabled && query.isPending,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  }
}
