import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../api'
import type { MealSlot, MealSlotInput, SlotBatchRequest, SlotBatchResult } from '../types'
import { settingsKeys } from './queryKeys'

export interface MealSlotsState {
  slots: MealSlot[]
  isPending: boolean
  isError: boolean
  create: (input: MealSlotInput) => Promise<MealSlot>
  update: (id: number, input: MealSlotInput) => Promise<MealSlot>
  remove: (id: number) => Promise<void>
  /** R15: edit every Meal Slot with the same name on several weekdays in one call. */
  batchUpdate: (request: SlotBatchRequest) => Promise<SlotBatchResult>
  saving: boolean
}

const NO_SLOTS: MealSlot[] = []

export function useMealSlots(): MealSlotsState {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: settingsKeys.slots, queryFn: settingsApi.listMealSlots })
  const refresh = () => queryClient.invalidateQueries({ queryKey: settingsKeys.slots })
  const create = useMutation({ mutationFn: settingsApi.createMealSlot, onSuccess: refresh })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: MealSlotInput }) => settingsApi.updateMealSlot(id, input),
    onSuccess: refresh,
  })
  const batch = useMutation({ mutationFn: settingsApi.batchUpdateMealSlots, onSuccess: refresh })
  const remove = useMutation({ mutationFn: settingsApi.deleteMealSlot, onSuccess: refresh })
  return {
    slots: query.data ?? NO_SLOTS,
    isPending: query.isPending,
    isError: query.isError,
    create: create.mutateAsync,
    update: (id, input) => update.mutateAsync({ id, input }),
    remove: remove.mutateAsync,
    batchUpdate: batch.mutateAsync,
    saving: create.isPending || update.isPending || remove.isPending || batch.isPending,
  }
}
