// PPX: a queued Picture uploads on the existing sync schedule: online event, after each enqueue, and the 1 s, 2 s, 4 s ... backoff after an unreachable server.
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { createMemoryOpStore, createMemoryPictureStore, OfflineQueue } from '../lib/queue'
import type { Op, ScanResult } from '../types'
import { useSyncQueue } from './useSyncQueue'

afterEach(() => vi.useRealTimers())

const ID = 'a'.repeat(32)
const unknown = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T12:00:00Z', kind: 'shop_unknown', shopId: 1, barcode: '5012345678900', quantity: 400, packSize: 400,
  scope: 'global', ingredient: { name: 'tinned tomatoes', baseUnit: 'g' }, productName: 'Tinned tomatoes 400 g' })
const jpeg = () => new Blob([new Uint8Array(10)], { type: 'image/jpeg' })
const unavailable = () => new ApiError(503, 'http_error', 'unavailable')
const applied = (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'applied' }) as ScanResult)

function setup(online: { value: boolean }, uploadPicture: (b: Blob) => Promise<string>) {
  const queue = new OfflineQueue(createMemoryOpStore(), undefined, createMemoryPictureStore())
  const sync = vi.fn(async (ops: Op[]) => applied(ops))
  const upload = vi.fn(uploadPicture)
  const onResults = vi.fn()
  const hook = renderHook(() => useSyncQueue({ queue, api: { sync, uploadPicture: upload }, isOnline: () => online.value, onResults }))
  return { sync, upload, onResults, hook }
}

describe('useSyncQueue with queued Pictures', () => {
  it('keeps a scan and its Picture while offline and uploads then syncs when the phone comes back', async () => {
    vi.useFakeTimers()
    const online = { value: false }
    const { hook, sync, upload } = setup(online, async () => ID)
    await act(async () => void (await hook.result.current.enqueue(unknown('q-1'), jpeg())))
    expect(hook.result.current.pendingCount).toBe(1)
    expect(upload).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
    online.value = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync.mock.calls[0]?.[0][0]).toMatchObject({ clientUuid: 'q-1', productImage: ID })
    expect(hook.result.current.pendingCount).toBe(0)
  })

  it('retries a failed upload with the existing backoff, 1 s then 2 s, and then syncs', async () => {
    vi.useFakeTimers()
    const online = { value: true }
    const attempts = vi.fn<() => Promise<string>>().mockRejectedValueOnce(unavailable()).mockRejectedValueOnce(unavailable()).mockResolvedValue(ID)
    const { hook, sync, upload } = setup(online, attempts)
    const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
    await act(async () => void (await hook.result.current.enqueue(unknown('q-1'), jpeg())))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(sync).not.toHaveBeenCalled()
    expect(hook.result.current.pendingCount).toBe(1)
    await advance(999)
    expect(upload).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(upload).toHaveBeenCalledTimes(2)
    await advance(1999)
    expect(upload).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(upload).toHaveBeenCalledTimes(3)
    expect(sync).toHaveBeenCalledTimes(1)
    expect(hook.result.current.pendingCount).toBe(0)
  })

  it('a Picture given up for good is reported in a notice with the results, and the scan is not stuck', async () => {
    const online = { value: true }
    const { hook, onResults, sync } = setup(online, async () => {
      throw new ApiError(413, 'image_too_large', 'A photo must be 8 MB or smaller')
    })
    await act(async () => void (await hook.result.current.enqueue(unknown('q-1'), jpeg())))
    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync.mock.calls[0]?.[0][0]?.productImage).toBeUndefined()
    expect(onResults).toHaveBeenCalledTimes(1)
    const [results, notices] = onResults.mock.calls[0] as [ScanResult[], { kind: string; clientUuid: string; text: string }[]]
    expect(results.map((r) => r.status)).toEqual(['applied'])
    expect(notices).toEqual([expect.objectContaining({ kind: 'picture', clientUuid: 'q-1', text: expect.stringContaining('without one') })])
    expect(hook.result.current.pendingCount).toBe(0)
  })

  it('tells the caller when the phone had no room for the Picture', async () => {
    const online = { value: false }
    const queue = new OfflineQueue(createMemoryOpStore(), undefined, { ...createMemoryPictureStore(), put: vi.fn().mockRejectedValue(new Error('full')) })
    const onPictureNotStored = vi.fn()
    const { result } = renderHook(() => useSyncQueue({ queue, api: { sync: vi.fn() }, isOnline: () => online.value, onPictureNotStored }))
    await act(async () => void (await result.current.enqueue(unknown('q-1'), jpeg())))
    expect(onPictureNotStored).toHaveBeenCalledWith(expect.objectContaining({ clientUuid: 'q-1' }))
    expect(result.current.pendingCount).toBe(1)
  })

  // Review: a Picture given up in a flush that then finds the server unreachable is still told to the User (the scan will sync later).
  it('notices a given-up Picture even when the flush returns offline', async () => {
    const online = { value: false }
    const jpeg2 = () => new Blob([new Uint8Array(20)], { type: 'image/jpeg' })
    const { hook, onResults, sync } = setup(online, async (b) => {
      if (b.size === 10) throw new ApiError(413, 'image_too_large', 'big')
      throw unavailable()
    })
    vi.useFakeTimers()
    await act(async () => {
      await hook.result.current.enqueue(unknown('one'), jpeg())
      await hook.result.current.enqueue(unknown('two'), jpeg2())
    })
    online.value = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(sync).not.toHaveBeenCalled()
    expect(onResults).toHaveBeenCalledTimes(1)
    const [results, notices] = onResults.mock.calls[0] as [ScanResult[], { kind: string; clientUuid: string }[]]
    expect(results).toEqual([])
    expect(notices).toEqual([expect.objectContaining({ kind: 'picture', clientUuid: 'one' })])
  })
})
