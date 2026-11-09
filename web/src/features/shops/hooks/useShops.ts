import type { Shop } from '../types'

export interface UseShops {
  shops: Shop[]
  isLoading: boolean
  error: Error | null
  add: (name: string) => Promise<Shop>
}

/** All Shops (key ['shops']); add refreshes it. */
export function useShops(): UseShops {
  throw new Error('TODO')
}
