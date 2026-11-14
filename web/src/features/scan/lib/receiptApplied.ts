// What a receipt apply does to the Scanned session (receipt-reading.md §7.2): the apply's Results and undone uuids, mapped
// onto the session entries through SR3's settle, reprice, record and drop. Pure TypeScript, no React.
import { splitApplyResults } from '../../receipt/lib/applyResults'
import type { ReceiptAppliedEvent } from '../../receipt/types'
import type { Op, ScanResult } from '../types'
import { dropEntries, recordEntry, repriceEntries, settleEntries, type PriceUpdate, type SessionEntry } from './scannedList'

export interface ReceiptAppliedContext {
  /** the Shop of the session */
  shopId: number
  /** RFC 3339 instant for the Op of a scan the session did not have */
  now: string
}

/** The uuids of the session's applied scans (not queued, not rejected): what a receipt read starts from and an apply is checked against. */
export function appliedClientUuids(entries: SessionEntry[]): string[] {
  return entries.filter((e) => e.result !== null && e.result.status !== 'rejected').map((e) => e.op.clientUuid)
}

/** The Op a scan the phone never sent is recorded under: a shop_scan of the Result's Product, quantity and Price. */
function opOf(result: ScanResult, ctx: ReceiptAppliedContext, like?: Op): Op {
  const scan = result.scan!
  const op: Op = { clientUuid: result.clientUuid, scannedAt: ctx.now, kind: 'shop_scan', shopId: ctx.shopId, productId: scan.productId, quantity: scan.quantity }
  if (scan.priceCents !== null) op.priceCents = scan.priceCents
  // A weighed scan scanned again at another weight stays weighed; its Price per kg is the one its Price implies.
  const weighed = like !== undefined && like.productId === scan.productId && (like.weighed === true || like.pricePerKgCents !== undefined)
  if (weighed) {
    op.weighed = true
    if (scan.priceCents !== null && scan.quantity > 0) op.pricePerKgCents = Math.round((scan.priceCents * 1000) / scan.quantity)
  }
  return op
}

const usable = (r: ScanResult): boolean => r.status !== 'rejected' && r.scan !== undefined

/**
 * A successful apply: a scan the session has takes its Result (settle) and its new Price (reprice); a scan it does not have
 * (an Add, one more scan, a scan at another weight, Shop or date) becomes a new entry; the undone scans leave it.
 */
function applySuccess(entries: SessionEntry[], event: ReceiptAppliedEvent, ctx: ReceiptAppliedContext): SessionEntry[] {
  const known = new Set(entries.map((e) => e.op.clientUuid))
  const results = event.results.filter(usable)
  const undone = event.undone ?? []
  const byUuid = new Map(entries.map((e) => [e.op.clientUuid, e]))
  let out = settleEntries(entries, results.filter((r) => known.has(r.clientUuid)))
  const prices: PriceUpdate[] = results
    .filter((r) => known.has(r.clientUuid) && r.scan!.priceCents !== null)
    .map((r) => ({ clientUuid: r.clientUuid, priceCents: r.scan!.priceCents! }))
  out = repriceEntries(out, prices)
  const replaced = undone.map((u) => byUuid.get(u)?.op).filter((op): op is Op => op !== undefined)
  for (const r of results) {
    if (known.has(r.clientUuid)) continue
    out = recordEntry(out, opOf(r, ctx, replaced.find((op) => op.productId === r.scan!.productId)), r)
  }
  return dropEntries(out, undone)
}

/**
 * A failed apply that was put back: each scan the plan had undone is back under `receipt:<readId>:undo:<orig>`, which takes the
 * original's place (same Op, the new uuid, the new Result). Nothing else in the session changed.
 */
function applyFailure(entries: SessionEntry[], event: ReceiptAppliedEvent, ctx: ReceiptAppliedContext): SessionEntry[] {
  const { replacements, others } = splitApplyResults(event.results.filter(usable))
  const byOriginal = new Map(replacements.map((r) => [r.replaces, r.result]))
  const placed = new Set<string>()
  let out = entries.map((entry) => {
    const result = byOriginal.get(entry.op.clientUuid)
    if (!result) return entry
    placed.add(entry.op.clientUuid)
    return { op: { ...entry.op, clientUuid: result.clientUuid }, result }
  })
  const known = new Set(out.map((e) => e.op.clientUuid))
  for (const { replaces, result } of replacements) {
    if (!placed.has(replaces) && !known.has(result.clientUuid)) out = recordEntry(out, opOf(result, ctx), result)
  }
  for (const result of others) {
    if (!known.has(result.clientUuid)) out = recordEntry(out, opOf(result, ctx), result)
  }
  return out
}

/** The session after a receipt apply. Never mutates its input. */
export function applyReceiptToSession(entries: SessionEntry[], event: ReceiptAppliedEvent, ctx: ReceiptAppliedContext): SessionEntry[] {
  return event.failed ? applyFailure(entries, event, ctx) : applySuccess(entries, event, ctx)
}
