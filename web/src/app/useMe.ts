import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ApiError, http } from '../lib/http'
import { clearCachedMe, readCachedMe, writeCachedMe } from './meCache'

export interface Me {
  id: number
  email: string
  displayName: string
  isAdmin: boolean
  /** the Household's IANA zone (GET /api/me householdTimeZone, B9-12); absent in a copy kept by an older build */
  householdTimeZone?: string
}

export const ME_QUERY_KEY = ['me'] as const

/** B9-20: while a first launch cannot reach the server, /api/me is asked again this often. */
export const ME_RECOVERY_MS = 5000

/**
 * The signed-in User, or null when signed out (401, which also forgets the remembered User). When the network is down
 * (status 0) the last remembered User answers so the shell opens offline; other failures are errors.
 * B9-20: the remembered User is the starting data (stale at once, so /api/me is still asked), so the shell opens from the
 * first frame and a failing or hanging /api/me never replaces it. No automatic retry: with nothing remembered the error
 * shows at once and is asked again every ME_RECOVERY_MS.
 */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ME_QUERY_KEY,
    // 'always': the offline shell must try (and fall back to the remembered User), not wait for navigator.onLine.
    networkMode: 'always',
    retry: false,
    initialData: () => readCachedMe() ?? undefined,
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => (query.state.status === 'error' && query.state.data === undefined ? ME_RECOVERY_MS : false),
    queryFn: async () => {
      try {
        const me = await http.get<Me>('/api/me')
        writeCachedMe(me)
        return me
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearCachedMe()
          return null
        }
        if (err instanceof ApiError && err.status === 0 && err.code !== 'timeout') {
          const cached = readCachedMe()
          if (cached) return cached
        }
        throw err
      }
    },
  })
}

/** B9-20: when the connection returns while /api/me has nothing to show, ask again at once instead of at the next tick. */
export function useRecoverMeOnline(me: UseQueryResult<Me | null>) {
  const waiting = me.isError && me.data === undefined
  const { refetch } = me
  useEffect(() => {
    if (!waiting) return
    const again = () => void refetch()
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [waiting, refetch])
}
