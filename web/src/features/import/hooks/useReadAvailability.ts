import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useMe } from '../../../app/useMe'
import { importApi } from '../api'
import { availabilityOf, type ReadAvailability } from '../lib/readAvailability'

export type UseReadAvailability = ReadAvailability & {
  /** Fetches the status again (after "Could not check the Recipe Assistant", and when a read starts or ends: the count changed). */
  retry: () => void
}

/**
 * GET /api/recipe-assistant/status (react-query, key ['recipe-assistant','status'], fresh for 30 s, refetched on focus)
 * through lib/readAvailability, with the signed-in User's role from useMe.
 */
export function useReadAvailability(): UseReadAvailability {
  const me = useMe()
  const status = useQuery({
    queryKey: ['recipe-assistant', 'status'],
    queryFn: importApi.assistantStatus,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
  const { data, isError, refetch } = status
  const isAdmin = me.data?.isAdmin === true
  const availability = useMemo(() => availabilityOf(data, { isAdmin, failed: isError && !data }), [data, isAdmin, isError])
  return { ...availability, retry: () => void refetch() }
}
