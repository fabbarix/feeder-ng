import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { shopsApi } from '../api'
import type { Shop, ShopLocation } from '../types'

export interface UseShops {
  /** B9-20 (RES-02): which of the seven screen states the list is in. */
  state: ScreenState
  /** Fetches the list again (the error state's Try again). */
  refetch: () => void
  shops: Shop[]
  isLoading: boolean
  error: Error | null
  /** any User; `location` saves the Shop Location */
  add: (name: string, location?: ShopLocation | null) => Promise<Shop>
  /** any User: saves where an existing Shop is */
  setLocation: (id: number, location: ShopLocation) => Promise<Shop>
}

/** All Shops (key ['shops']); add and setLocation refresh it. */
export function useShops(): UseShops {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['shops'], queryFn: () => shopsApi.list() })
  const create = useMutation({
    mutationFn: ({ name, location }: { name: string; location?: ShopLocation | null }) => shopsApi.create(name, location),
    onSuccess: () => client.invalidateQueries({ queryKey: ['shops'] }),
  })
  const locate = useMutation({
    mutationFn: ({ id, location }: { id: number; location: ShopLocation }) => shopsApi.setLocation(id, location),
    onSuccess: () => client.invalidateQueries({ queryKey: ['shops'] }),
  })
  const state = useScreenState(query, { isEmpty: query.data?.length === 0, hasFilter: false })
  return {
    state,
    refetch: () => void query.refetch(),
    shops: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: (name, location) => create.mutateAsync({ name, location }),
    setLocation: (id, location) => locate.mutateAsync({ id, location }),
  }
}
