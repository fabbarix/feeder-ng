import { describe, expect, it } from 'vitest'
import {
  createMemoryPhotoStore,
  createPhotoWriter,
  IMAGE_ORIGINS,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  persistPhotos,
  restorePhotos,
  toRecords,
  type PhotoRecord,
  type PhotoStore,
  type SavablePhoto,
  type StoredEdit,
  type StoredSource,
} from './photoStore'

const USER = 7
const blob = (size = 10, type = 'image/jpeg') => new Blob([new Uint8Array(size)], { type })
const image = (over: Partial<Extract<StoredSource, { kind: 'image' }>> = {}): StoredSource => ({
  kind: 'image', working: blob(), width: 800, height: 600, origin: 'camera', ...over,
})
const asIs = (over: Partial<Extract<StoredSource, { kind: 'as-is' }>> = {}): StoredSource => ({
  kind: 'as-is', blob: blob(5, 'image/heic'), type: 'image/heic', ...over,
})
const link = (url = 'https://example.com/a.jpg'): StoredSource => ({ kind: 'link', url })
const edit: StoredEdit = { turns: 1, crop: { x: 10, y: 20, width: 300, height: 200 } }
const photo = (id: string, over: Partial<SavablePhoto> = {}): SavablePhoto => ({ id, source: image(), edit: null, ...over })
const rec = (id: string, order: number, over: Partial<PhotoRecord> = {}): PhotoRecord => ({ id, userId: USER, order, source: image(), edit: null, ...over })
const ids = (rs: { id: string }[]) => rs.map((r) => r.id)
const restore = (records: readonly unknown[]) => restorePhotos(records, USER)
const loaded = async (s: PhotoStore) => restore(await s.load()).photos

/** A memory store that counts what it was asked to write. */
function spyStore() {
  const inner = createMemoryPhotoStore()
  const log: string[] = []
  const store: PhotoStore = {
    load: () => inner.load(),
    keys: () => inner.keys(),
    save: (r) => (log.push(`save ${r.id}`), inner.save(r)),
    update: (id, c) => (log.push(`update ${id}`), inner.update(id, c)),
    remove: (id) => (log.push(`remove ${id}`), inner.remove(id)),
    clear: () => (log.push('clear'), inner.clear()),
  }
  return { store, log, saves: () => log.filter((l) => l.startsWith('save')).length }
}

/** A hand-made store for the writer: keeps ids in a Set, can fail a call and can hold the first save/clear at a gate. */
function fakeStore() {
  const stored = new Set<string>()
  const log: string[] = []
  const c = { running: 0, maxRunning: 0, failOn: new Set<string>(), gate: null as Promise<void> | null }
  async function run(label: string, fn: () => void) {
    c.running++
    c.maxRunning = Math.max(c.maxRunning, c.running)
    try {
      const gate = c.gate
      if (gate) {
        c.gate = null
        await gate
      }
      await Promise.resolve()
      if (c.failOn.has(label)) {
        c.failOn.delete(label)
        throw new Error(`boom ${label}`)
      }
      log.push(label)
      fn()
    } finally {
      c.running--
    }
  }
  const store: PhotoStore = {
    load: async () => [],
    keys: async () => [...stored],
    save: (r) => run(`save ${r.id}`, () => stored.add(r.id)),
    update: (id) => run(`update ${id}`, () => undefined),
    remove: (id) => run(`remove ${id}`, () => stored.delete(id)),
    clear: () => run('clear', () => stored.clear()),
  }
  const hold = () => {
    let release!: () => void
    c.gate = new Promise<void>((r) => (release = r))
    return release
  }
  return { store, stored, log, c, hold, saves: (id: string) => log.filter((l) => l === `save ${id}`).length }
}

describe('constants', () => {
  it('MAX_PHOTOS is 4 and a Blob is at most 8 MB', () => {
    expect(MAX_PHOTOS).toBe(4)
    expect(MAX_PHOTO_BYTES).toBe(8 * 1024 * 1024)
  })
  it('lists the origins of ImageOrigin', () => {
    expect([...IMAGE_ORIGINS].sort()).toEqual(['camera', 'drop', 'file', 'link', 'paste'])
  })
})

describe('createMemoryPhotoStore', () => {
  it('starts empty', async () => {
    const s = createMemoryPhotoStore()
    expect(await s.load()).toEqual([])
    expect(await s.keys()).toEqual([])
  })

  it('loads every saved record and lists their ids', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p2', 1))
    await s.save(rec('p1', 0))
    expect(ids((await s.load()) as PhotoRecord[]).sort()).toEqual(['p1', 'p2'])
    expect((await s.keys()).sort()).toEqual(['p1', 'p2'])
  })

  it('saving an id again replaces that record', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0))
    await s.save(rec('p1', 0, { edit }))
    const all = (await s.load()) as PhotoRecord[]
    expect(all).toHaveLength(1)
    expect(all[0]!.edit).toEqual(edit)
  })

  it('keeps the Blob and the fields of a record', async () => {
    const s = createMemoryPhotoStore()
    const r = rec('p1', 0, { source: asIs({ name: 'a.heic' }) })
    await s.save(r)
    expect((await s.load())[0]).toEqual(r)
  })

  it('update changes only the order and the edit', async () => {
    const s = createMemoryPhotoStore()
    const r = rec('p1', 0)
    await s.save(r)
    await s.update('p1', { order: 3, edit })
    expect((await s.load())[0]).toEqual({ ...r, order: 3, edit })
    await s.update('p1', { order: 3, edit: null })
    expect(((await s.load())[0] as PhotoRecord).edit).toBeNull()
  })

  it('update of an unknown id does nothing', async () => {
    const s = createMemoryPhotoStore()
    await s.update('p9', { order: 0, edit })
    expect(await s.load()).toEqual([])
    expect(await s.keys()).toEqual([])
  })

  it('removes one record and ignores an unknown id', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0))
    await s.save(rec('p2', 1))
    await s.remove('p1')
    await s.remove('nope')
    expect(await s.keys()).toEqual(['p2'])
  })

  it('clear removes everything', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0))
    await s.save(rec('p2', 1))
    await s.clear()
    expect(await s.load()).toEqual([])
    expect(await s.keys()).toEqual([])
  })

  it('does not share state between two stores', async () => {
    const a = createMemoryPhotoStore()
    const b = createMemoryPhotoStore()
    await a.save(rec('p1', 0))
    expect(await b.load()).toEqual([])
  })

  it('does not let a caller change stored records through a loaded array', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0))
    const first = await s.load()
    first.pop()
    expect(await s.load()).toHaveLength(1)
  })

  it('copies source and edit on the way in', async () => {
    const s = createMemoryPhotoStore()
    const r = rec('p1', 0, { edit: { turns: 0, crop: { x: 1, y: 2, width: 30, height: 40 } } })
    await s.save(r)
    ;(r.source as { width: number }).width = 1
    r.edit!.crop.x = 99
    const [got] = (await s.load()) as PhotoRecord[]
    expect((got!.source as { width: number }).width).toBe(800)
    expect(got!.edit!.crop.x).toBe(1)
  })

  it('copies source and edit on the way out', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0, { edit }))
    const [got] = (await s.load()) as PhotoRecord[]
    ;(got!.source as { width: number }).width = 1
    got!.edit!.turns = 3
    got!.edit!.crop.width = 1
    const [again] = (await s.load()) as PhotoRecord[]
    expect((again!.source as { width: number }).width).toBe(800)
    expect(again!.edit).toEqual(edit)
    expect(again!.source).not.toBe(got!.source)
  })
})

describe('toRecords', () => {
  it('numbers the order from the position in the list and carries the user', () => {
    const rs = toRecords([photo('p4'), photo('p1'), photo('p2')], USER)
    expect(rs.map((r) => [r.id, r.order, r.userId])).toEqual([['p4', 0, USER], ['p1', 1, USER], ['p2', 2, USER]])
  })

  it('keeps source and edit, and nothing else of the photo', () => {
    const p = { ...photo('p1', { edit }), output: { status: 'ready', blob: blob(99) }, revision: 7 }
    const r = toRecords([p], USER)[0]!
    expect(Object.keys(r).sort()).toEqual(['edit', 'id', 'order', 'source', 'userId'])
    expect(r.source).toBe(p.source)
    expect(r.edit).toEqual(edit)
  })

  it('gives an empty list for no photos', () => {
    expect(toRecords([], USER)).toEqual([])
  })
})

describe('persistPhotos', () => {
  it('previous null is a full write', async () => {
    const { store, saves } = spyStore()
    await persistPhotos(store, [photo('p1'), photo('p2', { edit })], null, USER)
    expect(saves()).toBe(2)
    const got = await loaded(store)
    expect(ids(got)).toEqual(['p1', 'p2'])
    expect(got[1]!.edit).toEqual(edit)
  })

  it('an add writes one Blob', async () => {
    const { store, saves } = spyStore()
    const a = photo('p1')
    await persistPhotos(store, [a], null, USER)
    const before = saves()
    await persistPhotos(store, [a, photo('p2')], [a], USER)
    expect(saves() - before).toBe(1)
    expect(ids(await loaded(store))).toEqual(['p1', 'p2'])
  })

  it('a reorder writes no Blob, only metadata', async () => {
    const { store, saves, log } = spyStore()
    const a = photo('p1')
    const b = photo('p2')
    await persistPhotos(store, [a, b], null, USER)
    const before = saves()
    log.length = 0
    await persistPhotos(store, [b, a], [a, b], USER)
    expect(saves() - before).toBe(0)
    expect(log.some((l) => l.startsWith('save'))).toBe(false)
    expect(log.filter((l) => l.startsWith('update')).sort()).toEqual(['update p1', 'update p2'])
    expect(ids(await loaded(store))).toEqual(['p2', 'p1'])
  })

  it('an edit writes no Blob, one update', async () => {
    const { store, log } = spyStore()
    const a = photo('p1')
    await persistPhotos(store, [a], null, USER)
    log.length = 0
    await persistPhotos(store, [{ ...a, edit }], [a], USER)
    expect(log).toEqual(['update p1'])
    expect((await loaded(store))[0]!.edit).toEqual(edit)
  })

  it('a replaced source object is saved again', async () => {
    const { store, log } = spyStore()
    const a = photo('p1')
    await persistPhotos(store, [a], null, USER)
    log.length = 0
    await persistPhotos(store, [{ ...a, source: image({ width: 400 }) }], [a], USER)
    expect(log).toEqual(['save p1'])
  })

  it('does nothing when nothing changed', async () => {
    const { store, log } = spyStore()
    const a = photo('p1')
    const b = photo('p2', { edit })
    await persistPhotos(store, [a, b], null, USER)
    log.length = 0
    await persistPhotos(store, [a, b], [a, b], USER)
    expect(log).toEqual([])
  })

  it('removes the stored ids that left, before saving', async () => {
    const { store, log } = spyStore()
    const a = photo('p1')
    const b = photo('p2')
    await persistPhotos(store, [a, b], null, USER)
    log.length = 0
    const c = photo('p3')
    await persistPhotos(store, [b, c], [a, b], USER)
    expect(log[0]).toBe('remove p1')
    expect(log).toContain('save p3')
    expect(log.indexOf('remove p1')).toBeLessThan(log.indexOf('save p3'))
    expect(ids(await loaded(store))).toEqual(['p2', 'p3'])
  })

  it('removes a stray stored id even though previous never had it', async () => {
    const { store } = spyStore()
    await store.save(rec('p9', 0))
    const a = photo('p1')
    await persistPhotos(store, [a], [], USER)
    expect(await store.keys()).toEqual(['p1'])
  })

  it('an empty list empties the store', async () => {
    const { store } = spyStore()
    const a = photo('p1')
    await persistPhotos(store, [a], null, USER)
    await persistPhotos(store, [], [a], USER)
    expect(await store.keys()).toEqual([])
  })

  it('writes the user with each saved record', async () => {
    const { store } = spyStore()
    await persistPhotos(store, [photo('p1')], null, 42)
    expect(restorePhotos(await store.load(), 42).photos).toHaveLength(1)
    expect(restorePhotos(await store.load(), USER).photos).toHaveLength(0)
  })
})

describe('restorePhotos', () => {
  it('turns good records into photos in page order, ids kept', () => {
    const { photos, nextId, otherUser } = restore([rec('p7', 1, { edit }), rec('p3', 0)])
    expect(ids(photos)).toEqual(['p3', 'p7'])
    expect(photos[1]!.edit).toEqual(edit)
    expect(nextId).toBe(8)
    expect(otherUser).toBe(false)
  })

  it('nextId is the highest kept number + 1, wherever it is in the order', () => {
    expect(restore([rec('p12', 0), rec('p2', 1)]).nextId).toBe(13)
  })

  it('restores each kind of source', () => {
    const { photos } = restore([rec('p1', 0), rec('p2', 1, { source: asIs() }), rec('p3', 2, { source: link() })])
    expect(photos.map((p) => p.source.kind)).toEqual(['image', 'as-is', 'link'])
  })

  it('gives nothing back for nothing', () => {
    expect(restore([])).toEqual({ photos: [], nextId: 1, otherUser: false })
  })

  it('keeps at most MAX_PHOTOS, the first by order', () => {
    const six = [5, 4, 3, 2, 1, 0].map((o) => rec(`p${o + 1}`, o))
    const { photos, nextId } = restore(six)
    expect(ids(photos)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(nextId).toBe(5)
  })

  it('drops broken records and counts the limit on the good ones', () => {
    const records: unknown[] = [null, 'x', 42, { id: 'p9' }, rec('p1', 0), { ...rec('p8', 1), source: null }, rec('p2', 2)]
    expect(ids(restore(records).photos)).toEqual(['p1', 'p2'])
    const many = [{ id: 'p8' }, { id: 'p9' }, rec('p1', 2), rec('p2', 3), rec('p3', 4), rec('p4', 5), rec('p5', 6)]
    expect(restore(many).photos).toHaveLength(4)
  })

  it.each([
    ['no id', { ...rec('p1', 0), id: undefined }],
    ['empty id', rec('', 0)],
    ['id without the p', rec('1', 0)],
    ['id p0', rec('p0', 0)],
    ['id with a leading zero', rec('p01', 0)],
    ['id with letters after the number', rec('p1a', 0)],
    ['id of another shape', rec('photo-1', 0)],
    ['order not a number', { ...rec('p1', 0), order: 'first' }],
    ['order NaN', rec('p1', Number.NaN)],
    ['unknown source kind', { ...rec('p1', 0), source: { kind: 'video' } }],
    ['image without a Blob', { ...rec('p1', 0), source: { kind: 'image', working: 'bytes', width: 8, height: 6, origin: 'file' } }],
    ['image with an empty Blob', rec('p1', 0, { source: image({ working: blob(0) }) })],
    ['image whose Blob type is not image/*', rec('p1', 0, { source: image({ working: blob(10, 'text/html') }) })],
    ['image whose Blob has no type', rec('p1', 0, { source: image({ working: blob(10, '') }) })],
    ['image over 8 MB', rec('p1', 0, { source: image({ working: blob(MAX_PHOTO_BYTES + 1) }) })],
    ['image with zero width', rec('p1', 0, { source: image({ width: 0 }) })],
    ['image with a fractional height', rec('p1', 0, { source: image({ height: 1.5 }) })],
    ['image with an unknown origin', { ...rec('p1', 0), source: { ...image(), origin: 'telepathy' } }],
    ['as-is with a type that is not heic or heif', { ...rec('p1', 0), source: { kind: 'as-is', blob: blob(), type: 'image/png' } }],
    ['as-is with an empty Blob', rec('p1', 0, { source: asIs({ blob: blob(0, 'image/heic') }) })],
    ['as-is over 8 MB', rec('p1', 0, { source: asIs({ blob: blob(MAX_PHOTO_BYTES + 1, 'image/heic') }) })],
    ['link that is not https', rec('p1', 0, { source: link('http://example.com/a.jpg') })],
    ['link with a data url', rec('p1', 0, { source: link('data:image/png;base64,AAAA') })],
    ['link with credentials', rec('p1', 0, { source: link('https://user:pass@example.com/a.jpg') })],
    ['link that is not a string', { ...rec('p1', 0), source: { kind: 'link', url: 5 } }],
    ['edit with turns 4', { ...rec('p1', 0), edit: { ...edit, turns: 4 } }],
    ['edit with a zero-size crop', { ...rec('p1', 0), edit: { turns: 0, crop: { x: 0, y: 0, width: 0, height: 10 } } }],
    ['edit with a negative origin', { ...rec('p1', 0), edit: { turns: 0, crop: { x: -1, y: 0, width: 10, height: 10 } } }],
    ['edit that is not an object', { ...rec('p1', 0), edit: 'turned' }],
    ['crop wider than the working copy', rec('p1', 0, { edit: { turns: 0, crop: { x: 0, y: 0, width: 801, height: 100 } } })],
    ['crop reaching past the right edge', rec('p1', 0, { edit: { turns: 0, crop: { x: 700, y: 0, width: 101, height: 100 } } })],
    ['crop reaching past the bottom edge', rec('p1', 0, { edit: { turns: 2, crop: { x: 0, y: 500, width: 100, height: 101 } } })],
    ['crop too wide once turned (800x600 turned once is 600 wide)', rec('p1', 0, { edit: { turns: 1, crop: { x: 0, y: 0, width: 700, height: 100 } } })],
    ['crop too tall once turned (turned 3 times is 800 tall)', rec('p1', 0, { edit: { turns: 3, crop: { x: 0, y: 0, width: 100, height: 801 } } })],
  ])('drops a record with %s', (_name, bad) => {
    const { photos, nextId } = restore([bad, rec('p5', 1)])
    expect(ids(photos)).toEqual(['p5'])
    expect(nextId).toBe(6)
  })

  it('keeps a crop that fits exactly, turned or not', () => {
    const turned1: StoredEdit = { turns: 1, crop: { x: 100, y: 200, width: 500, height: 600 } } // 600 x 800 after one turn
    const turned0: StoredEdit = { turns: 0, crop: { x: 0, y: 0, width: 800, height: 600 } }
    expect(ids(restore([rec('p1', 0, { edit: turned1 }), rec('p2', 1, { edit: turned0 })]).photos)).toEqual(['p1', 'p2'])
  })

  it('keeps an image of exactly 8 MB and an as-is of exactly 8 MB', () => {
    const big = rec('p1', 0, { source: image({ working: blob(MAX_PHOTO_BYTES) }) })
    const bigHeic = rec('p2', 1, { source: asIs({ blob: blob(MAX_PHOTO_BYTES, 'image/heic') }) })
    expect(ids(restore([big, bigHeic]).photos)).toEqual(['p1', 'p2'])
  })

  it('drops a second record with an id already seen', () => {
    const { photos } = restore([rec('p1', 0), rec('p1', 1, { edit })])
    expect(photos).toHaveLength(1)
    expect(photos[0]!.edit).toBeNull()
  })

  it('treats a missing edit as none, and an edit on as-is or link as none', () => {
    const noEdit = { ...rec('p1', 0) } as Record<string, unknown>
    delete noEdit.edit
    const { photos } = restore([noEdit, rec('p2', 1, { source: asIs(), edit }), rec('p3', 2, { source: link(), edit })])
    expect(photos.map((p) => p.edit)).toEqual([null, null, null])
  })

  it('does not hand back the record objects themselves, and adds no output, revision or user', () => {
    const r = rec('p1', 0)
    const p = restore([r]).photos[0]!
    expect(p).not.toBe(r)
    expect(Object.keys(p).sort()).toEqual(['edit', 'id', 'source'])
  })

  it('round-trips toRecords', () => {
    const before = [photo('p1', { edit }), photo('p2'), photo('p3')]
    expect(restore(toRecords(before, USER)).photos).toEqual(before)
  })

  it('restores only the records of this User', () => {
    const r = restorePhotos([rec('p1', 0), rec('p2', 1, { userId: 9 })], USER)
    expect(ids(r.photos)).toEqual(['p1'])
    expect(r.otherUser).toBe(true)
  })

  it('records of another User alone give no photos and say so', () => {
    const r = restorePhotos([rec('p1', 0, { userId: 9 })], USER)
    expect(r).toEqual({ photos: [], nextId: 1, otherUser: true })
  })

  it('a record with no user or a wrong kind of user counts as another User', () => {
    const noUser = { ...rec('p1', 0), userId: undefined }
    const strUser = { ...rec('p2', 1), userId: String(USER) }
    const r = restore([noUser, strUser])
    expect(r.photos).toEqual([])
    expect(r.otherUser).toBe(true)
  })

  it('a broken record is not "another User"', () => {
    expect(restore([null, { id: 'p1' }]).otherUser).toBe(false)
  })
})

describe('createPhotoWriter', () => {
  it('does nothing before start()', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.persist([photo('p1')])
    await w.idle()
    expect(f.log).toEqual([])
  })

  it('writes the list after start()', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    w.persist([photo('p1'), photo('p2')])
    await w.idle()
    expect([...f.stored].sort()).toEqual(['p1', 'p2'])
  })

  it('start(restored) knows what is stored: only the new photo is written', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    const old = photo('p1')
    f.stored.add('p1')
    w.start([old])
    w.persist([old, photo('p2')])
    await w.idle()
    expect(f.log).toEqual(['save p2'])
  })

  it('runs one operation at a time, in order', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    w.persist([photo('p1')])
    w.persist([photo('p1'), photo('p2')])
    w.clear()
    await w.idle()
    expect(f.c.maxRunning).toBe(1)
  })

  it('replaces a queued persist by the newest list', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    const release = f.hold()
    w.persist([photo('p1')])
    w.persist([photo('p2')])
    w.persist([photo('p3')])
    release()
    await w.idle()
    expect(f.saves('p1')).toBe(1)
    expect(f.saves('p2')).toBe(0)
    expect(f.saves('p3')).toBe(1)
    expect([...f.stored].sort()).toEqual(['p3'])
  })

  it('swallows a failure, never throws, and carries on', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    f.c.failOn.add('save p1')
    expect(() => w.persist([photo('p1')])).not.toThrow()
    await expect(w.idle()).resolves.toBeUndefined()
    w.persist([photo('p2')])
    await w.idle()
    expect(f.stored.has('p2')).toBe(true)
  })

  it('after a failure the next persist rewrites everything', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    const a = photo('p1')
    const b = photo('p2')
    w.persist([a])
    await w.idle()
    f.c.failOn.add('save p2')
    w.persist([a, b])
    await w.idle()
    w.persist([a, b])
    await w.idle()
    expect(f.saves('p1')).toBe(2)
    expect(f.saves('p2')).toBe(1)
  })

  it('a failure in keys() or remove is swallowed too', async () => {
    const f = fakeStore()
    const w = createPhotoWriter({ ...f.store, keys: () => Promise.reject(new Error('no keys')) }, USER)
    w.start()
    w.persist([photo('p1')])
    await expect(w.idle()).resolves.toBeUndefined()
    w.clear()
    await expect(w.idle()).resolves.toBeUndefined()
  })

  it('clear() empties the store', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    w.persist([photo('p1')])
    w.clear()
    await w.idle()
    expect(f.stored.size).toBe(0)
    expect(f.log.at(-1)).toBe('clear')
  })

  it('clear() drops queued persists and runs after the one in flight', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    const release = f.hold()
    w.persist([photo('p1')])
    w.persist([photo('p2')])
    w.clear()
    release()
    await w.idle()
    expect(f.saves('p2')).toBe(0)
    expect(f.log.indexOf('save p1')).toBeLessThan(f.log.indexOf('clear'))
    expect(f.stored.size).toBe(0)
  })

  it('clear() resets previous: the same list is written in full afterwards', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    const a = photo('p1')
    w.persist([a])
    await w.idle()
    w.clear()
    await w.idle()
    w.persist([a])
    await w.idle()
    expect(f.saves('p1')).toBe(2)
    expect(f.stored.has('p1')).toBe(true)
  })

  it('a persist after clear() still writes', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    w.clear()
    w.persist([photo('p5')])
    await w.idle()
    expect([...f.stored]).toEqual(['p5'])
  })

  it('a failed clear() is swallowed and forgets previous', async () => {
    const f = fakeStore()
    const w = createPhotoWriter(f.store, USER)
    w.start()
    const a = photo('p1')
    w.persist([a])
    await w.idle()
    f.c.failOn.add('clear')
    w.clear()
    await expect(w.idle()).resolves.toBeUndefined()
    w.persist([a])
    await w.idle()
    expect(f.saves('p1')).toBe(2)
  })
})
