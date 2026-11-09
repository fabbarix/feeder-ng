import { useQuery } from '@tanstack/react-query'
import { ApiError, http } from '../lib/http'

export interface Me {
  id: number
  email: string
  displayName: string
  isAdmin: boolean
}

export const ME_QUERY_KEY = ['me'] as const

/** The signed-in User, or null when signed out (401). Other failures are errors. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await http.get<Me>('/api/me')
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
  })
}
