import { useQuery } from '@tanstack/react-query'
import { ApiError, http } from '../lib/http'
import { clearCachedMe, readCachedMe, writeCachedMe } from './meCache'

export interface Me {
  id: number
  email: string
  displayName: string
  isAdmin: boolean
}

export const ME_QUERY_KEY = ['me'] as const

/**
 * The signed-in User, or null when signed out (401, which also forgets the remembered User). When the network is down
 * (status 0) the last remembered User answers so the shell opens offline; other failures are errors.
 */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ME_QUERY_KEY,
    // 'always': the offline shell must try (and fall back to the remembered User), not wait for navigator.onLine.
    networkMode: 'always',
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
        if (err instanceof ApiError && err.status === 0) {
          const cached = readCachedMe()
          if (cached) return cached
        }
        throw err
      }
    },
  })
}
