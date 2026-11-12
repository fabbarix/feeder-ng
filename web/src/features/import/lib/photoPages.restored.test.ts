// The `restored` action of the photo-pages reducer (docs/dev/design/photo-store.md "Restore"). Choices pinned here where the doc is silent:
//  * restored photos go BEFORE the photos added while the load ran, keep their stored ids, and are cut to the room left (4 - live - queue - preparing);
//  * a live photo whose id a restored photo also holds is renamed to a fresh id from the counter (the open editor follows it);
//  * the counter only moves forward; nothing opens an editor, nothing sets a problem; an image comes back `pending` (rendered again), the others `ready`.
import { describe, expect, it } from 'vitest'
import { initialPhotoPages, nextToIntake, nextToRender, photoPagesReducer as reduce, type Photo, type PhotoPagesState, type PhotoSource } from './photoPages'
import type { SavablePhoto } from './photoStore'

const image = (id: string, edit: SavablePhoto['edit'] = null): SavablePhoto => ({
  id,
  source: { kind: 'image', working: new Blob(['w']), width: 2000, height: 1500, origin: 'file' },
  edit,
})
const heic = (id: string): SavablePhoto => ({ id, source: { kind: 'as-is', blob: new Blob(['h']), type: 'image/heic', name: 'a.heic' }, edit: null })
const link = (id: string): SavablePhoto => ({ id, source: { kind: 'link', url: 'https://example.com/a.jpg' }, edit: null })
const live = (id: string, source: PhotoSource = { kind: 'image', working: new Blob(['l']), width: 800, height: 600, origin: 'camera' }): Photo => ({
  id,
  source,
  edit: null,
  output: { status: 'pending' },
  revision: 0,
})
const state = (over: Partial<PhotoPagesState> = {}): PhotoPagesState => ({ ...initialPhotoPages(), ...over })
const ids = (s: PhotoPagesState) => s.photos.map((p) => p.id)

describe('restored: on an empty list', () => {
  const s = reduce(state(), { type: 'restored', photos: [image('p1', { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } }), heic('p2'), link('p4')], nextId: 5 })
  it('lists them in the order given, with their ids as stored', () => {
    expect(ids(s)).toEqual(['p1', 'p2', 'p4'])
  })
  it('moves the counter past the stored ids', () => {
    expect(s.nextId).toBe(5)
    expect(ids(reduce(s, { type: 'added', source: { kind: 'link', url: 'https://example.com/b.jpg' } }))).toEqual(['p1', 'p2', 'p4', 'p5'])
  })
  it('keeps the saved edit and starts every photo at revision 0', () => {
    expect(s.photos[0]!.edit).toEqual({ turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    expect(s.photos.map((p) => p.revision)).toEqual([0, 0, 0])
  })
  it('an image comes back pending (the output is rendered again); as-is and link are ready at once', () => {
    expect(s.photos.map((p) => p.output.status)).toEqual(['pending', 'ready', 'ready'])
    expect(nextToRender(s)?.id).toBe('p1')
  })
  it('opens no editor, sets no problem and queues nothing', () => {
    expect(s.editing).toBeNull()
    expect(s.problem).toBeNull()
    expect(s.queue).toEqual([])
    expect(s.intake).toBe('idle')
  })
  it('an as-is photo is ready with its declared type', () => {
    expect(s.photos[1]!.output).toMatchObject({ status: 'ready', type: 'image/heic' })
  })
})

describe('restored: with photos added while the load ran', () => {
  it('puts the restored photos first and the live ones after, in their own order', () => {
    const s = reduce(state({ photos: [live('p1'), live('p2')], nextId: 3 }), { type: 'restored', photos: [image('p1'), image('p2')], nextId: 3 })
    expect(s.photos).toHaveLength(4)
    expect(ids(s).slice(0, 2)).toEqual(['p1', 'p2'])
    expect(s.photos.slice(2).map((p) => p.source.kind === 'image' && p.source.width)).toEqual([800, 800])
  })
  it('gives a live photo that clashes with a restored id a fresh one, and the open editor follows it', () => {
    const s = reduce(
      state({ photos: [live('p1')], nextId: 2, editing: { id: 'p1', draft: { turns: 0, crop: { x: 0, y: 0, width: 800, height: 600 } }, isNew: true } }),
      { type: 'restored', photos: [image('p1'), image('p2')], nextId: 3 },
    )
    expect(new Set(ids(s)).size).toBe(3)
    expect(ids(s).slice(0, 2)).toEqual(['p1', 'p2'])
    const moved = s.photos[2]!
    expect(moved.id).not.toMatch(/^p[12]$/)
    expect(s.editing?.id).toBe(moved.id)
    expect(s.nextId).toBeGreaterThan(Number(moved.id.slice(1)))
  })
  it('never lowers the counter', () => {
    const s = reduce(state({ nextId: 9 }), { type: 'restored', photos: [image('p1')], nextId: 2 })
    expect(s.nextId).toBe(9)
  })
  it('keeps no more than the room: 4 - live - queued - the file being prepared', () => {
    const s = reduce(state({ photos: [live('p3')], queue: [new File(['x'], 'q.jpg')], intake: 'preparing', nextId: 4 }), {
      type: 'restored',
      photos: [image('p1'), image('p2'), heic('p4')],
      nextId: 5,
    })
    expect(s.photos).toHaveLength(2)
    expect(ids(s)[0]).toBe('p1')
  })
  it('does not break the sum invariant (photos + queue + preparing never above 4)', () => {
    const s = reduce(state({ photos: [live('p1'), live('p2')], queue: [new File(['x'], 'q.jpg')], nextId: 3 }), {
      type: 'restored',
      photos: [image('p1'), image('p2'), image('p3'), image('p4')],
      nextId: 5,
    })
    expect(s.photos.length + s.queue.length + (s.intake === 'preparing' ? 1 : 0)).toBeLessThanOrEqual(4)
  })
  it('a pick waiting in the queue is taken in only when no editor is open (restore does not open one)', () => {
    const s = reduce(state({ queue: [new File(['x'], 'q.jpg')] }), { type: 'restored', photos: [image('p1')], nextId: 2 })
    expect(s.editing).toBeNull()
    expect(nextToIntake(s)?.name).toBe('q.jpg')
  })
})
