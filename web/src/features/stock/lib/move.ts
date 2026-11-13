// Moving a Stock Lot to another Storage Place: what the sheet says and what it sends. Plain TypeScript, no React.
import type { StockLot, StoragePlace } from '../types'
import { parseAmount, type AmountError } from './amount'

/** What the go-off date will do after the move (the server's rule, stock.GoOffAfterMove), for the sheet's note. */
export function moveNote(from: StoragePlace | null, to: StoragePlace | null): 'freezer' | 'thaw' | null {
  if (!to) return null
  if (to.kind === 'freezer' && from?.kind !== 'freezer') return 'freezer'
  if (from?.kind === 'freezer' && to.kind !== 'freezer') return 'thaw'
  return null
}

/** The note for this Lot's move: none for a Supply, which never goes off (household-items.md 4.2: a Freezer move changes nothing). */
export function lotMoveNote(lot: Pick<StockLot, 'kind'>, from: StoragePlace | null, to: StoragePlace | null): 'freezer' | 'thaw' | null {
  return lot.kind === 'supply' ? null : moveNote(from, to)
}

export type MoveCheck = { ok: true; quantity: number | undefined } | { ok: false; error: AmountError | 'tooMuch' }

/** The quantity to send: blank or the whole Lot = undefined (move it all); more than the Lot holds is refused. */
export function checkMoveQuantity(text: string, lot: Pick<StockLot, 'quantity'>): MoveCheck {
  if (text.trim() === '') return { ok: true, quantity: undefined }
  const amount = parseAmount(text, 'positive')
  if (!amount.ok) return amount
  if (amount.value > lot.quantity + 1e-9) return { ok: false, error: 'tooMuch' }
  return { ok: true, quantity: Math.abs(amount.value - lot.quantity) < 1e-9 ? undefined : amount.value }
}
