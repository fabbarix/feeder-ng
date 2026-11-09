import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { Op, ScanResult } from '../types'
import { createMemoryOpStore, newClientUuid, OfflineQueue, type SyncApi } from './queue'

const at = new Date('2026-11-09T12:00:00Z')

function op(uuid: string, extra: Partial<Op> = {}): Op {
  return { clientUuid: uuid, scannedAt: '2026-11-09T11:59:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700, ...extra }
}

function applied(uuid: string): ScanResult {
  return { clientUuid: uuid, status: 'applied' }
}

function api(fn: (ops: Op[]) => Promise<ScanResult[]>): SyncApi & { sync: ReturnType<typeof vi.fn> } {
  return { sync: vi.fn(fn) }
}

function setup() {
  const store = createMemoryOpStore()
  return { store, queue: new OfflineQueue(store, () => at) }
}

describe('newClientUuid', () => {
  it('returns distinct v4-looking ids', () => {
    const a = newClientUuid()
    const b = newClientUuid()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('works without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {})
    try {
      expect(newClientUuid()).toMatch(/^[0-9a-f-]{36}$/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('OfflineQueue', () => {
  it('keeps operations in the order they were made, stamped with the queue time', async () => {
    const { queue } = setup()
    await queue.enqueue(op('a'))
    await queue.enqueue(op('b'))
    await queue.enqueue(op('c'))
    const pending = await queue.pending()
    expect(pending.map((p) => p.op.clientUuid)).toEqual(['a', 'b', 'c'])
    expect(pending[0]).toMatchObject({ queuedAt: '2026-11-09T12:00:00.000Z', attempts: 0 })
  })

  it('ignores an operation whose clientUuid is already queued', async () => {
    const { queue } = setup()
    await queue.enqueue(op('a'))
    await queue.enqueue(op('a', { quantity: 999 }))
    const pending = await queue.pending()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.op.quantity).toBe(700)
  })

  it('survives a restart: a new queue over the same store sees the operations', async () => {
    const { store, queue } = setup()
    await queue.enqueue(op('a'))
    expect((await new OfflineQueue(store).pending()).map((p) => p.op.clientUuid)).toEqual(['a'])
  })

  it('sends everything pending, in order, in one call, and clears what was applied or a duplicate', async () => {
    const { queue } = setup()
    for (const id of ['a', 'b', 'c']) await queue.enqueue(op(id))
    const server = api(async (ops) => ops.map((o, i) => ({ clientUuid: o.clientUuid, status: i === 2 ? 'duplicate' : 'applied' }) as ScanResult))
    const out = await queue.flush(server)
    expect(server.sync).toHaveBeenCalledTimes(1)
    expect(server.sync.mock.calls[0]?.[0].map((o: Op) => o.clientUuid)).toEqual(['a', 'b', 'c'])
    expect(out.offline).toBe(false)
    expect(out.results.map((r) => r.status)).toEqual(['applied', 'applied', 'duplicate'])
    expect(await queue.pending()).toEqual([])
  })

  it('does not call the server when nothing is pending', async () => {
    const { queue } = setup()
    const server = api(async () => [])
    expect(await queue.flush(server)).toEqual({ offline: false, results: [] })
    expect(server.sync).not.toHaveBeenCalled()
  })

  it('keeps a rejected operation, marked, and never resends it', async () => {
    const { queue } = setup()
    await queue.enqueue(op('a'))
    await queue.enqueue(op('bad'))
    const server = api(async (ops) =>
      ops.map((o) =>
        o.clientUuid === 'bad'
          ? { clientUuid: 'bad', status: 'rejected', error: { code: 'unknown_product', message: 'gone' } }
          : applied(o.clientUuid),
      ) as ScanResult[],
    )
    await queue.flush(server)
    expect(await queue.pending()).toEqual([])
    const rejected = await queue.rejected()
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ op: { clientUuid: 'bad' }, rejected: { code: 'unknown_product', message: 'gone' } })
    await queue.enqueue(op('c'))
    await queue.flush(server)
    expect(server.sync.mock.calls[1]?.[0].map((o: Op) => o.clientUuid)).toEqual(['c'])
  })

  it.each([
    ['a network error', new ApiError(0, 'network', 'offline')],
    ['a server error', new ApiError(503, 'http_error', 'unavailable')],
  ])('stays queued, in order, after %s', async (_name, err) => {
    const { queue } = setup()
    await queue.enqueue(op('a'))
    await queue.enqueue(op('b'))
    const out = await queue.flush(api(async () => Promise.reject(err)))
    expect(out).toEqual({ offline: true, results: [] })
    const pending = await queue.pending()
    expect(pending.map((p) => p.op.clientUuid)).toEqual(['a', 'b'])
    expect(pending.every((p) => p.attempts === 1)).toBe(true)
  })

  it('rethrows an error that is not about connectivity (a bug must not silently keep the queue)', async () => {
    const { queue } = setup()
    await queue.enqueue(op('a'))
    await expect(queue.flush(api(async () => Promise.reject(new ApiError(401, 'unauthenticated', 'sign in'))))).rejects.toMatchObject({ status: 401 })
    expect(await queue.pending()).toHaveLength(1)
  })

  it('leaves operations enqueued during a send alone', async () => {
    const { queue } = setup()
    await queue.enqueue(op('a'))
    const server = api(async (ops) => {
      await queue.enqueue(op('late'))
      return ops.map((o) => applied(o.clientUuid))
    })
    await queue.flush(server)
    expect((await queue.pending()).map((p) => p.op.clientUuid)).toEqual(['late'])
  })

  it('shares one send between overlapping flushes', async () => {
    const { queue } = setup()
    await queue.enqueue(op('a'))
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const server = api(async (ops) => {
      await gate
      return ops.map((o) => applied(o.clientUuid))
    })
    const first = queue.flush(server)
    const second = queue.flush(server)
    release()
    await Promise.all([first, second])
    expect(server.sync).toHaveBeenCalledTimes(1)
  })
})
