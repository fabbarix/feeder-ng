import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shopsApi } from '../api'
import type { Shop } from '../types'

export interface UseShops {
  shops: Shop[]
  isLoading: boolean
  error: Error | null
  add: (name: string) => Promise<Shop>
}

/** All Shops (key ['shops']); add refreshes it. */
export function useShops(): UseShops {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['shops'], queryFn: () => shopsApi.list() })
  const create = useMutation({
    mutationFn: (name: string) => shopsApi.create(name),
    onSuccess: () => client.invalidateQueries({ queryKey: ['shops'] }),
  })
  return {
    shops: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add: (name) => create.mutateAsync(name),
  }
}
