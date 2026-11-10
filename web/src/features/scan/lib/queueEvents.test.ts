import { describe, expect, it, vi } from 'vitest'
import { createMemoryOpStore, type QueuedOp } from './queue'
import { emitQueueChange, onQueueChange, withChangeEvents } from './queueEvents'

const entry = (uuid: string): QueuedOp => ({ op: { clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 }, queuedAt: '2026-11-09T12:00:01Z', attempts: 0 })

describe('queueEvents', () => {
  it('emitQueueChange reaches every listener until it unsubscribes', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onQueueChange(a)
    onQueueChange(b)
    emitQueueChange()
    offA()
    emitQueueChange()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('append, put and remove emit a change and still do what the store does', async () => {
    const listener = vi.fn()
    const off = onQueueChange(listener)
    const store = withChangeEvents(createMemoryOpStore())
    await store.append(entry('a'))
    await store.put({ ...entry('a'), attempts: 1 })
    expect((await store.all()).map((e) => e.attempts)).toEqual([1])
    await store.remove('a')
    expect(await store.all()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(3)
    off()
  })

  it('reading emits nothing, and a failed write emits nothing', async () => {
    const listener = vi.fn()
    const off = onQueueChange(listener)
    const inner = createMemoryOpStore()
    const store = withChangeEvents({ ...inner, append: async () => { throw new Error('disk full') } })
    await store.all()
    await expect(store.append(entry('a'))).rejects.toThrow('disk full')
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})
