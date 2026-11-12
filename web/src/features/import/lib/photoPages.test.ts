// Unit tests of the photo-read state model (docs/dev/design/photo-read.md sections 2 and 12.1).
// They use only the shapes of section 2 (literal edits and states), not the ImageEditor's implementation.
import { describe, expect, it } from 'vitest'
import { moveItem } from '../../../ui/Sortable'
import {
  MAX_PHOTOS,
  READ_MIN_CROP_PX,
  SMALL_PHOTO_SIDE,
  blockReason,
  canAdd,
  count,
  draftOutputSize,
  initialPhotoPages,
  isSmallPhoto,
  nextToIntake,
  nextToRender,
  photoNumber,
  photoPagesReducer as reduce,
  readyToSend,
  toReadInput,
  type ImageEdit,
  type Photo,
  type PhotoPagesAction,
  type PhotoPagesState,
  type PhotoSource,
} from './photoPages'

const file = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' })
const files = (n: number) => Array.from({ length: n }, (_, i) => file(`f${i}.jpg`))
const edit = (turns: 0 | 1 | 2 | 3, x: number, y: number, width: number, height: number): ImageEdit => ({ turns, crop: { x, y, width, height } })
const full = (w: number, h: number) => edit(0, 0, 0, w, h)

const imageSource = (w = 2000, h = 1500): PhotoSource => ({ kind: 'image', working: new Blob(['w']), width: w, height: h, origin: 'file' })
const asIsSource: PhotoSource = { kind: 'as-is', blob: new Blob(['h']), type: 'image/heic', name: 'IMG_1.heic' }
const linkSource: PhotoSource = { kind: 'link', url: 'https://example.com/a.jpg' }

const ready = (w = 1500, h = 1000) => ({ status: 'ready' as const, blob: new Blob(['o']), width: w, height: h, type: 'image/jpeg' })

function photo(id: string, over: Partial<Photo> = {}): Photo {
  const source = over.source ?? imageSource()
  return { id, source, edit: null, output: source.kind === 'image' ? ready() : ready(0, 0), revision: 0, ...over }
}
function state(over: Partial<PhotoPagesState> = {}): PhotoPagesState {
  return { ...initialPhotoPages(), ...over }
}
const photos = (n: number) => Array.from({ length: n }, (_, i) => photo(`p${i + 1}`))
const editing = (id: string, draft: ImageEdit, isNew: boolean) => ({ id, draft, isNew })
const run = (s: PhotoPagesState, ...actions: PhotoPagesAction[]) => actions.reduce(reduce, s)
const ids = (s: PhotoPagesState) => s.photos.map((p) => p.id)

describe('constants and small photo', () => {
  it('defines the limits once', () => {
    expect(MAX_PHOTOS).toBe(4)
    expect(SMALL_PHOTO_SIDE).toBe(1000)
    expect(READ_MIN_CROP_PX).toBe(160)
  })
  it('isSmallPhoto is true at 999 and false at 1000 (long side)', () => {
    expect(isSmallPhoto({ width: 999, height: 500 })).toBe(true)
    expect(isSmallPhoto({ width: 500, height: 999 })).toBe(true)
    expect(isSmallPhoto({ width: 1000, height: 10 })).toBe(false)
    expect(isSmallPhoto({ width: 10, height: 1000 })).toBe(false)
    expect(isSmallPhoto({ width: 999, height: 999 })).toBe(true)
  })
})

describe('initial state', () => {
  it('is empty, idle, with ids starting at p1', () => {
    const s = initialPhotoPages()
    expect(s).toMatchObject({ photos: [], editing: null, queue: [], intake: 'idle', problem: null })
    expect(reduce(s, { type: 'added', source: linkSource }).photos[0]?.id).toBe('p1')
  })
})

describe('added', () => {
  it('appends an image photo: pending, revision 0, no edit, and opens a new editor on the whole picture', () => {
    const src = imageSource(2000, 1500)
    const s = reduce(state(), { type: 'added', source: src })
    expect(s.photos).toHaveLength(1)
    expect(s.photos[0]).toMatchObject({ id: 'p1', source: src, edit: null, output: { status: 'pending' }, revision: 0 })
    expect(s.editing).toEqual({ id: 'p1', draft: { turns: 0, crop: { x: 0, y: 0, width: 2000, height: 1500 } }, isNew: true })
  })
  it('appends as-is and link photos as ready at once, without opening the editor', () => {
    const s = run(state(), { type: 'added', source: asIsSource }, { type: 'added', source: linkSource })
    expect(s.editing).toBeNull()
    expect(s.photos.map((p) => p.output.status)).toEqual(['ready', 'ready'])
    expect(s.photos.map((p) => p.edit)).toEqual([null, null])
  })
  it('gives unique, never reused ids', () => {
    let s = run(state(), { type: 'added', source: linkSource }, { type: 'added', source: linkSource })
    s = reduce(s, { type: 'removed', id: 'p1' })
    s = reduce(s, { type: 'added', source: linkSource })
    expect(ids(s)).toEqual(['p2', 'p3'])
  })
  it('is refused at 4 photos: no change except the too_many_photos problem', () => {
    const s0 = state({ photos: photos(4), nextId: 5 })
    const s = reduce(s0, { type: 'added', source: imageSource() })
    expect(s.photos).toEqual(s0.photos)
    expect(s.editing).toBeNull()
    expect(s.nextId).toBe(5)
    expect(s.problem?.code).toBe('too_many_photos')
  })
  it('does not count the queue or the intake in photos (the file being prepared becomes this photo)', () => {
    const s = reduce(state({ photos: photos(3), queue: files(0), intake: 'preparing', nextId: 4 }), { type: 'added', source: linkSource })
    expect(s.photos).toHaveLength(4)
    expect(s.intake).toBe('preparing')
  })
  it('clears the panel message', () => {
    const s = reduce(state({ problem: { code: 'unreadable' } }), { type: 'added', source: linkSource })
    expect(s.problem).toBeNull()
  })
})

describe('queued', () => {
  it('appends files in order while there is room', () => {
    const f = files(3)
    const s = reduce(state(), { type: 'queued', files: f })
    expect(s.queue).toEqual(f)
    expect(s.problem).toBeNull()
  })
  it('keeps the first `room` files and reports the dropped count', () => {
    const f = files(6)
    const s = reduce(state({ photos: photos(1) }), { type: 'queued', files: f })
    expect(s.queue).toEqual(f.slice(0, 3))
    expect(s.problem).toMatchObject({ code: 'too_many_photos', count: 3 })
  })
  it('room formula: 1 photo + 2 queued + preparing -> room 0, a pick of 1 is all dropped', () => {
    const s0 = state({ photos: photos(1), queue: files(2), intake: 'preparing' })
    const s = reduce(s0, { type: 'queued', files: files(1) })
    expect(s.queue).toEqual(s0.queue)
    expect(s.problem).toMatchObject({ code: 'too_many_photos', count: 1 })
  })
  it('room formula: 2 photos (one new in the editor), empty queue, idle -> room 2 (the photo in the editor is counted once)', () => {
    const s0 = state({ photos: photos(2), editing: editing('p2', full(2000, 1500), true) })
    const f = files(3)
    const s = reduce(s0, { type: 'queued', files: f })
    expect(s.queue).toEqual(f.slice(0, 2))
    expect(s.problem).toMatchObject({ code: 'too_many_photos', count: 1 })
  })
  it('room never goes below 0', () => {
    const s = reduce(state({ photos: photos(4), intake: 'preparing' }), { type: 'queued', files: files(2) })
    expect(s.queue).toEqual([])
    expect(s.problem).toMatchObject({ code: 'too_many_photos', count: 2 })
  })
  it('an empty pick changes nothing', () => {
    const s0 = state({ photos: photos(1) })
    expect(reduce(s0, { type: 'queued', files: [] })).toEqual(s0)
  })
})

describe('intakeStarted and intakeEnded', () => {
  it('intakeStarted takes queue[0] off and sets preparing; the room stays the same', () => {
    const f = files(2)
    const s0 = state({ queue: f })
    const s = reduce(s0, { type: 'intakeStarted' })
    expect(s.queue).toEqual([f[1]])
    expect(s.intake).toBe('preparing')
    // room before: 4 - 0 - 2 - 0 = 2; after: 4 - 0 - 1 - 1 = 2
    expect(reduce(s0, { type: 'queued', files: files(5) }).queue).toHaveLength(2 + 2)
    expect(reduce(s, { type: 'queued', files: files(5) }).queue).toHaveLength(1 + 2)
  })
  it('intakeEnded sets idle', () => {
    expect(reduce(state({ intake: 'preparing' }), { type: 'intakeEnded' }).intake).toBe('idle')
  })
})

describe('editStarted, draftChanged', () => {
  it('opens the saved edit as the draft, not new', () => {
    const saved = edit(1, 10, 20, 300, 400)
    const s = reduce(state({ photos: [photo('p1', { edit: saved })] }), { type: 'editStarted', id: 'p1' })
    expect(s.editing).toEqual({ id: 'p1', draft: saved, isNew: false })
  })
  it('opens the whole picture when never edited', () => {
    const s = reduce(state({ photos: [photo('p1', { source: imageSource(800, 600) })] }), { type: 'editStarted', id: 'p1' })
    expect(s.editing).toEqual({ id: 'p1', draft: full(800, 600), isNew: false })
  })
  it('is ignored for as-is and link photos', () => {
    const s0 = state({ photos: [photo('p1', { source: asIsSource }), photo('p2', { source: linkSource })] })
    expect(reduce(s0, { type: 'editStarted', id: 'p1' })).toEqual(s0)
    expect(reduce(s0, { type: 'editStarted', id: 'p2' })).toEqual(s0)
  })
  it('is ignored for an unknown id', () => {
    const s0 = state({ photos: photos(1) })
    expect(reduce(s0, { type: 'editStarted', id: 'zz' })).toEqual(s0)
  })
  it('a failed photo can be edited again', () => {
    const s0 = state({ photos: [photo('p1', { output: { status: 'failed', problem: 'render_failed' } })] })
    expect(reduce(s0, { type: 'editStarted', id: 'p1' }).editing?.id).toBe('p1')
  })
  it('draftChanged replaces the draft only while editing', () => {
    const s0 = state({ photos: photos(1), editing: editing('p1', full(2000, 1500), false) })
    const d = edit(2, 5, 5, 500, 500)
    expect(reduce(s0, { type: 'draftChanged', draft: d }).editing).toEqual({ id: 'p1', draft: d, isNew: false })
    const idle = state({ photos: photos(1) })
    expect(reduce(idle, { type: 'draftChanged', draft: d })).toEqual(idle)
  })
})

describe('editCommitted', () => {
  const base = (draft: ImageEdit, isNew = false) =>
    state({ photos: [photo('p1', { source: imageSource(2000, 1500), revision: 2, edit: edit(1, 1, 1, 1000, 1000) })], editing: editing('p1', draft, isNew) })
  it('stores the draft, bumps the revision, sets pending and closes the editor', () => {
    const d = edit(1, 100, 50, 800, 900)
    const s = reduce(base(d), { type: 'editCommitted' })
    expect(s.photos[0]).toMatchObject({ edit: d, revision: 3, output: { status: 'pending' } })
    expect(s.editing).toBeNull()
  })
  it('stores null for a full edit (no turn, whole picture)', () => {
    const s = reduce(base(full(2000, 1500)), { type: 'editCommitted' })
    expect(s.photos[0]?.edit).toBeNull()
    expect(s.photos[0]?.revision).toBe(3)
  })
  it('a turned edit that covers the whole turned picture is not full', () => {
    const d = edit(1, 0, 0, 1500, 2000)
    expect(reduce(base(d), { type: 'editCommitted' }).photos[0]?.edit).toEqual(d)
  })
  it('commits a new photo too (it stays in the list)', () => {
    const s = reduce(base(full(2000, 1500), true), { type: 'editCommitted' })
    expect(ids(s)).toEqual(['p1'])
  })
  it('does nothing when no editor is open', () => {
    const s0 = state({ photos: photos(1) })
    expect(reduce(s0, { type: 'editCommitted' })).toEqual(s0)
  })
  it('retries a failed photo: pending again', () => {
    const s0 = state({
      photos: [photo('p1', { output: { status: 'failed', problem: 'too_large' } })],
      editing: editing('p1', edit(0, 0, 0, 500, 500), false),
    })
    expect(reduce(s0, { type: 'editCommitted' }).photos[0]?.output).toEqual({ status: 'pending' })
  })
})

describe('editCancelled', () => {
  it('removes a new photo and closes the editor', () => {
    const s = reduce(state({ photos: photos(2), editing: editing('p2', full(2000, 1500), true) }), { type: 'editCancelled' })
    expect(ids(s)).toEqual(['p1'])
    expect(s.editing).toBeNull()
  })
  it('keeps the saved edit of an existing photo and closes the editor', () => {
    const saved = edit(1, 0, 0, 100, 100)
    const p = photo('p1', { edit: saved, revision: 4 })
    const s = reduce(state({ photos: [p], editing: editing('p1', edit(2, 9, 9, 200, 200), false) }), { type: 'editCancelled' })
    expect(s.photos).toEqual([p])
    expect(s.editing).toBeNull()
  })
  it('does nothing when no editor is open', () => {
    const s0 = state({ photos: photos(1) })
    expect(reduce(s0, { type: 'editCancelled' })).toEqual(s0)
  })
})

describe('queue and editor: nextToIntake', () => {
  const f = files(2)
  it('is undefined while an editor is open, new or existing', () => {
    expect(nextToIntake(state({ queue: f, photos: photos(1), editing: editing('p1', full(2000, 1500), true) }))).toBeUndefined()
    expect(nextToIntake(state({ queue: f, photos: photos(1), editing: editing('p1', full(2000, 1500), false) }))).toBeUndefined()
  })
  it('is undefined while preparing', () => {
    expect(nextToIntake(state({ queue: f, intake: 'preparing' }))).toBeUndefined()
  })
  it('is queue[0] when idle with no editor, undefined with an empty queue', () => {
    expect(nextToIntake(state({ queue: f }))).toBe(f[0])
    expect(nextToIntake(state())).toBeUndefined()
  })
  it('after commit the editor is closed and the next queued file is up', () => {
    const s = run(state({ photos: photos(1), editing: editing('p1', full(2000, 1500), true), queue: f }), { type: 'editCommitted' })
    expect(nextToIntake(s)).toBe(f[0])
  })
  it('cancel of a new queued photo removes it, closes the editor, and the next queued file is up (same as commit)', () => {
    const s = run(state({ photos: photos(1), editing: editing('p1', full(2000, 1500), true), queue: f }), { type: 'editCancelled' })
    expect(s.photos).toEqual([])
    expect(s.editing).toBeNull()
    expect(nextToIntake(s)).toBe(f[0])
  })
  it('the whole multi-pick cycle: take, add, commit, take, add, cancel', () => {
    let s = run(state(), { type: 'queued', files: files(2) })
    const first = nextToIntake(s)
    expect(first).toBeDefined()
    s = run(s, { type: 'intakeStarted' }, { type: 'added', source: imageSource() }, { type: 'intakeEnded' })
    expect(nextToIntake(s)).toBeUndefined()
    s = reduce(s, { type: 'editCommitted' })
    expect(nextToIntake(s)).toBeDefined()
    s = run(s, { type: 'intakeStarted' }, { type: 'added', source: imageSource() }, { type: 'intakeEnded' }, { type: 'editCancelled' })
    expect(s.photos).toHaveLength(1)
    expect(nextToIntake(s)).toBeUndefined()
  })
})

describe('removed', () => {
  it('removes the photo and keeps the others in order', () => {
    expect(ids(reduce(state({ photos: photos(3) }), { type: 'removed', id: 'p2' }))).toEqual(['p1', 'p3'])
  })
  it('closes the editor when it was on that photo', () => {
    const s = reduce(state({ photos: photos(2), editing: editing('p2', full(2000, 1500), false) }), { type: 'removed', id: 'p2' })
    expect(s.editing).toBeNull()
  })
  it('does not clear the queue', () => {
    const q = files(2)
    expect(reduce(state({ photos: photos(1), queue: q }), { type: 'removed', id: 'p1' }).queue).toEqual(q)
  })
  it('an unknown id changes nothing', () => {
    const s0 = state({ photos: photos(2) })
    expect(reduce(s0, { type: 'removed', id: 'zz' })).toEqual(s0)
  })
  it('a failed photo can be removed', () => {
    const s = reduce(state({ photos: [photo('p1', { output: { status: 'failed', problem: 'render_failed' } })] }), { type: 'removed', id: 'p1' })
    expect(s.photos).toEqual([])
  })
})

describe('moved', () => {
  it('reorders with moveItem and keeps ids, edits and outputs', () => {
    const s0 = state({ photos: photos(4) })
    const s = reduce(s0, { type: 'moved', from: 0, to: 2 })
    expect(s.photos).toEqual(moveItem(s0.photos, 0, 2))
    expect(ids(s)).toEqual(['p2', 'p3', 'p1', 'p4'])
  })
  it('clamps like moveItem', () => {
    expect(ids(reduce(state({ photos: photos(3) }), { type: 'moved', from: 0, to: 99 }))).toEqual(['p2', 'p3', 'p1'])
  })
  it('is refused while editing', () => {
    const s0 = state({ photos: photos(3), editing: editing('p1', full(2000, 1500), false) })
    expect(reduce(s0, { type: 'moved', from: 0, to: 2 })).toEqual(s0)
  })
  it('does not bump revisions', () => {
    expect(reduce(state({ photos: photos(2) }), { type: 'moved', from: 0, to: 1 }).photos.map((p) => p.revision)).toEqual([0, 0])
  })
})

describe('rendered and renderFailed', () => {
  const pending = (revision: number) => photo('p1', { output: { status: 'pending' }, revision })
  const out = { blob: new Blob(['r']), width: 1200, height: 900, type: 'image/jpeg' }
  it('applies a render for the current revision', () => {
    const s = reduce(state({ photos: [pending(3)] }), { type: 'rendered', id: 'p1', revision: 3, out })
    expect(s.photos[0]?.output).toEqual({ status: 'ready', ...out })
  })
  it('ignores a stale render', () => {
    const s0 = state({ photos: [pending(3)] })
    expect(reduce(s0, { type: 'rendered', id: 'p1', revision: 2, out })).toEqual(s0)
  })
  it('ignores a render for a removed photo', () => {
    const s0 = state({ photos: [pending(0)] })
    expect(reduce(s0, { type: 'rendered', id: 'p9', revision: 0, out })).toEqual(s0)
  })
  it('renderFailed marks the current revision failed with its problem', () => {
    const s = reduce(state({ photos: [pending(1)] }), { type: 'renderFailed', id: 'p1', revision: 1, problem: 'too_large' })
    expect(s.photos[0]?.output).toEqual({ status: 'failed', problem: 'too_large' })
  })
  it('ignores a stale failure', () => {
    const s0 = state({ photos: [pending(1)] })
    expect(reduce(s0, { type: 'renderFailed', id: 'p1', revision: 0, problem: 'render_failed' })).toEqual(s0)
  })
})

describe('problemSet and problemCleared', () => {
  it('the newest message wins; clearing empties it', () => {
    let s = run(state(), { type: 'problemSet', problem: { code: 'unsupported' } }, { type: 'problemSet', problem: { code: 'too_large', limit: 'original' } })
    expect(s.problem).toEqual({ code: 'too_large', limit: 'original' })
    s = reduce(s, { type: 'problemCleared' })
    expect(s.problem).toBeNull()
  })
})

describe('selectors', () => {
  it('count and canAdd', () => {
    expect(count(state({ photos: photos(2) }))).toBe(2)
    expect(canAdd(state())).toBe(true)
    expect(canAdd(state({ photos: photos(3) }))).toBe(true)
    expect(canAdd(state({ photos: photos(4) }))).toBe(false)
  })
  it('canAdd counts the queue and the file being prepared', () => {
    expect(canAdd(state({ photos: photos(2), queue: files(2) }))).toBe(false)
    expect(canAdd(state({ photos: photos(3), intake: 'preparing' }))).toBe(false)
    expect(canAdd(state({ photos: photos(2), queue: files(1), intake: 'preparing' }))).toBe(false)
    expect(canAdd(state({ photos: photos(2), queue: files(1) }))).toBe(true)
  })
  it('canAdd is false while editing', () => {
    expect(canAdd(state({ photos: photos(1), editing: editing('p1', full(2000, 1500), false) }))).toBe(false)
  })
  it('photoNumber is the 1-based position and follows a move', () => {
    const s = reduce(state({ photos: photos(3) }), { type: 'moved', from: 2, to: 0 })
    expect(photoNumber(s, 'p3')).toBe(1)
    expect(photoNumber(s, 'p1')).toBe(2)
    expect(photoNumber(s, 'p2')).toBe(3)
  })
})

describe('nextToRender', () => {
  const pend = (id: string, over: Partial<Photo> = {}) => photo(id, { output: { status: 'pending' }, ...over })
  it('is the first image photo with a pending output', () => {
    const s = state({ photos: [photo('p1'), pend('p2'), pend('p3')] })
    expect(nextToRender(s)?.id).toBe('p2')
  })
  it('skips a photo whose editor is open', () => {
    const s = state({ photos: [pend('p1'), pend('p2')], editing: editing('p1', full(2000, 1500), true) })
    expect(nextToRender(s)?.id).toBe('p2')
    expect(nextToRender(state({ photos: [pend('p1')], editing: editing('p1', full(2000, 1500), true) }))).toBeUndefined()
  })
  it('never picks ready, failed, as-is or link photos', () => {
    const s = state({
      photos: [photo('p1'), photo('p2', { output: { status: 'failed', problem: 'render_failed' } }), photo('p3', { source: asIsSource }), photo('p4', { source: linkSource })],
    })
    expect(nextToRender(s)).toBeUndefined()
  })
})

describe('readyToSend and blockReason', () => {
  const failed = (id: string) => photo(id, { output: { status: 'failed', problem: 'render_failed' } })
  const pend = (id: string) => photo(id, { output: { status: 'pending' } })
  const open = editing('p1', full(2000, 1500), false)

  it('is true for 1 to 4 ready photos with nothing in flight', () => {
    expect(readyToSend(state({ photos: photos(1) }))).toBe(true)
    expect(readyToSend(state({ photos: [photo('p1'), photo('p2', { source: asIsSource }), photo('p3', { source: linkSource }), photo('p4')] }))).toBe(true)
    expect(blockReason(state({ photos: photos(2) }))).toBeNull()
  })
  it('is false without photos, and blockReason says nothing then', () => {
    expect(readyToSend(state())).toBe(false)
    expect(blockReason(state())).toBeNull()
  })
  it('editing blocks', () => {
    const s = state({ photos: photos(1), editing: open })
    expect(readyToSend(s)).toBe(false)
    expect(blockReason(s)).toBe('editing')
  })
  it('a pending output blocks as preparing', () => {
    const s = state({ photos: [photo('p1'), pend('p2')] })
    expect(readyToSend(s)).toBe(false)
    expect(blockReason(s)).toBe('preparing')
  })
  it('intake blocks as preparing', () => {
    const s = state({ photos: photos(1), intake: 'preparing' })
    expect(readyToSend(s)).toBe(false)
    expect(blockReason(s)).toBe('preparing')
  })
  it('a non-empty queue blocks as preparing', () => {
    const s = state({ photos: photos(1), queue: files(1) })
    expect(readyToSend(s)).toBe(false)
    expect(blockReason(s)).toBe('preparing')
  })
  it('a failed photo blocks and the reason names the first failed photo', () => {
    const s = state({ photos: [photo('p1'), failed('p2'), failed('p3')] })
    expect(readyToSend(s)).toBe(false)
    expect(blockReason(s)).toEqual({ failed: 'p2' })
  })
  it('editing wins over preparing, preparing wins over failed', () => {
    expect(blockReason(state({ photos: [failed('p1')], editing: open, queue: files(1) }))).toBe('editing')
    expect(blockReason(state({ photos: [failed('p1'), pend('p2')] }))).toBe('preparing')
    expect(blockReason(state({ photos: [failed('p1')], intake: 'preparing' }))).toBe('preparing')
  })
  it('a pending or failed output never goes to the server: toReadInput refuses', () => {
    expect(() => toReadInput(state({ photos: [pend('p1')] }), { p1: 'data:image/jpeg;base64,AA==' })).toThrow()
    expect(() => toReadInput(state({ photos: [failed('p1')] }), { p1: 'data:image/jpeg;base64,AA==' })).toThrow()
  })
})

describe('draftOutputSize', () => {
  it('is undefined when no editor is open', () => {
    expect(draftOutputSize(state({ photos: photos(1) }))).toBeUndefined()
  })
  it('is the draft crop shrunk to 2576 px, never enlarged', () => {
    const s = (w: number, h: number) => state({ photos: photos(1), editing: editing('p1', edit(0, 0, 0, w, h), false) })
    expect(draftOutputSize(s(900, 600))).toEqual({ width: 900, height: 600 })
    expect(draftOutputSize(s(4000, 2000))).toEqual({ width: 2576, height: 1288 })
    expect(draftOutputSize(s(2000, 4000))).toEqual({ width: 1288, height: 2576 })
  })
})

describe('toReadInput', () => {
  it('keeps list order, not creation order', () => {
    const s0 = state({ photos: [photo('p1'), photo('p2'), photo('p3')] })
    const s = reduce(s0, { type: 'moved', from: 2, to: 0 })
    const urls = { p1: 'data:image/jpeg;base64,AA==', p2: 'data:image/jpeg;base64,AQ==', p3: 'data:image/jpeg;base64,Ag==' }
    const input = toReadInput(s, urls)
    expect(input.kind).toBe('photo')
    expect(input.photos.map((p) => (p.kind === 'blob' ? p.dataUrl : p.url))).toEqual([urls.p3, urls.p1, urls.p2])
  })
  it('maps a ready image to a blob RawImage carrying the output blob, size, type, data URL and origin', () => {
    const output = ready(1200, 900)
    const s = state({ photos: [photo('p1', { source: { ...(imageSource() as Extract<PhotoSource, { kind: 'image' }>), origin: 'camera' }, output })] })
    const [raw] = toReadInput(s, { p1: 'data:image/jpeg;base64,AA==' }).photos
    expect(raw).toMatchObject({ kind: 'blob', width: 1200, height: 900, type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==', origin: 'camera' })
    expect(raw?.kind === 'blob' && raw.blob).toBe(output.blob)
  })
  it('maps as-is to its data URL with the DECLARED type and width and height 0', () => {
    const s = state({ photos: [photo('p1', { source: { ...asIsSource, type: 'image/heif' } })] })
    const [raw] = toReadInput(s, { p1: 'data:image/heif;base64,AA==' }).photos
    expect(raw).toMatchObject({ kind: 'blob', type: 'image/heif', width: 0, height: 0, dataUrl: 'data:image/heif;base64,AA==' })
  })
  it('maps a link to {kind: url} and needs no data URL', () => {
    const s = state({ photos: [photo('p1', { source: linkSource })] })
    expect(toReadInput(s, {}).photos).toEqual([{ kind: 'url', url: 'https://example.com/a.jpg' }])
  })
  it('throws when a blob photo has no data URL', () => {
    expect(() => toReadInput(state({ photos: photos(1) }), {})).toThrow()
  })
})

describe('invariants over random action sequences', () => {
  // A small deterministic generator (no Math.random).
  function rng(seed: number) {
    let x = seed
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296
      return x / 4294967296
    }
  }
  function pick(state: PhotoPagesState, r: () => number): PhotoPagesAction {
    const some = state.photos[Math.floor(r() * state.photos.length)]
    const n = Math.floor(r() * 12)
    switch (n) {
      case 0: return { type: 'queued', files: files(1 + Math.floor(r() * 5)) }
      case 1: return { type: 'intakeStarted' }
      case 2: return { type: 'added', source: [imageSource(), asIsSource, linkSource][Math.floor(r() * 3)] as PhotoSource }
      case 3: return { type: 'intakeEnded' }
      case 4: return { type: 'editStarted', id: some?.id ?? 'p1' }
      case 5: return { type: 'draftChanged', draft: edit(1, 0, 0, 400, 300) }
      case 6: return { type: 'editCommitted' }
      case 7: return { type: 'editCancelled' }
      case 8: return { type: 'removed', id: some?.id ?? 'p1' }
      case 9: return { type: 'moved', from: Math.floor(r() * 4), to: Math.floor(r() * 4) }
      case 10: return { type: 'rendered', id: some?.id ?? 'p1', revision: some?.revision ?? 0, out: { blob: new Blob(['r']), width: 10, height: 10, type: 'image/jpeg' } }
      default: return { type: 'renderFailed', id: some?.id ?? 'p1', revision: some?.revision ?? 0, problem: 'render_failed' }
    }
  }
  it('as the hook drives it: at most 4 in all, unique ids, a valid editing session', () => {
    let sawPhoto = false
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed)
      let s = initialPhotoPages()
      for (let step = 0; step < 80; step++) {
        const a = pick(s, r)
        // The hook only starts an intake when nextToIntake says so, and only ends one it started.
        if (a.type === 'intakeStarted' && nextToIntake(s) === undefined) continue
        if (a.type === 'intakeEnded' && s.intake !== 'preparing') continue
        // The hook only adds the file it is preparing.
        if (a.type === 'added' && s.intake !== 'preparing') continue
        s = reduce(s, a)
        sawPhoto ||= s.photos.length > 0
        expect(s.photos.length).toBeLessThanOrEqual(MAX_PHOTOS)
        // The sum holds at rest only: between `added` and `intakeEnded` the prepared file is counted twice.
        if (s.intake === 'idle') expect(s.photos.length + s.queue.length).toBeLessThanOrEqual(MAX_PHOTOS)
        expect(new Set(ids(s)).size).toBe(s.photos.length)
        if (s.editing) {
          const target = s.photos.find((p) => p.id === s.editing?.id)
          expect(target).toBeDefined()
          expect(target?.source.kind).toBe('image')
        }
        for (const p of s.photos) if (p.source.kind !== 'image') expect(p.edit).toBeNull()
      }
    }
    expect(sawPhoto).toBe(true)
  })
})
