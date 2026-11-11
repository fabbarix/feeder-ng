// PPX: a Picture picked on the unknown-barcode form while OFFLINE is kept with the queued scan and uploaded on sync, before the scan is sent
// (docs/dev/design/ppx-product-picture-sync.md).
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { Op, ScanResult } from '../types'
import { createMemoryOpStore, createMemoryPictureStore, MAX_QUEUED_PICTURE_BYTES, OfflineQueue, type PictureStore, type SyncApi } from './queue'

const at = new Date('2026-11-09T12:00:00Z')
const ID_A = 'a'.repeat(32)
const ID_B = 'b'.repeat(32)

const jpeg = (size = 10) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' })
function unknown(uuid: string, extra: Partial<Op> = {}): Op {
  return { clientUuid: uuid, scannedAt: '2026-11-09T11:59:00Z', kind: 'shop_unknown', shopId: 1, barcode: '5012345678900', quantity: 400, packSize: 400,
    scope: 'global', ingredient: { name: 'tinned tomatoes', baseUnit: 'g' }, productName: 'Tinned tomatoes 400 g', ...extra }
}
const plain = (uuid: string): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T11:59:00Z', kind: 'shop_scan', shopId: 1, productId: 7, quantity: 700 })
const applied = (o: Op): ScanResult => ({ clientUuid: o.clientUuid, status: 'applied' })

function setup(pictures: PictureStore = createMemoryPictureStore()) {
  const store = createMemoryOpStore()
  return { store, pictures, queue: new OfflineQueue(store, () => at, pictures) }
}
function server(upload: (blob: Blob) => Promise<string> = async () => ID_A) {
  const log: string[] = []
  const uploadPicture = vi.fn(async (blob: Blob) => {
    log.push('upload')
    return upload(blob)
  })
  const sync = vi.fn(async (ops: Op[]) => {
    log.push('sync')
    return ops.map(applied)
  })
  const api: SyncApi & { sync: typeof sync; uploadPicture: typeof uploadPicture } = { sync, uploadPicture }
  return { api, sync, uploadPicture, log }
}

describe('createMemoryPictureStore', () => {
  it('keeps a Blob by clientUuid until removed', async () => {
    const s = createMemoryPictureStore()
    const b = jpeg()
    await s.put('a', b)
    expect(await s.get('a')).toBe(b)
    expect(await s.get('zzz')).toBeUndefined()
    await s.remove('a')
    expect(await s.get('a')).toBeUndefined()
  })
})

describe('OfflineQueue.enqueue with a Picture', () => {
  it('keeps the Blob in the PictureStore and only its type and size on the entry; the Op stays plain JSON', async () => {
    const { queue, pictures } = setup()
    const b = jpeg(1234)
    expect(await queue.enqueue(unknown('q-1'), b)).toEqual({ pictureStored: true })
    const [entry] = await queue.pending()
    expect(entry?.picture).toEqual({ type: 'image/jpeg', size: 1234 })
    expect(entry?.op.productImage).toBeUndefined()
    expect(await pictures.get('q-1')).toBe(b)
  })

  it('queues the scan WITHOUT the Picture when it is over the queue limit', async () => {
    const { queue, pictures } = setup()
    const out = await queue.enqueue(unknown('q-1'), jpeg(MAX_QUEUED_PICTURE_BYTES + 1))
    expect(out).toEqual({ pictureStored: false })
    expect((await queue.pending()).map((e) => [e.op.clientUuid, e.picture])).toEqual([['q-1', undefined]])
    expect(await pictures.get('q-1')).toBeUndefined()
  })

  it('queues the scan WITHOUT the Picture when the device is out of room (the store throws)', async () => {
    const full: PictureStore = { ...createMemoryPictureStore(), put: vi.fn().mockRejectedValue(new DOMException('full', 'QuotaExceededError')) }
    const { queue } = setup(full)
    expect(await queue.enqueue(unknown('q-1'), jpeg())).toEqual({ pictureStored: false })
    const [entry] = await queue.pending()
    expect(entry).toMatchObject({ op: { clientUuid: 'q-1' } })
    expect(entry?.picture).toBeUndefined()
  })

  it('queues the scan WITHOUT the Picture when the queue has no PictureStore', async () => {
    const queue = new OfflineQueue(createMemoryOpStore(), () => at)
    expect(await queue.enqueue(unknown('q-1'), jpeg())).toEqual({ pictureStored: false })
    expect(await queue.pending()).toHaveLength(1)
  })

  it('a clientUuid already queued is ignored, and so is its second Picture', async () => {
    const { queue, pictures } = setup()
    const first = jpeg(10)
    await queue.enqueue(unknown('q-1'), first)
    await queue.enqueue(unknown('q-1'), jpeg(99))
    expect(await pictures.get('q-1')).toBe(first)
  })

  it('cancel (Undo before the sync) removes the Picture too', async () => {
    const { queue, pictures } = setup()
    await queue.enqueue(unknown('q-1'), jpeg())
    expect(await queue.cancel('q-1')).toBe(true)
    expect(await pictures.get('q-1')).toBeUndefined()
    expect(await queue.pending()).toEqual([])
  })
})

describe('OfflineQueue.flush uploads first, then sends the scan with the returned id', () => {
  it('uploads the Blob, then syncs the Op carrying productImage; the Blob is gone afterwards', async () => {
    const { queue, pictures } = setup()
    const b = jpeg()
    await queue.enqueue(unknown('q-1'), b)
    const { api, sync, uploadPicture, log } = server()
    const out = await queue.flush(api)
    expect(uploadPicture).toHaveBeenCalledWith(b)
    expect(log).toEqual(['upload', 'sync'])
    expect(sync.mock.calls[0]?.[0][0]).toMatchObject({ clientUuid: 'q-1', productImage: ID_A })
    expect(out).toEqual({ offline: false, results: [{ clientUuid: 'q-1', status: 'applied' }] })
    expect(await pictures.get('q-1')).toBeUndefined()
    expect(await queue.pending()).toEqual([])
  })

  it('uploads only the Ops that have a Picture, in queue order, and sends the batch in the original order', async () => {
    const { queue } = setup()
    await queue.enqueue(plain('a'))
    await queue.enqueue(unknown('b'), jpeg(1))
    await queue.enqueue(unknown('c'))
    await queue.enqueue(unknown('d'), jpeg(2))
    const ids = [ID_A, ID_B]
    const { api, sync, uploadPicture } = server(async () => ids.shift() ?? '')
    await queue.flush(api)
    expect(uploadPicture.mock.calls.map((c) => c[0].size)).toEqual([1, 2])
    const sent = sync.mock.calls[0]?.[0] as Op[]
    expect(sent.map((o) => [o.clientUuid, o.productImage])).toEqual([['a', undefined], ['b', ID_A], ['c', undefined], ['d', ID_B]])
  })

  it('never calls the upload when nothing has a Picture', async () => {
    const { queue } = setup()
    await queue.enqueue(plain('a'))
    const { api, uploadPicture } = server()
    await queue.flush(api)
    expect(uploadPicture).not.toHaveBeenCalled()
  })

  it('an Op rejected by the server is not retried with its Picture', async () => {
    const { queue, pictures } = setup()
    await queue.enqueue(unknown('q-1'), jpeg())
    const { api, sync } = server()
    sync.mockImplementation(async (ops: Op[]) => ops.map((o) => ({ clientUuid: o.clientUuid, status: 'rejected', error: { code: 'unknown_shop', message: 'unknown Shop' } }) as ScanResult))
    await queue.flush(api)
    expect(await queue.pending()).toEqual([])
    expect(await pictures.get('q-1')).toBeUndefined()
  })
})

describe('OfflineQueue.flush: an upload that cannot reach the server retries like a failed sync', () => {
  it.each([0, 408, 429, 502, 503])('status %i: everything stays queued, nothing is synced, attempts go up and the Picture is kept', async (status) => {
    const { queue, pictures } = setup()
    await queue.enqueue(plain('a'))
    await queue.enqueue(unknown('q-1'), jpeg())
    const { api, sync } = server(async () => {
      throw new ApiError(status, 'http_error', 'unavailable')
    })
    const out = await queue.flush(api)
    expect(out.offline).toBe(true)
    expect(sync).not.toHaveBeenCalled()
    const pending = await queue.pending()
    expect(pending.map((e) => [e.op.clientUuid, e.attempts])).toEqual([['a', 1], ['q-1', 1]])
    expect(pending[1]?.picture).toBeDefined()
    expect(pending[1]?.op.productImage).toBeUndefined()
    expect(await pictures.get('q-1')).toBeDefined()
  })

  it('the next flush uploads again and then syncs', async () => {
    const { queue } = setup()
    await queue.enqueue(unknown('q-1'), jpeg())
    const failing = server(async () => {
      throw new ApiError(0, 'network', 'offline')
    })
    await queue.flush(failing.api)
    const working = server()
    const out = await queue.flush(working.api)
    expect(out.offline).toBe(false)
    expect(working.log).toEqual(['upload', 'sync'])
    expect(working.sync.mock.calls[0]?.[0][0]).toMatchObject({ clientUuid: 'q-1', productImage: ID_A })
  })

  it('an id already returned is kept on the Op, so a later retry does not upload the same Picture twice', async () => {
    const { queue } = setup()
    await queue.enqueue(unknown('one'), jpeg(1))
    await queue.enqueue(unknown('two'), jpeg(2))
    let calls = 0
    const flaky = server(async () => {
      calls += 1
      if (calls === 2) throw new ApiError(503, 'http_error', 'unavailable')
      return ID_A
    })
    expect((await queue.flush(flaky.api)).offline).toBe(true)
    const pending = await queue.pending()
    expect(pending[0]?.op.productImage).toBe(ID_A)
    expect(pending[0]?.picture).toBeUndefined()
    expect(pending[1]?.op.productImage).toBeUndefined()

    const working = server(async () => ID_B)
    await queue.flush(working.api)
    expect(working.uploadPicture).toHaveBeenCalledTimes(1)
    expect(working.uploadPicture.mock.calls[0]?.[0].size).toBe(2)
    expect((working.sync.mock.calls[0]?.[0] as Op[]).map((o) => o.productImage)).toEqual([ID_A, ID_B])
  })

  it('a sign-out (401) is raised like a failed sync, and nothing is lost', async () => {
    const { queue, pictures } = setup()
    await queue.enqueue(unknown('q-1'), jpeg())
    const { api } = server(async () => {
      throw new ApiError(401, 'unauthenticated', 'sign in')
    })
    await expect(queue.flush(api)).rejects.toMatchObject({ status: 401 })
    expect(await queue.pending()).toHaveLength(1)
    expect(await pictures.get('q-1')).toBeDefined()
  })
})

describe('OfflineQueue.flush: a Picture that can never be uploaded is given up, the scan still syncs', () => {
  const cases: [string, number, string, string][] = [
    ['too large (413)', 413, 'image_too_large', 'too_large'],
    ['too many pixels (422)', 422, 'image_too_large_pixels', 'too_large'],
    ['not a supported image (422)', 422, 'unsupported_image', 'unsupported'],
    ['any other refusal (400)', 400, 'invalid_image', 'rejected'],
  ]
  it.each(cases)('%s', async (_name, status, code, reason) => {
    const { queue, pictures } = setup()
    await queue.enqueue(unknown('q-1'), jpeg())
    const { api, sync } = server(async () => {
      throw new ApiError(status, code, 'no')
    })
    const out = await queue.flush(api)
    expect(out.offline).toBe(false)
    expect((sync.mock.calls[0]?.[0] as Op[])[0]?.productImage).toBeUndefined()
    expect(out.results.map((r) => r.status)).toEqual(['applied'])
    expect(out.pictureFailures).toEqual([{ clientUuid: 'q-1', productName: 'Tinned tomatoes 400 g', reason }])
    expect(await pictures.get('q-1')).toBeUndefined()
    expect(await queue.pending()).toEqual([])
  })

  it('a Blob that cannot be read at all is given up as rejected', async () => {
    const { queue } = setup()
    await queue.enqueue(unknown('q-1'), jpeg())
    const { api } = server(async () => {
      throw new Error('FileReader failed')
    })
    const out = await queue.flush(api)
    expect(out.pictureFailures?.map((f) => f.reason)).toEqual(['rejected'])
  })

  it('a Picture whose stored Blob is gone (the device cleared it) is given up as missing', async () => {
    const { queue, pictures } = setup()
    await queue.enqueue(unknown('q-1'), jpeg())
    await pictures.remove('q-1')
    const { api, sync, uploadPicture } = server()
    const out = await queue.flush(api)
    expect(uploadPicture).not.toHaveBeenCalled()
    expect((sync.mock.calls[0]?.[0] as Op[])[0]?.productImage).toBeUndefined()
    expect(out.pictureFailures).toEqual([{ clientUuid: 'q-1', productName: 'Tinned tomatoes 400 g', reason: 'missing' }])
    expect((await queue.pending())).toEqual([])
  })

  it('the other Ops of the batch are unaffected and no failure is reported when all is well', async () => {
    const { queue } = setup()
    await queue.enqueue(unknown('bad'), jpeg(1))
    await queue.enqueue(unknown('good'), jpeg(2))
    const { api, sync } = server(async (b) => {
      if (b.size === 1) throw new ApiError(413, 'image_too_large', 'big')
      return ID_B
    })
    const out = await queue.flush(api)
    expect((sync.mock.calls[0]?.[0] as Op[]).map((o) => [o.clientUuid, o.productImage])).toEqual([['bad', undefined], ['good', ID_B]])
    expect(out.pictureFailures?.map((f) => f.clientUuid)).toEqual(['bad'])
    const clean = setup()
    await clean.queue.enqueue(unknown('ok'), jpeg())
    expect((await clean.queue.flush(server().api)).pictureFailures).toBeUndefined()
  })
})
