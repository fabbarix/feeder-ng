import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { originOf } from '../lib/baseUrl'
import { recipeAssistantApi } from '../api'
import type { ModelsRequest, ModelsResponse } from '../types'
import { raKeys } from './queryKeys'

const HOUR_MS = 60 * 60 * 1000

export interface ModelChoicesOptions {
  /** Load by itself (and keep the answer an hour). False while the address needs a key that has not been typed. */
  enabled: boolean
  /** An address other than the saved one. Only its origin names the cache entry. */
  baseUrl?: string
  /** Typed, unsaved key. It goes into the request body of a refresh and nowhere else. */
  apiKey?: string
}

/** The model list for an address: cached for an hour per origin; `refresh` asks the server again. */
export function useModelChoices({ enabled, baseUrl, apiKey }: ModelChoicesOptions) {
  const client = useQueryClient()
  const key = raKeys.models(baseUrl ? (originOf(baseUrl) ?? baseUrl) : 'saved')
  const query = useQuery<ModelsResponse>({
    queryKey: key,
    queryFn: () => recipeAssistantApi.listModels(baseUrl ? { baseUrl } : {}),
    enabled,
    staleTime: HOUR_MS,
    retry: false,
  })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<unknown>(undefined)

  const refresh = useCallback(
    async (extra: Pick<ModelsRequest, 'baseUrl' | 'apiKey'> = {}) => {
      const body: ModelsRequest = { refresh: true }
      const address = extra.baseUrl ?? baseUrl
      const typed = extra.apiKey ?? apiKey
      if (address) body.baseUrl = address
      if (typed) body.apiKey = typed
      setRefreshing(true)
      try {
        client.setQueryData(key, await recipeAssistantApi.listModels(body))
        setRefreshError(undefined)
      } catch (err) {
        setRefreshError(err)
      } finally {
        setRefreshing(false)
      }
    },
    [client, key, baseUrl, apiKey],
  )

  const error = refreshError ?? query.error
  return {
    models: query.data?.models,
    source: query.data?.source,
    notice: query.data?.notice,
    /** True only while a request is running and there is no list to show yet. */
    isPending: query.isLoading,
    failed: error !== null && error !== undefined,
    errorCode: error instanceof ApiError ? error.code : undefined,
    refresh,
    refreshing,
  }
}
