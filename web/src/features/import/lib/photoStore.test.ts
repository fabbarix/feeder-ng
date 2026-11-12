import { describe, expect, it } from 'vitest'
import {
  createMemoryPhotoStore,
  MAX_PHOTOS,
  persistPhotos,
  restorePhotos,
  toRecords,
  type PhotoRecord,
  type SavablePhoto,
  type StoredEdit,
  type StoredSource,
} from './photoStore'

const blob = (size = 10, type = 'image/jpeg') => new Blob([new Uint8Array(size)], { type })
const image = (over: Partial<Extract<StoredSource, { kind: 'image' }>> = {}): StoredSource => ({
  kind: 'image', working: blob(), width: 800, height: 600, origin: 'camera', ...over,
})
const edit: StoredEdit = { turns: 1, crop: { x: 10, y: 20, width: 300, height: 200 } }
const photo = (id: string, over: Partial<SavablePhoto> = {}): SavablePhoto => ({ id, source: image(), edit: null, ...over })
const rec = (id: string, order: number, over: Partial<PhotoRecord> = {}): PhotoRecord => ({ id, order, source: image(), edit: null, ...over })
const ids = (rs: { id: string }[]) => rs.map((r) => r.id)

describe('MAX_PHOTOS', () => {
  it('is 4', () => expect(MAX_PHOTOS).toBe(4))
})

describe('createMemoryPhotoStore', () => {
  it('starts empty', async () => {
    expect(await createMemoryPhotoStore().load()).toEqual([])
  })

  it('loads in page order, whatever the order of saving', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p2', 1))
    await s.save(rec('p3', 2))
    await s.save(rec('p1', 0))
    expect(ids(await s.load())).toEqual(['p1', 'p2', 'p3'])
  })

  it('saving an id again replaces that record', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0))
    await s.save(rec('p1', 0, { edit }))
    const all = await s.load()
    expect(all).toHaveLength(1)
    expect(all[0]!.edit).toEqual(edit)
  })

  it('keeps the Blob and the fields of a record', async () => {
    const s = createMemoryPhotoStore()
    const r = rec('p1', 0, { source: { kind: 'as-is', blob: blob(5, 'image/heic'), type: 'image/heic', name: 'a.heic' } })
    await s.save(r)
    expect((await s.load())[0]).toEqual(r)
  })

  it('removes one record and ignores an unknown id', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0))
    await s.save(rec('p2', 1))
    await s.remove('p1')
    await s.remove('nope')
    expect(ids(await s.load())).toEqual(['p2'])
  })

  it('clear removes everything', async () => {
    const s = createMemoryPhotoStore()
    await s.save(rec('p1', 0))
    await s.save(rec('p2', 1))
    await s.clear()
    expect(await s.load()).toEqual([])
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
})

describe('toRecords', () => {
  it('numbers the order from the position in the list', () => {
    const rs = toRecords([photo('p4'), photo('p1'), photo('p2')])
    expect(rs.map((r) => [r.id, r.order])).toEqual([['p4', 0], ['p1', 1], ['p2', 2]])
  })

  it('keeps source and edit, and nothing else of the photo', () => {
    const p = { ...photo('p1', { edit }), output: { status: 'ready', blob: blob(99) }, revision: 7 }
    const r = toRecords([p])[0]!
    expect(Object.keys(r).sort()).toEqual(['edit', 'id', 'order', 'source'])
    expect(r.source).toBe(p.source)
    expect(r.edit).toEqual(edit)
  })

  it('gives an empty list for no photos', () => {
    expect(toRecords([])).toEqual([])
  })
})

describe('persistPhotos', () => {
  it('writes every photo', async () => {
    const s = createMemoryPhotoStore()
    await persistPhotos(s, [photo('p1'), photo('p2', { edit })])
    const all = await s.load()
    expect(ids(all)).toEqual(['p1', 'p2'])
    expect(all[1]!.edit).toEqual(edit)
  })

  it('removes stored photos that left the list', async () => {
    const s = createMemoryPhotoStore()
    await persistPhotos(s, [photo('p1'), photo('p2'), photo('p3')])
    await persistPhotos(s, [photo('p1'), photo('p3')])
    expect(ids(await s.load())).toEqual(['p1', 'p3'])
  })

  it('follows a reorder', async () => {
    const s = createMemoryPhotoStore()
    await persistPhotos(s, [photo('p1'), photo('p2')])
    await persistPhotos(s, [photo('p2'), photo('p1')])
    expect(ids(await s.load())).toEqual(['p2', 'p1'])
  })

  it('an empty list empties the store', async () => {
    const s = createMemoryPhotoStore()
    await persistPhotos(s, [photo('p1')])
    await persistPhotos(s, [])
    expect(await s.load()).toEqual([])
  })
})

describe('restorePhotos', () => {
  it('turns good records into photos in page order, ids renumbered', () => {
    const { photos, nextId } = restorePhotos([rec('p7', 1, { edit }), rec('p3', 0)])
    expect(ids(photos)).toEqual(['p1', 'p2'])
    expect(photos[1]!.edit).toEqual(edit)
    expect(nextId).toBe(3)
  })

  it('restores each kind of source', () => {
    const asIs: StoredSource = { kind: 'as-is', blob: blob(5, 'image/heif'), type: 'image/heif' }
    const link: StoredSource = { kind: 'link', url: 'https://example.com/a.jpg' }
    const { photos } = restorePhotos([rec('a', 0), rec('b', 1, { source: asIs }), rec('c', 2, { source: link })])
    expect(photos.map((p) => p.source.kind)).toEqual(['image', 'as-is', 'link'])
  })

  it('gives nothing back for nothing', () => {
    expect(restorePhotos([])).toEqual({ photos: [], nextId: 1 })
  })

  it('keeps at most MAX_PHOTOS, the first by order', () => {
    const six = [5, 4, 3, 2, 1, 0].map((o) => rec(`x${o}`, o))
    const { photos, nextId } = restorePhotos(six)
    expect(photos).toHaveLength(MAX_PHOTOS)
    expect(ids(photos)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(nextId).toBe(5)
  })

  it('drops broken records and counts the limit on the good ones', () => {
    const records: unknown[] = [null, 'x', 42, { id: 'a' }, rec('g1', 0), { ...rec('bad', 1), source: null }, rec('g2', 2)]
    expect(ids(restorePhotos(records).photos)).toEqual(['p1', 'p2'])
    const many = [{ id: 'bad' }, { id: 'bad2' }, rec('a', 2), rec('b', 3), rec('c', 4), rec('d', 5), rec('e', 6)]
    expect(restorePhotos(many).photos).toHaveLength(4)
  })

  it.each([
    ['no id', { ...rec('a', 0), id: undefined }],
    ['empty id', rec('', 0)],
    ['order not a number', { ...rec('a', 0), order: 'first' }],
    ['order NaN', rec('a', Number.NaN)],
    ['unknown source kind', { ...rec('a', 0), source: { kind: 'video' } }],
    ['image without a Blob', { ...rec('a', 0), source: { kind: 'image', working: 'bytes', width: 8, height: 6, origin: 'file' } }],
    ['image with an empty Blob', rec('a', 0, { source: image({ working: blob(0) }) })],
    ['image with zero width', rec('a', 0, { source: image({ width: 0 }) })],
    ['image with a fractional height', rec('a', 0, { source: image({ height: 1.5 }) })],
    ['image with an unknown origin', { ...rec('a', 0), source: { ...image(), origin: 'telepathy' } }],
    ['as-is with a type that is not heic or heif', { ...rec('a', 0), source: { kind: 'as-is', blob: blob(), type: 'image/png' } }],
    ['as-is with an empty Blob', rec('a', 0, { source: { kind: 'as-is', blob: blob(0, 'image/heic'), type: 'image/heic' } })],
    ['link that is not https', rec('a', 0, { source: { kind: 'link', url: 'http://example.com/a.jpg' } })],
    ['link with a data url', rec('a', 0, { source: { kind: 'link', url: 'data:image/png;base64,AAAA' } })],
    ['edit with turns 4', { ...rec('a', 0), edit: { ...edit, turns: 4 } }],
    ['edit with a zero-size crop', { ...rec('a', 0), edit: { turns: 0, crop: { x: 0, y: 0, width: 0, height: 10 } } }],
    ['edit with a negative origin', { ...rec('a', 0), edit: { turns: 0, crop: { x: -1, y: 0, width: 10, height: 10 } } }],
    ['edit that is not an object', { ...rec('a', 0), edit: 'turned' }],
  ])('drops a record with %s', (_name, bad) => {
    const { photos, nextId } = restorePhotos([bad, rec('ok', 1)])
    expect(photos).toHaveLength(1)
    expect(photos[0]!.id).toBe('p1')
    expect(nextId).toBe(2)
  })

  it('drops a second record with an id already seen', () => {
    const { photos } = restorePhotos([rec('a', 0), rec('a', 1, { edit })])
    expect(photos).toHaveLength(1)
    expect(photos[0]!.edit).toBeNull()
  })

  it('treats a missing edit as none, and an edit on as-is or link as none', () => {
    const asIs: StoredSource = { kind: 'as-is', blob: blob(5, 'image/heic'), type: 'image/heic' }
    const noEdit = { ...rec('a', 0) } as Record<string, unknown>
    delete noEdit.edit
    const { photos } = restorePhotos([noEdit, rec('b', 1, { source: asIs, edit })])
    expect(photos.map((p) => p.edit)).toEqual([null, null])
  })

  it('does not hand back the record objects themselves, and adds no output or revision', () => {
    const r = rec('a', 0)
    const p = restorePhotos([r]).photos[0]!
    expect(p).not.toBe(r)
    expect(Object.keys(p).sort()).toEqual(['edit', 'id', 'source'])
  })

  it('round-trips toRecords', () => {
    const before = [photo('p1', { edit }), photo('p2'), photo('p3')]
    const { photos } = restorePhotos(toRecords(before))
    expect(photos).toEqual(before)
  })
})
