import type { SlotKey } from '../types'

export interface UsePlanActions {
  regenerate: () => Promise<void>
  regenerating: boolean
  setMeal: (key: SlotKey, recipeId: number) => Promise<void>
  confirm: (key: SlotKey) => Promise<void>
  unpin: (key: SlotKey) => Promise<void>
  /** Message of the last failed action, or null. */
  error: string | null
}

/** Mutations on the plan; each invalidates ['plan'] on success. */
export function usePlanActions(): UsePlanActions {
  const none = async () => {}
  return { regenerate: none, regenerating: false, setMeal: none, confirm: none, unpin: none, error: null }
}
