// The Scanned session after a receipt apply (receipt-reading.md §7.2): settle and reprice what it has, record what it gets,
// drop what was undone; a failed apply re-keys the put-back scans in place.
import { describe, expect, it } from 'vitest'
import type { ReceiptAppliedEvent } from '../../receipt/types'
import type { ScanResult } from '../types'
import { appliedClientUuids, applyReceiptToSession } from './receiptApplied'
import { buildScannedRows } from './scannedList'
import { applied, appliedScan, cheese, passata, products, queued, toiletPaper } from './scannedList.testData'

const ctx = { shopId: 1, now: '2026-11-13T18:00:00.000Z' }
const event = (over: Partial<ReceiptAppliedEvent>): ReceiptAppliedEvent => ({ readId: 'rd-1', applied: 1, failed: false, results: [], undone: [], ...over })
const result = (uuid: string, p: typeof passata, over: Partial<ScanResult['scan']> = {}, status: ScanResult['status'] = 'applied'): ScanResult => ({
  clientUuid: uuid,
  status,
  scan: appliedScan(p, over),
})

describe('appliedClientUuids', () => {
  it('lists the applied scans, never a queued or a rejected one', () => {
    const rejected = { ...applied('u3', passata), result: { clientUuid: 'u3', status: 'rejected' as const } }
    expect(appliedClientUuids([applied('u1', passata), queued('u2', toiletPaper), rejected])).toEqual(['u1'])
  })
})

describe('applyReceiptToSession: a successful apply', () => {
  it('reprices the scans the session has, on the Op and the Result', () => {
    const entries = [applied('u1', passata), applied('u2', passata)]
    const out = applyReceiptToSession(entries, event({ results: [result('u1', passata, { priceCents: 135 }), result('u2', passata, { priceCents: 135 })] }), ctx)
    expect(out.map((e) => [e.op.clientUuid, e.op.priceCents, e.result?.scan?.priceCents])).toEqual([
      ['u1', 135, 135],
      ['u2', 135, 135],
    ])
    const [row] = buildScannedRows(out, products)
    expect(row!.totalCents).toBe(270)
  })

  it('records a scan it did not have (an Add) as a new entry, a row of its own', () => {
    const entries = [applied('u1', passata, {}, { priceCents: 129 })]
    const add = result('receipt:rd-1:0', toiletPaper, { priceCents: 449, productCreated: true })
    const out = applyReceiptToSession(entries, event({ results: [add] }), ctx)
    expect(out).toHaveLength(2)
    expect(out[1]!.op).toEqual({ clientUuid: 'receipt:rd-1:0', scannedAt: ctx.now, kind: 'shop_scan', shopId: 1, productId: toiletPaper.id, quantity: 9, priceCents: 449 })
    expect(out[1]!.result).toBe(add)
    expect(buildScannedRows(out, products).map((r) => r.name)).toEqual([passata.name, toiletPaper.name])
  })

  it('one more scan of a Product joins its row (×2 → ×3)', () => {
    const entries = [applied('u1', passata, { priceCents: 129 }, { priceCents: 129 }), applied('u2', passata, { priceCents: 129 }, { priceCents: 129 })]
    const out = applyReceiptToSession(entries, event({ results: [result('receipt:rd-1:0', passata, { priceCents: 129 })] }), ctx)
    const rows = buildScannedRows(out, products)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.count).toBe(3)
  })

  it('drops the undone scans (a Remove, fewer scans)', () => {
    const entries = [applied('u1', passata), applied('u2', passata), applied('u3', toiletPaper)]
    const out = applyReceiptToSession(entries, event({ undone: ['u2', 'u3'] }), ctx)
    expect(out.map((e) => e.op.clientUuid)).toEqual(['u1'])
  })

  it('a weighed scan at another weight replaces the old one and stays weighed, with the per kg its Price implies', () => {
    const entries = [applied('u1', cheese, { quantity: 300, weighed: true, priceCents: 600, pricePerKgCents: 2000 }, { quantity: 300, priceCents: 600 })]
    const out = applyReceiptToSession(entries, event({ results: [result('receipt:rd-1:0', cheese, { quantity: 312, priceCents: 624 })], undone: ['u1'] }), ctx)
    expect(out.map((e) => e.op.clientUuid)).toEqual(['receipt:rd-1:0'])
    expect(out[0]!.op).toMatchObject({ weighed: true, pricePerKgCents: 2000, quantity: 312, priceCents: 624 })
    const [row] = buildScannedRows(out, products)
    expect(row).toMatchObject({ weighed: true, weight: 312, totalCents: 624 })
  })

  it('leaves out a rejected Result, and a scan both made and undone by the apply', () => {
    const entries = [applied('u1', passata)]
    const out = applyReceiptToSession(
      entries,
      event({ results: [result('receipt:rd-1:0', passata, {}, 'rejected'), result('receipt:rd-1:1', passata)], undone: ['receipt:rd-1:1'] }),
      ctx,
    )
    expect(out.map((e) => e.op.clientUuid)).toEqual(['u1'])
  })

  it('never mutates its input', () => {
    const entries = [applied('u1', passata)]
    const copy = structuredClone(entries)
    applyReceiptToSession(entries, event({ results: [result('u1', passata, { priceCents: 99 })], undone: ['u1'] }), ctx)
    expect(entries).toEqual(copy)
  })
})

describe('applyReceiptToSession: a failed apply (put back)', () => {
  it('re-keys each put-back scan in place: receipt:<readId>:undo:<orig> replaces the original', () => {
    const entries = [applied('u1', passata), applied('u2', toiletPaper), applied('u3', passata)]
    const back = result('receipt:rd-1:undo:u2', toiletPaper)
    const out = applyReceiptToSession(entries, event({ failed: true, applied: 0, results: [back] }), ctx)
    expect(out.map((e) => e.op.clientUuid)).toEqual(['u1', 'receipt:rd-1:undo:u2', 'u3'])
    expect(out[1]!.result).toBe(back)
    expect(out[1]!.op.productId).toBe(toiletPaper.id)
  })

  it('takes a #n suffix too, and keeps everything else as it was', () => {
    const entries = [applied('u1', passata, {}, { priceCents: 129 })]
    const out = applyReceiptToSession(entries, event({ failed: true, applied: 0, results: [result('receipt:rd-1:undo:u1#2', passata, { priceCents: 129 })] }), ctx)
    expect(out.map((e) => e.op.clientUuid)).toEqual(['receipt:rd-1:undo:u1#2'])
  })

  it('an empty put-back changes nothing', () => {
    const entries = [applied('u1', passata)]
    expect(applyReceiptToSession(entries, event({ failed: true, applied: 0, results: [] }), ctx)).toEqual(entries)
  })
})
