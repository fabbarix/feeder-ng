// B9-54 (RES-03): what a sync of queued Ticks tells the User: "Carrot was ticked twice" (info, RES 2) and "Couldn’t sync the Tick of Carrot."
// (danger). Plain TypeScript, no React. STUB (test author): the types the tests pin; the developer writes the body.
import type { Op, ScanResult } from '../../scan/types'

export type TickNoticeAction = 'takeMineBack' | 'addToStock' | 'dismiss'

export interface TickNoticeRow {
  key: string
  amount: string
  time?: string
}

export interface TickNotice {
  /** the client id of the Tick the notice is about: a result seen twice (a retry's `duplicate`) is one notice */
  id: string
  kind: 'twice' | 'refused' | 'untickRefused'
  tone: 'info' | 'danger'
  title: string
  subtitle?: string
  rows?: TickNoticeRow[]
  /** the buttons in order, as { id, label } */
  actions: { id: TickNoticeAction; label: string }[]
  /** the queued Op the notice answers (Add to Stock re-sends its amount; Take mine back takes its addition) */
  op: Op
}

export interface TickNoticeInput {
  results: readonly ScanResult[]
  /** FlushResult.sent: the Ops of the flush, in order */
  sent: readonly Op[]
  /** the Line's name as the phone's list shows it ("Carrot"); '' when it is not known */
  titleOf: (op: Op) => string
  /** an amount in the Line's unit and the User's unit system ("50 g") */
  format: (op: Op, quantity: number) => string
  /** the Household's IANA zone; null while unknown: no times are shown (never the device's) */
  timeZone: string | null
  /** the instant the sync answered, for "synced 10:31" */
  now: Date
}

export function tickNotices(_input: TickNoticeInput): TickNotice[] {
  return []
}
