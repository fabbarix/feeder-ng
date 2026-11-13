// The Household's Frozen Use-by (days), named under the Recipe's Frozen Use-by field. Reads the Household settings (shared key).
import { useQuery } from '@tanstack/react-query'
import { http } from '../../../lib/http'

/** 90 until the settings are read (the server's default). */
export function useHouseholdFrozenUseBy(): number {
  const q = useQuery({ queryKey: ['household', 'settings'], queryFn: () => http.get<{ frozenUseByDays?: number }>('/api/household/settings') })
  return q.data?.frozenUseByDays ?? 90
}
