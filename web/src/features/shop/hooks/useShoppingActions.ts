// Mutations on the Shopping List: tick by hand, untick, manual extras. React hook; each success invalidates
// shopKeys.all and, for a tick that added a Stock Lot, ['stock']. Stubs until implemented.
import type { ExtraInput, TickResult } from '../types'

export interface ShoppingActions {
  tick(input: { ingredientId: number; to: string; quantity: number; shopId?: number | null }): Promise<TickResult>
  untick(ingredientId: number, to: string): Promise<void>
  addExtra(input: ExtraInput): Promise<void>
  deleteExtra(id: number): Promise<void>
  tickExtra(id: number, quantity: number, shopId?: number | null): Promise<TickResult>
  untickExtra(id: number): Promise<void>
}

/**
 * Every tick by hand is sent with a fresh clientUuid (lib newClientUuid), so a retried request adds one Lot.
 * A failure rejects with the ApiError (the screen shows it) and invalidates nothing.
 */
export function useShoppingActions(): ShoppingActions {
  throw new Error('not implemented')
}
