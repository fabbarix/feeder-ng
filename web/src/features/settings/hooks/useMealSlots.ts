import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { settingsApi } from '../api'
import type { RemovedMealSlotGroup } from '../lib/removedMealSlots'
import type { MealSlotImpact } from '../lib/slotRemoval'
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
  /** SAFE-02: what removing the Meal Slot takes away, read before the confirm. */
  impact: (id: number) => Promise<MealSlotImpact>
  /** SAFE-02 Undo and SET-15 Put back: one removed Meal Slot back. */
  restore: (id: number) => Promise<MealSlot>
  /** SET-15: the removed Meal Slots that kept Cooked history ([] until loaded or when the read fails). */
  removed: RemovedMealSlotGroup[]
  /** R15: edit every Meal Slot with the same name on several weekdays in one call. */
  batchUpdate: (request: SlotBatchRequest) => Promise<SlotBatchResult>
  /** CRS D2: PATCH the batch request as given (`useSlotPreview` sets `dryRun: true`): nothing is written and nothing is refetched; the answer has `removes`. */
  preview: (request: SlotBatchRequest) => Promise<SlotBatchResult>
  saving: boolean
}

const NO_SLOTS: MealSlot[] = []
const NO_REMOVED: RemovedMealSlotGroup[] = []

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
  const restore = useMutation({ mutationFn: settingsApi.restoreMealSlot, onSuccess: refresh })
  // SET-15: a tile of its own; a failed read only leaves the tile out (the cards are the page).
  const removed = useQuery({ queryKey: settingsKeys.removedSlots, queryFn: settingsApi.listRemovedMealSlots })
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
    impact: (id) => settingsApi.mealSlotImpact(id),
    restore: restore.mutateAsync,
    removed: removed.data ?? NO_REMOVED,
    batchUpdate: batch.mutateAsync,
    preview: (request) => settingsApi.batchUpdateMealSlots(request),
    saving: create.isPending || update.isPending || remove.isPending || batch.isPending,
  }
}
