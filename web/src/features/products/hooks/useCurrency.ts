import { useQuery } from '@tanstack/react-query'
import { http } from '../../../lib/http'

/** The Household's Currency (ISO 4217) from /api/household/settings (team T1), key ['household','settings']; 'USD' while loading or on failure. */
export function useCurrency(): string {
  const query = useQuery({
    queryKey: ['household', 'settings'],
    queryFn: () => http.get<{ currency?: string }>('/api/household/settings'),
  })
  return query.data?.currency || 'USD'
}
