// SSP-05 / SSP 4: the one Restock reason for Shop, Pantry and Supplies. Stub: the developer implements it from lib/restock.test.ts.
import type { BaseUnit, UnitSystem } from './units'

export interface RestockReason {
  /** The full text. */
  long: string
  /** The short form shown in a text column under 12 rem; '' when the long text has no shorter form. */
  compact: string
}

export interface RestockReasonOptions {
  /** False on a Pantry Stock Lot, whose quantity is in the value column: a reason that is not below the level then leaves the Stock out. Default true. */
  stockInReason?: boolean
}

/** True when Stock is under the Restock level (at the level is not below). Float dust counts as 0. */
export function isBelowLevel(_stock: number, _level: number): boolean {
  throw new Error('not implemented')
}

export function restockReason(_stock: number, _level: number, _base: BaseUnit, _system: UnitSystem, _opts: RestockReasonOptions = {}): RestockReason {
  throw new Error('not implemented')
}
