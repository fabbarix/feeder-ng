import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { Op, ScanResult } from '../types'
import { backoffMs, createMemoryOpStore, newClientUuid, OfflineQueue, type OpStore, type SyncApi } from './queue'

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

  it('removes a rejected operation from the store at once and keeps only a note in memory until it is dismissed', async () => {
    const { store, queue } = setup()
    await queue.enqueue(op('a'))
    await queue.enqueue(op('bad'))
    const server = api(async (ops) =>
      ops.map((o) => (o.clientUuid === 'bad' ? { clientUuid: 'bad', status: 'rejected', error: { code: 'unknown_ingredient', message: 'gone' } } : applied(o.clientUuid))) as ScanResult[],
    )
    await queue.flush(server)
    expect(await store.all()).toEqual([])
    expect(await queue.rejected()).toHaveLength(1)
    expect((await queue.rejected())[0]).toMatchObject({ op: { clientUuid: 'bad' }, rejected: { code: 'unknown_ingredient', message: 'gone' } })
    expect(await new OfflineQueue(store).rejected()).toEqual([])
    queue.dismissRejected()
    expect(await queue.rejected()).toEqual([])
  })

  describe('a flush asked for while a send is in flight', () => {
    function gated(offlineFirst = false) {
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => (release = r))
      let calls = 0
      const server = api(async (ops) => {
        calls += 1
        if (calls === 1) {
          await gate
          if (offlineFirst) throw new ApiError(503, 'http_error', 'unavailable')
        }
        return ops.map((o) => applied(o.clientUuid))
      })
      return { server, release: () => release() }
    }

    it('sends what was enqueued meanwhile right after the first send, in a second call', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      const { server, release } = gated()
      const first = queue.flush(server)
      await vi.waitFor(() => expect(server.sync).toHaveBeenCalledTimes(1))
      await queue.enqueue(op('b'))
      const second = queue.flush(server)
      release()
      const out = await second
      await first
      expect(server.sync).toHaveBeenCalledTimes(2)
      expect(server.sync.mock.calls[0]?.[0].map((o: Op) => o.clientUuid)).toEqual(['a'])
      expect(server.sync.mock.calls[1]?.[0].map((o: Op) => o.clientUuid)).toEqual(['b'])
      expect(out.results.map((r) => r.clientUuid)).toEqual(['b'])
      expect(await queue.pending()).toEqual([])
    })

    it('asks only once however many flushes were asked for', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      const { server, release } = gated()
      const first = queue.flush(server)
      await vi.waitFor(() => expect(server.sync).toHaveBeenCalledTimes(1))
      await queue.enqueue(op('b'))
      const more = [queue.flush(server), queue.flush(server), queue.flush(server)]
      release()
      await Promise.all([first, ...more])
      expect(server.sync).toHaveBeenCalledTimes(2)
    })

    it('does not send again when the first send found the server unreachable (the caller backs off)', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      const { server, release } = gated(true)
      const first = queue.flush(server)
      await vi.waitFor(() => expect(server.sync).toHaveBeenCalledTimes(1))
      const second = queue.flush(server)
      release()
      expect(await first).toEqual({ offline: true, results: [] })
      expect(await second).toEqual({ offline: true, results: [] })
      expect(server.sync).toHaveBeenCalledTimes(1)
    })
  })

  describe('cancel (Undo of a scan that may already be on its way)', () => {
    it('drops an operation that has not been sent', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      expect(await queue.cancel('a')).toBe(true)
      expect(await queue.pending()).toEqual([])
    })

    it('says false for an operation that is no longer queued because it was sent', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      await queue.flush(api(async (ops) => ops.map((o) => applied(o.clientUuid))))
      expect(await queue.cancel('a')).toBe(false)
    })

    it('waits for the send that is under way and, when the server applied it, says false so the caller Undoes it there', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => (release = r))
      const server = api(async (ops) => {
        await gate
        return ops.map((o) => applied(o.clientUuid))
      })
      const flushing = queue.flush(server)
      await vi.waitFor(() => expect(server.sync).toHaveBeenCalledTimes(1))
      let settled = false
      const cancelled = queue.cancel('a').then((v) => ((settled = true), v))
      await new Promise((r) => setTimeout(r, 20))
      expect(settled).toBe(false)
      release()
      expect(await cancelled).toBe(false)
      await flushing
      expect(await queue.pending()).toEqual([])
    })

    it('says false when the send under way failed (the batch may have been applied), and the operation is gone so it is never sent later', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      let fail: () => void = () => {}
      const gate = new Promise<void>((_r, rej) => (fail = () => rej(new ApiError(0, 'network', 'offline'))))
      const server = api(async () => gate.then(() => []))
      const flushing = queue.flush(server)
      await vi.waitFor(() => expect(server.sync).toHaveBeenCalledTimes(1))
      const cancelled = queue.cancel('a')
      fail()
      expect(await cancelled).toBe(false)
      await flushing
      expect(await queue.pending()).toEqual([])
    })

    it('says true when the server rejected the operation under way (nothing to undo there)', async () => {
      const { queue } = setup()
      await queue.enqueue(op('a'))
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => (release = r))
      const server = api(async (ops) => {
        await gate
        return ops.map((o) => ({ clientUuid: o.clientUuid, status: 'rejected', error: { code: 'unknown_product', message: 'gone' } }) as ScanResult)
      })
      const flushing = queue.flush(server)
      await vi.waitFor(() => expect(server.sync).toHaveBeenCalledTimes(1))
      const cancelled = queue.cancel('a')
      release()
      expect(await cancelled).toBe(true)
      await flushing
    })

    describe('an entry whose send failed or timed out (attempts > 0) may already be applied', () => {
      it('is removed locally and cancel says false so the caller does a server Undo', async () => {
        const { queue } = setup()
        await queue.enqueue(op('a'))
        const result = await queue.flush(api(async () => Promise.reject(new ApiError(0, 'timeout', 'timed out'))))
        expect(result.offline).toBe(true)
        expect((await queue.pending())[0]?.attempts).toBe(1)
        expect(await queue.cancel('a')).toBe(false)
        expect(await queue.pending()).toEqual([])
      })

      it('a 5xx counts the same: attempts > 0 answers false', async () => {
        const { queue } = setup()
        await queue.enqueue(op('a'))
        await queue.flush(api(async () => Promise.reject(new ApiError(503, 'http_error', 'down'))))
        expect(await queue.cancel('a')).toBe(false)
        expect(await queue.pending()).toEqual([])
      })

      it('only the entry that was sent answers false; one enqueued after the failure still answers true', async () => {
        const { queue } = setup()
        await queue.enqueue(op('a'))
        await queue.flush(api(async () => Promise.reject(new ApiError(0, 'network', 'offline'))))
        await queue.enqueue(op('b'))
        expect(await queue.cancel('b')).toBe(true)
        expect(await queue.cancel('a')).toBe(false)
      })
    })

    describe('cancel racing the start of a send (before the batch is marked)', () => {
      /** A store whose next all() call (once armed) returns its snapshot only when released. */
      function heldReadStore() {
        const inner = createMemoryOpStore()
        let armed = false
        let release: () => void = () => {}
        let held = false
        const store: OpStore = {
          ...inner,
          async all() {
            const snapshot = await inner.all()
            if (!armed) return snapshot
            armed = false
            held = true
            await new Promise<void>((r) => (release = r))
            return snapshot
          },
        }
        return { store, arm: () => (armed = true), isHeld: () => held, release: () => release() }
      }

      it('does not remove an operation a send has already read: cancel says false once the server applied it', async () => {
        const held = heldReadStore()
        const queue = new OfflineQueue(held.store, () => at)
        await queue.enqueue(op('a'))
        const server = api(async (ops) => ops.map((o) => applied(o.clientUuid)))
        held.arm()
        const flushing = queue.flush(server)
        await vi.waitFor(() => expect(held.isHeld()).toBe(true)) // the send read A and is held before marking its batch
        const cancelled = queue.cancel('a')
        await new Promise((r) => setTimeout(r, 20))
        held.release() // the send goes on with A in its snapshot and the server applies it
        await flushing
        expect(server.sync).toHaveBeenCalledTimes(1)
        expect(await cancelled).toBe(false) // the caller must Undo it on the server
      })

      it('does not send an operation a flush started after cancel removed it', async () => {
        const { queue } = setup()
        await queue.enqueue(op('a'))
        expect(await queue.cancel('a')).toBe(true)
        const server = api(async (ops) => ops.map((o) => applied(o.clientUuid)))
        const result = await queue.flush(server)
        expect(server.sync).not.toHaveBeenCalled()
        expect(result).toEqual({ offline: false, results: [] })
      })
    })
  })
})

describe('backoffMs', () => {
  it('doubles from one second up to thirty', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
  })

  it('counts anything below one as the first failure', () => {
    expect(backoffMs(0)).toBe(1000)
    expect(backoffMs(-3)).toBe(1000)
  })
})
