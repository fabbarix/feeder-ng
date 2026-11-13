// Pantry: the Storage Places (Kitchen Pantry, Garage Freezer, ...). Any User manages them. React hook.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { stockApi } from '../api'
import type { StoragePlace, StoragePlaceInput } from '../types'
import { useStockLiveUpdates } from './useStock'

export interface UseStoragePlaces {
  places: StoragePlace[]
  isLoading: boolean
  error: Error | null
  create(input: StoragePlaceInput): Promise<StoragePlace>
  update(id: number, input: StoragePlaceInput): Promise<StoragePlace>
  remove(id: number): Promise<void>
}

/** No Storage Places yet (or still loading): one array, so what is derived from it keeps between renders. */
const NO_PLACES: StoragePlace[] = []

/** Key ['stock', 'places'], so every Stock refresh refetches it; a change refreshes all of Stock (Lots lose a deleted place). */
export function useStoragePlaces(): UseStoragePlaces {
  useStockLiveUpdates()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['stock', 'places'], queryFn: () => stockApi.storagePlaces() })
  const refresh = () => client.invalidateQueries({ queryKey: ['stock'] })
  const create = useMutation({ mutationFn: (input: StoragePlaceInput) => stockApi.createPlace(input), onSuccess: refresh })
  const update = useMutation({ mutationFn: ({ id, input }: { id: number; input: StoragePlaceInput }) => stockApi.updatePlace(id, input), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: number) => stockApi.deletePlace(id), onSuccess: refresh })
  return {
    places: query.data ?? NO_PLACES,
    isLoading: query.isLoading,
    error: query.error,
    create: (input) => create.mutateAsync(input),
    update: (id, input) => update.mutateAsync({ id, input }),
    remove: async (id) => {
      await remove.mutateAsync(id)
    },
  }
}
