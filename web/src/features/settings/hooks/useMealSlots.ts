import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { settingsApi } from '../api'
import type { MealSlot, MealSlotInput, SlotBatchRequest, SlotBatchResult } from '../types'
import { settingsKeys } from './queryKeys'

export interface MealSlotsState {
  /** B9-20 (RES-02): the page's screen state; offline and never loaded is offlineUnknown, never an empty or default page. */
  state: ScreenState
  /** Fetches again (the error state's Try again). */
  refetch: () => void
  slots: MealSlot[]
  isPending: boolean
  isError: boolean
  create: (input: MealSlotInput) => Promise<MealSlot>
  update: (id: number, input: MealSlotInput) => Promise<MealSlot>
  remove: (id: number) => Promise<void>
  /** R15: edit every Meal Slot with the same name on several weekdays in one call. */
  batchUpdate: (request: SlotBatchRequest) => Promise<SlotBatchResult>
  /** CRS D2: PATCH the batch request as given (`useSlotPreview` sets `dryRun: true`): nothing is written and nothing is refetched; the answer has `removes`. */
  preview: (request: SlotBatchRequest) => Promise<SlotBatchResult>
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
  const state = useScreenState(query, { isEmpty: query.data?.length === 0, hasFilter: false })
  return {
    state,
    refetch: () => void query.refetch(),
    slots: query.data ?? NO_SLOTS,
    isPending: query.isPending,
    isError: query.isError,
    create: create.mutateAsync,
    update: (id, input) => update.mutateAsync({ id, input }),
    remove: remove.mutateAsync,
    batchUpdate: batch.mutateAsync,
    preview: (request) => settingsApi.batchUpdateMealSlots(request),
    saving: create.isPending || update.isPending || remove.isPending || batch.isPending,
  }
}
