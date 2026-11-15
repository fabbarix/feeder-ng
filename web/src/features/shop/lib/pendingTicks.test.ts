// B9-54 (RES-03, decision RES 1): Ticks by hand made offline wait in the queue next to the Scans. This module is the pure half:
//   tickOp(plan, { covers, scannedAt, more? })  the shop_tick Op of a TickPlan (lib/tickAmount planTick): the plan's client id is the Op's;
//                     a Line names `ingredientId` + `rangeTo`, an Ingredient extra (or free text) names `extraId` and no range; `quantity` is the amount
//                     added to Stock (0 = Tick without adding), `covers` the Line quantity the phone showed (SSP-02's Q0); `more: true` only for the
//                     "more since your tick" row; `shopId` is left out when no Shop is picked.
//   untickAdditionOp / untickLineOp   the shop_untick Ops (one addition by its client id / the whole Line for the range).
//   isTickOp / countPending   a Tick is a shop_tick or a shop_untick; everything else is a Scan (the banner says "2 Scans and 1 Tick waiting").
//   applyPending(list, ops, { who })   the Shopping List as the phone shows it with the waiting Ticks applied, in queue order, without
//                     touching `list`: the Line is ticked at once, its addition has `syncedAt: null` (the "waiting to sync" state), `mine`, and
//                     the phone's time; progress follows; `complete` stays the server's (the complete tile needs the Stock the sync adds).
//   failedKeys(ops)   the entry keys of refused Ticks, for the "Tick not synced" row.
import { describe, expect, it } from 'vitest'
import type { Op } from '../../scan/types'
import { makeAddition, makeExtra, makeGarlic, makeLine, makeList, makeTick } from '../testData'
import { applyPending, countPending, failedKeys, isTickOp, tickOp, untickAdditionOp, untickLineOp } from './pendingTicks'
import type { TickPlan } from './tickAmount'

const AT = '2026-11-09T10:20:00Z'
const linePlan = (over: Partial<Extract<TickPlan, { kind: 'line' }>['request']> = {}): TickPlan => ({
  kind: 'line',
  request: { ingredientId: 9, to: '2026-11-15', quantity: 500, shopId: 1, clientUuid: 'c-1', ...over },
})
const extraPlan = (over: Partial<Extract<TickPlan, { kind: 'extra' }>['request']> = {}): TickPlan => ({
  kind: 'extra',
  request: { extraId: 3, quantity: 0, shopId: 1, clientUuid: 'c-2', ...over },
})
const tickOf = (uuid: string, over: Partial<Op> = {}): Op => ({
  clientUuid: uuid,
  scannedAt: AT,
  kind: 'shop_tick',
  shopId: 1,
  ingredientId: 9,
  rangeTo: '2026-11-15',
  quantity: 500,
  covers: 150,
  ...over,
})
const garlic = (over = {}) => makeGarlic(over)

describe('tickOp', () => {
  it('a Line: the plan\'s client id, the Ingredient, the range, the amount added, what the phone showed and the phone\'s time', () => {
    expect(tickOp(linePlan(), { covers: 150, scannedAt: AT })).toEqual({
      clientUuid: 'c-1',
      scannedAt: AT,
      kind: 'shop_tick',
      shopId: 1,
      ingredientId: 9,
      rangeTo: '2026-11-15',
      quantity: 500,
      covers: 150,
    })
  })

  it('leaves the Shop out when none is picked (Any Shop)', () => {
    const op = tickOp(linePlan({ shopId: null }), { covers: 150, scannedAt: AT })
    expect('shopId' in op).toBe(false)
  })

  it('an Ingredient extra names the extra and no range; free text is a Tick with no amount', () => {
    const op = tickOp(extraPlan({ quantity: 2000 }), { covers: 2000, scannedAt: AT })
    expect(op).toMatchObject({ kind: 'shop_tick', extraId: 3, quantity: 2000, covers: 2000, clientUuid: 'c-2' })
    expect('ingredientId' in op).toBe(false)
    expect('rangeTo' in op).toBe(false)
    const text = tickOp(extraPlan({ quantity: 0 }), { covers: 0, scannedAt: AT })
    expect(text.quantity).toBe(0)
  })

  it('"more" is set only for the more-since-your-tick row', () => {
    expect(tickOp(linePlan(), { covers: 150, scannedAt: AT }).more).toBeUndefined()
    expect(tickOp(linePlan(), { covers: 750, scannedAt: AT, more: true }).more).toBe(true)
  })
})

describe('untick Ops', () => {
  it('one addition by the client id of its tick', () => {
    expect(untickAdditionOp({ clientUuid: 'x-1', scannedAt: AT, tickClientUuid: 'c-1' })).toEqual({ clientUuid: 'x-1', scannedAt: AT, kind: 'shop_untick', tickClientUuid: 'c-1' })
  })
  it('a whole Line by Ingredient and range', () => {
    expect(untickLineOp({ clientUuid: 'x-2', scannedAt: AT, ingredientId: 9, rangeTo: '2026-11-15' })).toEqual({
      clientUuid: 'x-2',
      scannedAt: AT,
      kind: 'shop_untick',
      ingredientId: 9,
      rangeTo: '2026-11-15',
    })
  })
})

describe('counting what waits', () => {
  const ops: Op[] = [
    { clientUuid: 's-1', scannedAt: AT, kind: 'shop_scan' },
    tickOf('t-1'),
    { clientUuid: 's-2', scannedAt: AT, kind: 'shop_unknown' },
    { clientUuid: 'k-1', scannedAt: AT, kind: 'stock_take' },
    { clientUuid: 'u-1', scannedAt: AT, kind: 'shop_untick', tickClientUuid: 'x' },
  ]
  it('isTickOp: shop_tick and shop_untick', () => {
    expect(ops.map(isTickOp)).toEqual([false, true, false, false, true])
  })
  it('countPending: a Tick is a tick or an untick; every other kind is a Scan (a Stock-take too, as the banner always counted it)', () => {
    expect(countPending(ops)).toEqual({ scans: 3, ticks: 2 })
    expect(countPending([])).toEqual({ scans: 0, ticks: 0 })
  })
})

describe('applyPending: a waiting Tick shows ticked at once', () => {
  const list = makeList({ lines: [garlic(), makeLine()], progress: { ticked: 0, total: 2 } })
  const who = 'Ana'

  it('ticks the open Line: need kept, nothing left to get, one addition of the User\'s own that has not synced', () => {
    const out = applyPending(list, [tickOf('c-1')], { who })
    const line = out.lines[0]!
    expect(line.ticked).toBe(true)
    expect(line.quantity).toBe(0)
    expect(line.need).toBe(150)
    expect(line.tick).toEqual({
      by: 'hand',
      added: 500,
      additions: [{ who: 'Ana', mine: true, by: 'hand', quantity: 500, clientUuid: 'c-1', tickedAt: AT, syncedAt: null }],
    })
    expect(out.lines[1]!.ticked).toBe(false)
    expect(out.progress).toEqual({ ticked: 1, total: 2 })
  })

  it('does not touch the list it was given', () => {
    const copy = structuredClone(list)
    applyPending(list, [tickOf('c-1')], { who })
    expect(list).toEqual(copy)
  })

  it('no waiting Ticks: the same list', () => {
    expect(applyPending(list, [], { who })).toEqual(list)
    expect(applyPending(list, [{ clientUuid: 's-1', scannedAt: AT, kind: 'shop_scan' }], { who })).toEqual(list)
  })

  it('a Tick without adding has no amount and adds nothing', () => {
    const line = applyPending(list, [tickOf('c-1', { quantity: 0 })], { who }).lines[0]!
    expect(line.ticked).toBe(true)
    expect(line.tick).toMatchObject({ added: null, additions: [{ quantity: null, syncedAt: null }] })
  })

  it('a Tick of another range or an Ingredient not on the list changes nothing', () => {
    expect(applyPending(list, [tickOf('c-1', { rangeTo: '2026-11-22' })], { who })).toEqual(list)
    expect(applyPending(list, [tickOf('c-1', { ingredientId: 77 })], { who })).toEqual(list)
  })

  it('every waiting Tick of one Line adds its own addition, in queue order; the Line counts once', () => {
    const out = applyPending(list, [tickOf('c-1', { quantity: 500 }), tickOf('c-2', { quantity: 200, scannedAt: '2026-11-09T10:25:00Z' })], { who })
    const t = out.lines[0]!.tick!
    expect(t.additions.map((a) => a.clientUuid)).toEqual(['c-1', 'c-2'])
    expect(t.added).toBe(700)
    expect(out.progress.ticked).toBe(1)
  })

  it('a Line the server already shows ticked keeps its additions and gains the waiting one after them (the other shopper\'s first)', () => {
    const ticked = makeList({
      lines: [garlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [makeAddition({ who: 'Sam', mine: false, quantity: 500, clientUuid: 's-1' })] }) })],
      progress: { ticked: 1, total: 1 },
    })
    const out = applyPending(ticked, [tickOf('c-1', { quantity: 50 })], { who })
    const t = out.lines[0]!.tick!
    expect(t.additions.map((a) => [a.who, a.quantity, a.syncedAt === null])).toEqual([
      ['Sam', 500, false],
      ['Ana', 50, true],
    ])
    expect(t.added).toBe(550)
    expect(out.progress).toEqual({ ticked: 1, total: 1 })
  })

  it('the "more since your tick" Tick covers the More: it goes, and the waiting addition joins the Line\'s', () => {
    const grown = makeList({ lines: [garlic({ ticked: true, quantity: 0, more: 750, tick: makeTick() })], progress: { ticked: 1, total: 1 } })
    const out = applyPending(grown, [tickOf('c-1', { quantity: 750, covers: 750, more: true })], { who })
    expect(out.lines[0]!.more).toBeUndefined()
    expect(out.lines[0]!.tick!.additions).toHaveLength(2)
    expect(out.lines[0]!.tick!.additions[1]).toMatchObject({ clientUuid: 'c-1', syncedAt: null })
  })

  it('an extra: ticked at once, counted in progress; free text carries no amount', () => {
    const withExtra = makeList({ lines: [], extras: [makeExtra({ id: 3, text: 'napkins' })], progress: { ticked: 0, total: 1 } })
    const out = applyPending(withExtra, [{ clientUuid: 'c-2', scannedAt: AT, kind: 'shop_tick', extraId: 3, quantity: 0, covers: 0 }], { who })
    expect(out.extras[0]!.ticked).toBe(true)
    expect(out.extras[0]!.tick).toEqual({ by: 'hand', added: null, additions: [{ who: 'Ana', mine: true, by: 'hand', quantity: null, clientUuid: 'c-2', tickedAt: AT, syncedAt: null }] })
    expect(out.progress).toEqual({ ticked: 1, total: 1 })
  })

  it('complete stays what the server said: the complete tile needs the Stock the sync adds', () => {
    const one = makeList({ lines: [garlic()], progress: { ticked: 0, total: 1 }, complete: false })
    expect(applyPending(one, [tickOf('c-1')], { who }).complete).toBe(false)
  })
})

describe('applyPending: waiting untick Ops', () => {
  const who = 'Ana'
  const syncedTick = makeTick({ additions: [makeAddition({ clientUuid: 'old-1', quantity: 500 })] })
  const ticked = makeList({ lines: [garlic({ ticked: true, quantity: 0, tick: syncedTick })], progress: { ticked: 1, total: 1 } })

  it('one addition off: when it was the only one the Line is open again with its need to get, and progress follows', () => {
    const out = applyPending(ticked, [{ clientUuid: 'x-1', scannedAt: AT, kind: 'shop_untick', tickClientUuid: 'old-1' }], { who })
    const line = out.lines[0]!
    expect(line.ticked).toBe(false)
    expect(line.tick ?? null).toBeNull()
    expect(line.quantity).toBe(150)
    expect(out.progress).toEqual({ ticked: 0, total: 1 })
  })

  it('one of two additions off: the Line stays ticked with the other', () => {
    const two = makeList({
      lines: [garlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [makeAddition({ clientUuid: 'old-1' }), makeAddition({ clientUuid: 'old-2', quantity: 50, who: 'Sam', mine: false })] }) })],
      progress: { ticked: 1, total: 1 },
    })
    const out = applyPending(two, [{ clientUuid: 'x-1', scannedAt: AT, kind: 'shop_untick', tickClientUuid: 'old-1' }], { who })
    expect(out.lines[0]!.ticked).toBe(true)
    expect(out.lines[0]!.tick!.additions.map((a) => a.clientUuid)).toEqual(['old-2'])
    expect(out.lines[0]!.tick!.added).toBe(50)
  })

  it('the whole Line (Ingredient and range): every hand addition goes; a Scan\'s stays and keeps the Line ticked', () => {
    const mixed = makeList({
      lines: [garlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [makeAddition({ clientUuid: 'h-1' }), makeAddition({ clientUuid: 's-1', by: 'scan', who: 'Sam', mine: false, quantity: 700 })] }) })],
      progress: { ticked: 1, total: 1 },
    })
    const out = applyPending(mixed, [{ clientUuid: 'x-1', scannedAt: AT, kind: 'shop_untick', ingredientId: 9, rangeTo: '2026-11-15' }], { who })
    expect(out.lines[0]!.ticked).toBe(true)
    expect(out.lines[0]!.tick!.additions.map((a) => a.clientUuid)).toEqual(['s-1'])
    const alone = applyPending(ticked, [{ clientUuid: 'x-1', scannedAt: AT, kind: 'shop_untick', ingredientId: 9, rangeTo: '2026-11-15' }], { who })
    expect(alone.lines[0]!.ticked).toBe(false)
  })

  it('applied in queue order: a tick and its own untick leave the Line as it was', () => {
    const open = makeList({ lines: [garlic()], progress: { ticked: 0, total: 1 } })
    const out = applyPending(open, [tickOf('c-1'), { clientUuid: 'x-1', scannedAt: AT, kind: 'shop_untick', tickClientUuid: 'c-1' }], { who })
    expect(out.lines[0]).toEqual(open.lines[0])
    expect(out.progress).toEqual({ ticked: 0, total: 1 })
  })
})

describe('failedKeys', () => {
  it('names the rows of refused Ticks: "line:<ingredientId>" and "extra:<id>"; Scans and untick Ops name none', () => {
    const ops: Op[] = [tickOf('t-1'), { clientUuid: 't-2', scannedAt: AT, kind: 'shop_tick', extraId: 3, quantity: 0, covers: 0 }, { clientUuid: 's-1', scannedAt: AT, kind: 'shop_scan', productId: 4 }]
    expect([...failedKeys(ops)].sort()).toEqual(['extra:3', 'line:9'])
    expect(failedKeys([{ clientUuid: 'x', scannedAt: AT, kind: 'shop_untick', tickClientUuid: 'a' }]).size).toBe(0)
  })
})
