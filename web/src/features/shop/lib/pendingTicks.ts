// B9-54 (RES-03): Ticks by hand waiting in the offline queue, as the Shop shows them. Plain TypeScript, no React.
// STUB (test author): the signatures the tests pin; the developer writes the bodies.
import type { Op } from '../../scan/types'
import type { ShoppingList } from '../types'
import type { TickPlan } from './tickAmount'

/** The shop_tick Op for a tick plan (lib/tickAmount planTick): the plan's client id is the Op's, `covers` is the quantity the phone showed. */
export function tickOp(_plan: TickPlan, _ctx: { covers: number; scannedAt: string; more?: boolean }): Op {
  throw new Error('not implemented')
}

/** The shop_untick Op that takes one addition (a synced Tick) off its Line. */
export function untickAdditionOp(_ctx: { clientUuid: string; scannedAt: string; tickClientUuid: string }): Op {
  throw new Error('not implemented')
}

/** The shop_untick Op that unticks a whole Line (every hand addition) for the range. */
export function untickLineOp(_ctx: { clientUuid: string; scannedAt: string; ingredientId: number; rangeTo: string }): Op {
  throw new Error('not implemented')
}

/** Is this Op a Tick by hand (shop_tick or shop_untick)? The shell counts these apart from Scans. */
export function isTickOp(_op: Op): boolean {
  return false
}

/** How many queued Ops are Scans and how many are Ticks (a shop_untick counts as a Tick). */
export function countPending(_ops: readonly Op[]): { scans: number; ticks: number } {
  return { scans: 0, ticks: 0 }
}

/** The list as the phone shows it with the queued Ticks applied; never mutates `list`. */
export function applyPending(list: ShoppingList, _ops: readonly Op[], _ctx: { who: string }): ShoppingList {
  return list
}

/** The keys ("line:<ingredientId>", "extra:<id>") of the entries a refused Tick belongs to. */
export function failedKeys(_ops: readonly Op[]): Set<string> {
  return new Set()
}
