// B9-54 (RES-03): what a sync of queued Ticks tells the User: "Carrot was ticked twice" (info, RES 2) and "Couldn’t sync the Tick of Carrot."
// (danger). Plain TypeScript, no React. A refusal is never silent; a Tick synced onto a Line someone already ticked keeps both Stock Lots
// (decision RES 2) and the phone whose Tick synced late is told so, with one R-E row per addition.
import type { AlsoTickedBy, Op, ScanResult } from '../../scan/types'
import { shopStrings } from '../strings'
import { clockTime } from './tickAmount'

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

const DISMISS = { id: 'dismiss' as const, label: shopStrings.dismiss }

export function tickNotices(input: TickNoticeInput): TickNotice[] {
  const byId = new Map(input.sent.map((o) => [o.clientUuid, o]))
  const out: TickNotice[] = []
  const seen = new Set<string>()
  for (const r of input.results) {
    const op = byId.get(r.clientUuid)
    if (!op || seen.has(r.clientUuid)) continue
    const notice = op.kind === 'shop_tick' ? tickNotice(r, op, input) : op.kind === 'shop_untick' ? untickNotice(r, op, input) : null
    if (!notice) continue
    seen.add(r.clientUuid)
    out.push(notice)
  }
  return out
}

function untickNotice(r: ScanResult, op: Op, input: TickNoticeInput): TickNotice | null {
  if (r.status !== 'rejected') return null
  const title = shopStrings.untickRefusedTitle(input.titleOf(op))
  return { id: op.clientUuid, kind: 'untickRefused', tone: 'danger', title, subtitle: shopStrings.untickRefusedBody, actions: [DISMISS], op }
}

function tickNotice(r: ScanResult, op: Op, input: TickNoticeInput): TickNotice | null {
  const name = input.titleOf(op)
  if (r.status === 'rejected') {
    const subtitle = r.error?.code === 'not_on_list' ? shopStrings.refusedNotOnList : shopStrings.refusedOther
    const actions = (op.quantity ?? 0) > 0 ? [{ id: 'addToStock' as const, label: shopStrings.addToStock }, DISMISS] : [DISMISS]
    return { id: op.clientUuid, kind: 'refused', tone: 'danger', title: shopStrings.refusedTitle(name), subtitle, actions, op }
  }
  // a tick of the "more since your tick" row is a second purchase on purpose: the User's own earlier additions are not news
  const before = (r.tick?.alsoTickedBy ?? []).filter((a) => !(op.more && a.mine))
  if (before.length === 0) return null
  const added = r.tick?.added ?? op.quantity ?? 0
  const n = before.length + 1
  const total = before.reduce((sum, a) => sum + a.quantity, 0) + added
  const zone = input.timeZone
  const rows: TickNoticeRow[] = before.map((a) => row(a, op, input))
  const own = zone ? shopStrings.tickedOfflineSynced(clockTime(op.scannedAt, zone), clockTime(input.now.toISOString(), zone)) : undefined
  rows.push({ key: shopStrings.you, amount: added > 0 ? input.format(op, added) : '', ...(own ? { time: own } : {}) })
  return {
    id: op.clientUuid,
    kind: 'twice',
    tone: 'info',
    title: shopStrings.tickedTwiceTitle(name, n),
    subtitle: shopStrings.lotsAddedInAll(n, input.format(op, total)),
    rows,
    actions: [{ id: 'takeMineBack', label: shopStrings.takeMineBack }, DISMISS],
    op,
  }
}

function row(a: AlsoTickedBy, op: Op, input: TickNoticeInput): TickNoticeRow {
  const who = a.mine ? shopStrings.you : a.name
  const key = a.by === 'scan' ? shopStrings.scannedBy(who) : who
  const time = input.timeZone && a.tickedAt ? clockTime(a.tickedAt, input.timeZone) : ''
  const detail = time ? (a.by === 'scan' ? shopStrings.scannedAt(time) : shopStrings.tickedAt(time)) : ''
  return { key, amount: a.quantity > 0 ? input.format(op, a.quantity) : '', ...(detail ? { time: detail } : {}) }
}
