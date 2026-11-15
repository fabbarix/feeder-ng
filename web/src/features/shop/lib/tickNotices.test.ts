// B9-54 (RES-03, decision RES 2): what the phone whose Tick synced late is told, and what a refused Tick says. Pure.
//   twice    an info notice, kept until dismissed: "Carrot was ticked twice" (3: "Carrot was ticked 3 times"), subline "Both Stock Lots were added · 100 g in all"
//            (3: "All 3 Stock Lots were added · 150 g in all"), one row per addition, oldest first, this Tick last: key "Sam" / "You"
//            ("Sam scanned" for a Scan), the amount, and the time muted ("Ticked at 10:12", "Scanned at 10:12"; this Tick: "Ticked offline at
//            10:20 · synced 10:31"); actions Take mine back, Dismiss. Only when the server's `alsoTickedBy` names an addition, except that a
//            tick of the "more since your tick" row (Op.more) is not "twice" for the User's own earlier additions (a second purchase on purpose).
//   refused  a danger notice "Couldn’t sync the Tick of Carrot." with "It is no longer on the Shopping List for this range. Its Stock Lot was not
//            added." for `not_on_list` (other codes: "Its Stock Lot was not added."); actions Add to Stock, Dismiss; with no amount in the Tick,
//            Dismiss only (nothing to add).
//   untickRefused  a refused shop_untick: "Couldn’t sync taking Carrot off." with "Its tick is still there.", Dismiss only (a refusal is never silent).
//   A result for a Scan, an `applied` Tick with nobody before it, and a Tick the User cannot be told about (no zone: rows have no times) behave as said.
import { describe, expect, it } from 'vitest'
import type { Op, ScanResult } from '../../scan/types'
import { tickNotices, type TickNoticeInput } from './tickNotices'

const NOW = new Date('2026-11-14T10:31:00Z')
const tick = (over: Partial<Op> = {}): Op => ({
  clientUuid: 'c-1',
  scannedAt: '2026-11-14T10:20:00Z',
  kind: 'shop_tick',
  shopId: 1,
  ingredientId: 9,
  rangeTo: '2026-11-15',
  quantity: 50,
  covers: 50,
  ...over,
})
const applied = (uuid: string, alsoTickedBy: NonNullable<ScanResult['tick']>['alsoTickedBy'] = [], over: Partial<ScanResult> = {}): ScanResult => ({
  clientUuid: uuid,
  status: 'applied',
  tick: { lotId: 5, added: 50, alsoTickedBy },
  ...over,
})
const sam = { name: 'Sam', quantity: 50, by: 'hand' as const, mine: false, tickedAt: '2026-11-14T10:12:00Z' }
const run = (over: Partial<TickNoticeInput> & Pick<TickNoticeInput, 'results' | 'sent'>) =>
  tickNotices({ titleOf: () => 'Carrot', format: (_op, q) => `${q} g`, timeZone: 'UTC', now: NOW, ...over })

describe('ticked twice (RES 2)', () => {
  const notices = () => run({ results: [applied('c-1', [sam])], sent: [tick()] })

  it('one info notice, titled and sublined as the chapter says', () => {
    const [n] = notices()
    expect(notices()).toHaveLength(1)
    expect(n).toMatchObject({ id: 'c-1', kind: 'twice', tone: 'info', title: 'Carrot was ticked twice', subtitle: 'Both Stock Lots were added · 100 g in all' })
  })

  it('rows: the earlier addition first, this Tick last as "You", with the times in the Household zone', () => {
    expect(notices()[0]!.rows).toEqual([
      { key: 'Sam', amount: '50 g', time: 'Ticked at 10:12' },
      { key: 'You', amount: '50 g', time: 'Ticked offline at 10:20 · synced 10:31' },
    ])
  })

  it('actions: Take mine back, then Dismiss, and the Op it answers', () => {
    const [n] = notices()
    expect(n!.actions).toEqual([
      { id: 'takeMineBack', label: 'Take mine back' },
      { id: 'dismiss', label: 'Dismiss' },
    ])
    expect(n!.op.clientUuid).toBe('c-1')
  })

  it('the same User\'s own earlier addition (their other phone) is a row "You" ticked at its time, and counts as twice', () => {
    const [n] = run({ results: [applied('c-1', [{ ...sam, name: 'Ana', mine: true }])], sent: [tick()] })
    expect(n!.title).toBe('Carrot was ticked twice')
    expect(n!.rows![0]).toEqual({ key: 'You', amount: '50 g', time: 'Ticked at 10:12' })
  })

  it('a Scan\'s addition reads "Sam scanned" and "Scanned at 10:12"', () => {
    const [n] = run({ results: [applied('c-1', [{ ...sam, by: 'scan', quantity: 700 }])], sent: [tick()] })
    expect(n!.rows![0]).toEqual({ key: 'Sam scanned', amount: '700 g', time: 'Scanned at 10:12' })
    expect(n!.subtitle).toBe('Both Stock Lots were added · 750 g in all')
  })

  it('three additions: "ticked 3 times", "All 3 Stock Lots were added · 150 g in all", three rows', () => {
    const [n] = run({ results: [applied('c-1', [sam, { ...sam, name: 'Ana', quantity: 50, tickedAt: '2026-11-14T10:15:00Z' }])], sent: [tick()] })
    expect(n!.title).toBe('Carrot was ticked 3 times')
    expect(n!.subtitle).toBe('All 3 Stock Lots were added · 150 g in all')
    expect(n!.rows).toHaveLength(3)
  })

  it('a Duplicate answer (the first answer was lost) tells it once under the same id', () => {
    const a = run({ results: [applied('c-1', [sam], { status: 'duplicate' })], sent: [tick()] })
    const b = run({ results: [applied('c-1', [sam])], sent: [tick()] })
    expect(a).toHaveLength(1)
    expect(a[0]!.id).toBe(b[0]!.id)
  })

  it('nobody before it: no notice. A Tick of the more-since-your-tick row after the User\'s own earlier one: no notice (a second purchase on purpose)', () => {
    expect(run({ results: [applied('c-1', [])], sent: [tick()] })).toEqual([])
    expect(run({ results: [applied('c-1', [{ ...sam, name: 'Ana', mine: true }])], sent: [tick({ more: true })] })).toEqual([])
  })

  it('a More tick after ANOTHER User\'s addition is still ticked twice', () => {
    expect(run({ results: [applied('c-1', [sam])], sent: [tick({ more: true })] })).toHaveLength(1)
  })

  it('without a Household zone the rows carry no times (never the device\'s)', () => {
    const [n] = run({ results: [applied('c-1', [sam])], sent: [tick()], timeZone: null })
    expect(n!.rows!.every((r) => r.time === undefined)).toBe(true)
  })

  it('a Scan\'s result and a result with no Op in `sent` make no notice', () => {
    expect(run({ results: [applied('s-1', [sam])], sent: [{ clientUuid: 's-1', scannedAt: '2026-11-14T10:20:00Z', kind: 'shop_scan' }] })).toEqual([])
    expect(run({ results: [applied('zzz', [sam])], sent: [tick()] })).toEqual([])
  })
})

describe('a refused Tick', () => {
  const refused = (code: string): ScanResult => ({ clientUuid: 'c-1', status: 'rejected', error: { code, message: 'x' } })

  it('not_on_list: a danger notice with Add to Stock and Dismiss', () => {
    const [n] = run({ results: [refused('not_on_list')], sent: [tick()] })
    expect(n).toMatchObject({
      id: 'c-1',
      kind: 'refused',
      tone: 'warn', // B9-55 (DS-06): a refused sync is warn, not danger
      title: 'Couldn’t sync the Tick of Carrot.',
      subtitle: 'It is no longer on the Shopping List for this range. Its Stock Lot was not added.',
    })
    expect(n!.actions).toEqual([
      { id: 'addToStock', label: 'Add to Stock' },
      { id: 'dismiss', label: 'Dismiss' },
    ])
    expect(n!.op.quantity).toBe(50)
  })

  it('any other refusal still says the Stock Lot was not added', () => {
    const [n] = run({ results: [refused('unknown_ingredient')], sent: [tick()] })
    expect(n!.subtitle).toBe('Its Stock Lot was not added.')
  })

  it('a Tick that carried no amount has nothing to add: Dismiss only', () => {
    const [n] = run({ results: [refused('not_on_list')], sent: [tick({ quantity: 0 })] })
    expect(n!.actions).toEqual([{ id: 'dismiss', label: 'Dismiss' }])
  })

  it('a refused untick is never silent', () => {
    const [n] = run({ results: [refused('validation_failed')], sent: [{ clientUuid: 'c-1', scannedAt: '2026-11-14T10:20:00Z', kind: 'shop_untick', tickClientUuid: 'old' }] })
    expect(n).toMatchObject({ kind: 'untickRefused', tone: 'warn', title: 'Couldn’t sync taking Carrot off.', subtitle: 'Its tick is still there.' })
    expect(n!.actions).toEqual([{ id: 'dismiss', label: 'Dismiss' }])
  })

  it('a refused Scan in the same batch is not this module\'s (the Scan notices own it)', () => {
    expect(run({ results: [refused('x')], sent: [{ clientUuid: 'c-1', scannedAt: '2026-11-14T10:20:00Z', kind: 'shop_scan' }] })).toEqual([])
  })
})
