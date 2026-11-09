import { useQuery } from '@tanstack/react-query'
import { planApi } from '../api'
import type { Alternative, SlotKey } from '../types'

export interface UseAlternatives {
  alternatives: Alternative[]
  isLoading: boolean
  error: Error | null
}

const NONE: Alternative[] = []

/** GET .../alternatives for the slot; idle (no request) while key is null. */
export function useAlternatives(key: SlotKey | null): UseAlternatives {
  const q = useQuery({
    queryKey: ['plan', 'alternatives', key?.date, key?.mealSlotId],
    queryFn: () => planApi.alternatives(key!),
    enabled: key !== null,
    gcTime: 0,
  })
  return { alternatives: q.data?.alternatives ?? NONE, isLoading: key !== null && q.isLoading, error: q.error }
}
