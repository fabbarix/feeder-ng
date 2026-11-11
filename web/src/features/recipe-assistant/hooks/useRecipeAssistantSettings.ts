import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { recipeAssistantApi } from '../api'
import type { AssistantSettings, SaveResult, SettingsPutBody } from '../types'
import { raKeys } from './queryKeys'

/**
 * The Recipe Assistant settings: read, save (PUT) and remove the key (DELETE). Saves are plain calls, not mutations, so
 * a typed API key never sits in a mutation's variables; the answer (which has no key) becomes the cache value.
 */
export function useRecipeAssistantSettings(enabled: boolean) {
  const client = useQueryClient()
  const query = useQuery<AssistantSettings>({ queryKey: raKeys.settings, queryFn: recipeAssistantApi.getSettings, enabled })
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const save = useCallback(
    async (body: SettingsPutBody): Promise<SaveResult> => {
      setSaving(true)
      try {
        const { warnings, ...settings } = await recipeAssistantApi.saveSettings(body)
        client.setQueryData(raKeys.settings, settings)
        return { settings, warnings: warnings ?? [] }
      } finally {
        setSaving(false)
      }
    },
    [client],
  )

  const removeKey = useCallback(async (): Promise<AssistantSettings> => {
    setRemoving(true)
    try {
      const settings = await recipeAssistantApi.removeKey()
      client.setQueryData(raKeys.settings, settings)
      return settings
    } finally {
      setRemoving(false)
    }
  }, [client])

  return { settings: query.data, isPending: query.isPending, isError: query.isError, save, saving, removeKey, removing }
}
