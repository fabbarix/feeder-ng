// B9-54 (RES-03): Ticks by hand go through the same queue as Scans (decision RES 1): one order, one batch, one idempotency key. Pinned:
//   - a shop_tick / shop_untick Op queues, persists and sends like a shop_scan; the queue keeps the order they were made in;
//   - OfflineQueue.updateTick(clientUuid, quantity): rewrites the amount of a still-queued shop_tick in place (Change while waiting);
//     false once it left the queue, and false for an Op that is not a shop_tick;
//   - cancel(clientUuid) is the Undo of a waiting tick: true (the server has nothing) before any send, false after one was tried;
//   - FlushResult.sent lists the Ops of the flush in order, so a result can be read by its kind;
//   - a refused tick stays in rejected() with its Op (the Add to Stock notice needs what it carried).
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { Op, ScanResult } from '../types'
import { createMemoryOpStore, OfflineQueue, type SyncApi } from './queue'

const at = new Date('2026-11-09T12:00:00Z')
const scan = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T11:50:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 })
const tick = (uuid: string, extra: Partial<Op> = {}): Op => ({
  clientUuid: uuid,
  scannedAt: '2026-11-09T11:51:00Z',
  kind: 'shop_tick',
  shopId: 1,
  ingredientId: 9,
  rangeTo: '2026-11-15',
  quantity: 50,
  covers: 150,
  ...extra,
})
const untick = (uuid: string, tickClientUuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T11:52:00Z', kind: 'shop_untick', tickClientUuid })
const applied = (uuid: string): ScanResult => ({ clientUuid: uuid, status: 'applied' })
const api = (fn: (ops: Op[]) => Promise<ScanResult[]>): SyncApi & { sync: ReturnType<typeof vi.fn> } => ({ sync: vi.fn(fn) })
const setup = () => {
  const store = createMemoryOpStore()
  return { store, queue: new OfflineQueue(store, () => at) }
}

describe('the queue holds Ticks and Scans in one order', () => {
  it('keeps them in the order they were made and sends them in one batch', async () => {
    const { queue } = setup()
    await queue.enqueue(tick('t-1'))
    await queue.enqueue(scan('s-1'))
    await queue.enqueue(untick('u-1', 't-1'))
    await queue.enqueue(tick('t-2'))
    const sync = api(async (ops) => ops.map((o) => applied(o.clientUuid)))
    const r = await queue.flush(sync)
    expect(sync.sync).toHaveBeenCalledTimes(1)
    expect(sync.sync.mock.calls[0]![0].map((o: Op) => `${o.kind}:${o.clientUuid}`)).toEqual(['shop_tick:t-1', 'shop_scan:s-1', 'shop_untick:u-1', 'shop_tick:t-2'])
    expect(r.sent?.map((o) => o.clientUuid)).toEqual(['t-1', 's-1', 'u-1', 't-2'])
    expect((await queue.pending()).length).toBe(0)
  })

  it('sent is empty when nothing was queued, and the API is not called', async () => {
    const { queue } = setup()
    const sync = api(async () => [])
    const r = await queue.flush(sync)
    expect(sync.sync).not.toHaveBeenCalled()
    expect(r.sent ?? []).toEqual([])
  })

  it('an unreachable server keeps every Tick with the same client id and counts the attempt (the retry sends the same id)', async () => {
    const { queue, store } = setup()
    await queue.enqueue(tick('t-1'))
    const down = api(async () => {
      throw new ApiError(0, 'network', 'offline')
    })
    expect((await queue.flush(down)).offline).toBe(true)
    expect((await store.all())[0]).toMatchObject({ op: { clientUuid: 't-1', kind: 'shop_tick' }, attempts: 1 })
    const up = api(async (ops) => ops.map((o) => applied(o.clientUuid)))
    await queue.flush(up)
    expect(up.sync.mock.calls[0]![0].map((o: Op) => o.clientUuid)).toEqual(['t-1'])
  })

  it('a replay after a restart (a new queue over the same store) sends the same Ops in the same order', async () => {
    const { store, queue } = setup()
    await queue.enqueue(tick('t-1'))
    await queue.enqueue(scan('s-1'))
    const restarted = new OfflineQueue(store, () => at)
    const sync = api(async (ops) => ops.map((o) => applied(o.clientUuid)))
    await restarted.flush(sync)
    expect(sync.sync.mock.calls[0]![0].map((o: Op) => o.clientUuid)).toEqual(['t-1', 's-1'])
  })

  it('a client id already queued is not queued twice (a double tap sends one Tick)', async () => {
    const { queue } = setup()
    await queue.enqueue(tick('t-1'))
    await queue.enqueue(tick('t-1', { quantity: 999 }))
    const pending = await queue.pending()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.op.quantity).toBe(50)
  })
})

describe('OfflineQueue.updateTick: Change while a Tick waits', () => {
  it('rewrites the amount in place: the order, the covered amount and everything else stay', async () => {
    const { queue } = setup()
    await queue.enqueue(scan('s-1'))
    await queue.enqueue(tick('t-1'))
    await queue.enqueue(scan('s-2'))
    expect(await queue.updateTick('t-1', 120)).toBe(true)
    const pending = await queue.pending()
    expect(pending.map((e) => e.op.clientUuid)).toEqual(['s-1', 't-1', 's-2'])
    expect(pending[1]!.op).toMatchObject({ kind: 'shop_tick', quantity: 120, covers: 150, ingredientId: 9, rangeTo: '2026-11-15' })
  })

  it('0 is "Tick without adding": the Tick stays queued with no amount', async () => {
    const { queue } = setup()
    await queue.enqueue(tick('t-1'))
    expect(await queue.updateTick('t-1', 0)).toBe(true)
    expect((await queue.pending())[0]!.op.quantity).toBe(0)
  })

  it('is false for a Tick that is not in the queue (never queued, or already sent): the caller then PATCHes the synced Tick', async () => {
    const { queue } = setup()
    expect(await queue.updateTick('nope', 10)).toBe(false)
    await queue.enqueue(tick('t-1'))
    await queue.flush(api(async (ops) => ops.map((o) => applied(o.clientUuid))))
    expect(await queue.updateTick('t-1', 10)).toBe(false)
  })

  it('is false for an Op that is not a shop_tick (a Scan keeps its own price edit)', async () => {
    const { queue } = setup()
    await queue.enqueue(scan('s-1'))
    expect(await queue.updateTick('s-1', 10)).toBe(false)
    expect((await queue.pending())[0]!.op.quantity).toBe(700)
  })

  it('waits for a send under way (the queue lock) and then answers false: the Tick had left', async () => {
    const { queue } = setup()
    await queue.enqueue(tick('t-1'))
    let release: (r: ScanResult[]) => void = () => {}
    const slow = api(() => new Promise<ScanResult[]>((resolve) => (release = resolve)))
    const flushing = queue.flush(slow)
    await vi.waitFor(() => expect(slow.sync).toHaveBeenCalled())
    const changed = queue.updateTick('t-1', 10)
    release([applied('t-1')])
    await flushing
    expect(await changed).toBe(false)
  })
})

describe('Undo of a waiting Tick: cancel', () => {
  it('removes it before any send, and says the server has nothing for it', async () => {
    const { queue } = setup()
    await queue.enqueue(tick('t-1'))
    await queue.enqueue(scan('s-1'))
    expect(await queue.cancel('t-1')).toBe(true)
    expect((await queue.pending()).map((e) => e.op.clientUuid)).toEqual(['s-1'])
  })

  it('after a failed send (the server may have it) says false: the caller unticks on the server', async () => {
    const { queue } = setup()
    await queue.enqueue(tick('t-1'))
    await queue.flush(
      api(async () => {
        throw new ApiError(500, 'server', 'boom')
      }),
    )
    expect(await queue.cancel('t-1')).toBe(false)
  })
})

describe('a refused Tick', () => {
  it('leaves the queue and stays in rejected() with the Op it carried and the server\'s code', async () => {
    const { queue } = setup()
    await queue.enqueue(tick('t-1', { quantity: 50 }))
    const r = await queue.flush(api(async () => [{ clientUuid: 't-1', status: 'rejected', error: { code: 'not_on_list', message: 'Carrot is not on the list' } }]))
    expect(r.results[0]!.status).toBe('rejected')
    expect(await queue.pending()).toHaveLength(0)
    const [note] = await queue.rejected()
    expect(note).toMatchObject({ op: { clientUuid: 't-1', kind: 'shop_tick', ingredientId: 9, quantity: 50 }, rejected: { code: 'not_on_list' } })
  })
})
