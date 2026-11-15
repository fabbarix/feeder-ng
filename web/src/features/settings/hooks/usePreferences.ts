import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { settingsApi } from '../api'
import { DEFAULT_PREFERENCES } from '../lib/defaults'
import type { Preferences } from '../types'
import { settingsKeys } from './queryKeys'

export interface PreferencesState {
  /** B9-20 (RES-02): the page's screen state; offline and never loaded is offlineUnknown, never an empty or default page. */
  state: ScreenState
  /** Fetches again (the error state's Try again). */
  refetch: () => void
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
  const state = useScreenState(query, { isEmpty: false, hasFilter: false })
  return {
    state,
    refetch: () => void query.refetch(),
    preferences: query.data ?? DEFAULT_PREFERENCES,
    isPending: enabled && query.isPending,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  }
}
