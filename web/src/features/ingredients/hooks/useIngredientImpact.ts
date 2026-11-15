// B9-48 (SAFE-02): the impact read behind the Delete confirm, fetched only while asked for (the confirm is open).
import { useQuery } from '@tanstack/react-query'
import { ingredientsApi } from '../api'
import type { IngredientImpact } from '../types'

export interface UseIngredientImpact {
  /** undefined until the read comes back, and after a failed read (the confirm then makes no claim about its use). */
  impact: IngredientImpact | undefined
  isLoading: boolean
}

export function useIngredientImpact(id: number, enabled: boolean): UseIngredientImpact {
  const query = useQuery({
    queryKey: ['ingredients', id, 'impact'],
    queryFn: () => ingredientsApi.impact(id),
    enabled,
    // Always read afresh when the confirm opens: the point is to catch what changed since the page loaded.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  return { impact: enabled ? query.data : undefined, isLoading: enabled && query.isLoading }
}
