import type { MealSlot, MealSlotInput } from '../types'

export interface MealSlotsState {
  slots: MealSlot[]
  isPending: boolean
  isError: boolean
  create: (input: MealSlotInput) => Promise<MealSlot>
  update: (id: number, input: MealSlotInput) => Promise<MealSlot>
  remove: (id: number) => Promise<void>
  saving: boolean
}

export function useMealSlots(): MealSlotsState {
  throw new Error('not implemented')
}
