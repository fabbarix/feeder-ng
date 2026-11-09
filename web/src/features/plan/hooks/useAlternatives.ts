import type { Alternative, SlotKey } from '../types'

export interface UseAlternatives {
  alternatives: Alternative[]
  isLoading: boolean
  error: Error | null
}

/** GET .../alternatives for the slot; idle (no request) while key is null. */
export function useAlternatives(key: SlotKey | null): UseAlternatives {
  void key
  return { alternatives: [], isLoading: false, error: null }
}
