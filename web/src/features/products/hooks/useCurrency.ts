import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../../settings/api'
import { settingsKeys } from '../../settings/hooks/queryKeys'

/** The Household's Currency (ISO 4217) through T1's settingsApi, cached under settingsKeys.settings; 'USD' while loading or on failure. */
export function useCurrency(): string {
  const query = useQuery({
    queryKey: settingsKeys.settings,
    queryFn: () => settingsApi.getSettings(),
  })
  return query.data?.currency || 'USD'
}
