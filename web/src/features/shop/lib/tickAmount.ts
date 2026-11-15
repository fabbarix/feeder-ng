// B9-34 (SSP-01, SSP-02, SSP-18): what a tick by hand adds and says. Plain TypeScript, no React. TEST-AUTHOR STUB: the developer writes the bodies.
import type { UnitSystem } from '../../../lib/units'
import type { BaseUnit, LineTick, PackSuggestion, TickAddition } from '../types'
import type { ListEntry } from './lines'

const todo = (): never => {
  throw new Error('not implemented (B9-34)')
}

/** The amount one tap ticks with. */
export function defaultTickAmount(_line: { quantity: number; more?: number; ticked: boolean; pack: PackSuggestion | null }): number {
  return todo()
}

export type TickMetaTone = 'success' | 'muted'
export type TickMetaIcon = 'stock' | 'notAdded' | 'scan'

/** What a ticked row's one meta line says. `compact` is the shorter form for a narrow text column; '' when there is none. */
export interface TickedMeta {
  text: string
  compact: string
  tone: TickMetaTone
  icon: TickMetaIcon
}

export function tickedMeta(_tick: LineTick | null | undefined, _baseUnit: BaseUnit, _system: UnitSystem): TickedMeta | null {
  return todo()
}

/** What the Change sheet offers besides Other amount. */
export interface TickChoices {
  pack: { label: string; amount: number } | null
  need: { amount: number } | null
}
export function tickChoices(_entry: ListEntry, _system: UnitSystem): TickChoices {
  return todo()
}

/** The viewer's own hand addition that Change acts on (the latest), with the entry it belongs to; null when there is none. */
export interface ChangeTarget {
  entry: ListEntry
  /** Base Units the tick added; 0 when none */
  added: number
  /** ISO instant */
  tickedAt: string
  clientUuid: string | null
}
export function changeTargetOf(_entry: ListEntry): ChangeTarget | null {
  return todo()
}

/** The text of an addition's detail line: "Ticked at 10:12 · Not sorted" (hand) or "Scanned at 10:12" (scan), in the Household zone. */
export function additionDetail(_addition: TickAddition, _timeZone: string): string {
  return todo()
}

export type TickPlan =
  | { kind: 'line'; request: { ingredientId: number; to: string; quantity: number; shopId: number | null; clientUuid: string } }
  | { kind: 'extra'; request: { extraId: number; quantity: number; shopId: number | null; clientUuid: string } }

/** The pure "what to send" step of a tick (B9-54 routes the same plan through the offline queue). Null when the entry cannot be ticked. */
export function planTick(_entry: ListEntry, _ctx: { to: string; shopId: number | null; clientUuid: string }): TickPlan | null {
  return todo()
}
