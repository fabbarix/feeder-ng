// usePhotoPages: intake, checks, edit and render, previews and object URLs (docs/dev/design/photo-read.md sections 3.5, 4.1, 4.2, 12.2).
// The store, restore and clearing rules are in usePhotoPages.store.test.tsx. The engine is a fake (no canvas); the store a memory one.
// Phase-1 reviewer conditions pinned here: (1) intake never runs while an editor is open; (2) no object URL from a link's empty placeholder
// Blob; (5) TooManyPixelsError is recognised with instanceof (a look-alike Error is not).
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AS_IS_MAX_BYTES, INPUT_MAX_BYTES, INPUT_MAX_PIXELS, TooManyPixelsError, type ImageEdit } from '../../../ui'
import { createFakeEngine, createSpyStore, createUrlLog, deferred, fileOfSize, jpegHeader, meHolder, pngHeader, webpHeader } from '../fakeReadEngine.test-helper'
import { blockReason } from '../lib/photoPages'
import { usePhotoPages, type PhotoPagesDeps } from './usePhotoPages'

vi.mock('../../../app/useMe', async () => (await import('../fakeReadEngine.test-helper')).useMeModule())

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/recipes/import']}>{children}</MemoryRouter>
const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 15))))
const full = (w: number, h: number): ImageEdit => ({ turns: 0, crop: { x: 0, y: 0, width: w, height: h } })

function mount(over: Partial<PhotoPagesDeps> = {}, size?: { width: number; height: number }) {
  const engine = createFakeEngine(size)
  const urls = createUrlLog()
  const store = createSpyStore()
  const view = renderHook(() => usePhotoPages({ engine, objectUrls: urls.api, store, ...over }), { wrapper })
  const add = (files: File[], origin: 'file' | 'camera' | 'paste' | 'drop' = 'file') => act(() => view.result.current.addFiles(files, origin))
  const state = () => view.result.current.state
  const editingId = () => view.result.current.state.editing?.id
  const settle = () => waitFor(() => expect(state().intake).toBe('idle'))
  return { ...view, engine, urls, store, add, state, editingId, settle }
}
type Mounted = ReturnType<typeof mount>
const commitDraft = (m: Mounted, draft?: ImageEdit) => {
  if (draft) act(() => m.result.current.setDraft(draft))
  act(() => m.result.current.commit())
}

beforeEach(() => {
  meHolder.data = { id: 7, email: 'ann@example.com', displayName: 'Ann', isAdmin: false }
})
afterEach(() => vi.restoreAllMocks())

describe('intake: one file at a time, an editor for each', () => {
  it('takes a file in, makes a photo of its working copy and opens the editor on it (new, whole picture)', async () => {
    const m = mount()
    const file = jpg('a.jpg')
    await m.add([file], 'camera')
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    expect(m.engine.normalise).toHaveBeenCalledWith(file, { maxPixels: INPUT_MAX_PIXELS })
    const photo = m.state().photos[0]!
    expect(photo.source).toMatchObject({ kind: 'image', width: 2000, height: 1500, origin: 'camera' })
    expect(m.state().editing).toEqual({ id: 'p1', draft: full(2000, 1500), isNew: true })
    expect(m.result.current.editorUrl).toBeTruthy()
    expect(m.result.current.busy).toBe(false)
  })

  it('with three files, takes the second in only after the first photo is used', async () => {
    const m = mount()
    await m.add([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    await flush()
    expect(m.engine.normalise).toHaveBeenCalledTimes(1)
    expect(m.state().queue).toHaveLength(2)
    commitDraft(m)
    await waitFor(() => expect(m.editingId()).toBe('p2'))
    expect(m.engine.normalise).toHaveBeenCalledTimes(2)
    expect((m.engine.normalise.mock.calls[1]![0] as File).name).toBe('b.jpg')
  })

  it('Cancel on the first (new) photo removes it and the second file opens in the editor', async () => {
    const m = mount()
    await m.add([jpg('a.jpg'), jpg('b.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    act(() => m.result.current.cancel())
    await waitFor(() => expect(m.editingId()).toBe('p2'))
    expect(m.state().photos.map((p) => p.id)).toEqual(['p2'])
  })

  it('CONDITION 1: a file added while an editor is open waits (new photo editor)', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    await m.add([jpg('b.jpg')])
    await flush()
    expect(m.engine.normalise).toHaveBeenCalledTimes(1)
    expect(m.state().queue).toHaveLength(1)
    commitDraft(m)
    await waitFor(() => expect(m.engine.normalise).toHaveBeenCalledTimes(2))
  })

  it('CONDITION 1: nor while an existing photo is being edited again; Cancel lets it go on', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    commitDraft(m)
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    act(() => m.result.current.edit('p1'))
    expect(m.editingId()).toBe('p1')
    await m.add([jpg('b.jpg')])
    await flush()
    expect(m.engine.normalise).toHaveBeenCalledTimes(1)
    act(() => m.result.current.cancel())
    await waitFor(() => expect(m.engine.normalise).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(m.editingId()).toBe('p2'))
  })

  it('does not start a second intake while one is in flight, and says it is busy', async () => {
    const m = mount()
    const first = deferred<Awaited<ReturnType<typeof m.engine.normalise>>>()
    m.engine.normalise.mockImplementationOnce(() => first.promise)
    await m.add([jpg('a.jpg'), jpg('b.jpg')])
    await flush()
    expect(m.engine.normalise).toHaveBeenCalledTimes(1)
    expect(m.result.current.busy).toBe(true)
    expect(m.result.current.canRead).toBe(false)
    expect(blockReason(m.state())).toBe('preparing')
    await act(async () => first.resolve(await createFakeEngine().normalise(jpg('a.jpg'))))
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    expect(m.engine.normalise).toHaveBeenCalledTimes(1)
  })

  it('a pick of five keeps four (the first ones) and says how many were left out', async () => {
    const m = mount()
    await m.add(['a', 'b', 'c', 'd', 'e'].map((n) => jpg(`${n}.jpg`)))
    expect(m.state().problem).toMatchObject({ code: 'too_many_photos', count: 1 })
    expect(m.state().photos.length + m.state().queue.length + (m.state().intake === 'preparing' ? 1 : 0)).toBe(4)
  })
})

describe('intake: the checks before and after decoding', () => {
  it.each([
    ['a type that is not a picture', new File(['x'], 'a.txt', { type: 'text/plain' }), 'unsupported'],
    ['an empty file', new File([], 'a.jpg', { type: 'image/jpeg' }), 'empty'],
  ])('refuses %s without decoding', async (_name, file, code) => {
    const m = mount()
    await m.add([file])
    await waitFor(() => expect(m.state().problem?.code).toBe(code))
    expect(m.engine.normalise).not.toHaveBeenCalled()
    expect(m.state().photos).toEqual([])
  })

  it('refuses an original over 30 MB as too_large with limit "original", accepts exactly 30 MB', async () => {
    const m = mount()
    await m.add([fileOfSize('big.jpg', 'image/jpeg', INPUT_MAX_BYTES + 1)])
    await waitFor(() => expect(m.state().problem).toMatchObject({ code: 'too_large', limit: 'original' }))
    expect(m.engine.normalise).not.toHaveBeenCalled()
    act(() => m.result.current.dismissProblem())
    expect(m.state().problem).toBeNull()
    await m.add([fileOfSize('ok.jpg', 'image/jpeg', INPUT_MAX_BYTES)])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
  })

  it.each([
    ['JPEG', jpegHeader(8000, 7000), 'image/jpeg'],
    ['PNG', pngHeader(70000, 1000), 'image/png'],
    ['WebP (VP8X)', webpHeader(10000, 6000), 'image/webp'],
  ])('refuses a %s over 50 MP from its header, before decoding', async (_n, head, type) => {
    const m = mount()
    m.engine.readHead.mockResolvedValue(head)
    await m.add([new File(['x'], 'big', { type })])
    await waitFor(() => expect(m.state().problem?.code).toBe('too_many_pixels'))
    expect(m.engine.normalise).not.toHaveBeenCalled()
    expect(m.engine.decode).not.toHaveBeenCalled()
  })

  it('accepts exactly 50 MP', async () => {
    const m = mount()
    m.engine.readHead.mockResolvedValue(pngHeader(10000, 5000))
    await m.add([new File(['x'], 'ok.png', { type: 'image/png' })])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
  })

  it('CONDITION 5: a TooManyPixelsError from the decode is too_many_pixels; a look-alike Error is not (instanceof)', async () => {
    const m = mount()
    m.engine.normalise.mockRejectedValueOnce(new TooManyPixelsError())
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.state().problem?.code).toBe('too_many_pixels'))
    act(() => m.result.current.dismissProblem())
    const lookAlike = Object.assign(new Error('too_many_pixels'), { name: 'TooManyPixelsError' })
    m.engine.normalise.mockRejectedValueOnce(lookAlike)
    await m.add([jpg('b.jpg')])
    await waitFor(() => expect(m.state().problem?.code).toBe('unreadable'))
  })

  it('a picture the browser cannot decode (not HEIC) is unreadable', async () => {
    const m = mount()
    m.engine.normalise.mockRejectedValueOnce(new Error('decode'))
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.state().problem?.code).toBe('unreadable'))
    expect(m.state().photos).toEqual([])
    expect(m.state().editing).toBeNull()
  })

  it('a refusal does not stop the files after it', async () => {
    const m = mount()
    await m.add([new File(['x'], 'a.txt', { type: 'text/plain' }), jpg('b.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    expect(m.state().photos[0]!.id).toBe('p1')
  })

  it('the next good photo clears an earlier refusal', async () => {
    const m = mount()
    await m.add([new File(['x'], 'a.txt', { type: 'text/plain' })])
    await waitFor(() => expect(m.state().problem?.code).toBe('unsupported'))
    await m.add([jpg('b.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    expect(m.state().problem).toBeNull()
  })
})

describe('intake: HEIC the browser cannot show is kept as it is (D8)', () => {
  const cannotDecode = (m: Mounted) => m.engine.normalise.mockRejectedValue(new Error('decode'))

  it.each([
    ['image/heic', 'IMG_1.heic', 'image/heic'],
    ['image/heif', 'IMG_2.heif', 'image/heif'],
    ['', 'IMG_3.heic', 'image/heic'],
    ['', 'IMG_4.HEIF', 'image/heif'],
  ])('type %j named %s becomes an as-is photo with the declared type %s: no editor, ready at once', async (type, name, declared) => {
    const m = mount()
    cannotDecode(m)
    await m.add([new File(['heic'], name, { type })])
    await waitFor(() => expect(m.state().photos).toHaveLength(1))
    expect(m.editingId()).toBeUndefined()
    const photo = m.state().photos[0]!
    expect(photo.source).toMatchObject({ kind: 'as-is', type: declared, name })
    expect(photo.output.status).toBe('ready')
    expect(photo.edit).toBeNull()
    expect(m.result.current.canRead).toBe(true)
    expect(m.result.current.previewUrl(photo.id)).toBeUndefined()
    expect(m.state().problem).toBeNull()
  })

  it('over 8 MB it is too_large with limit "as-is"; exactly 8 MB is kept', async () => {
    const m = mount()
    cannotDecode(m)
    await m.add([fileOfSize('big.heic', 'image/heic', AS_IS_MAX_BYTES + 1)])
    await waitFor(() => expect(m.state().problem).toMatchObject({ code: 'too_large', limit: 'as-is' }))
    expect(m.state().photos).toEqual([])
    act(() => m.result.current.dismissProblem())
    await m.add([fileOfSize('ok.heic', 'image/heic', AS_IS_MAX_BYTES)])
    await waitFor(() => expect(m.state().photos).toHaveLength(1))
  })

  it('a HEIC the browser CAN decode (Safari) is an ordinary, editable image photo', async () => {
    const m = mount()
    await m.add([new File(['heic'], 'IMG_1.heic', { type: 'image/heic' })])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    expect(m.state().photos[0]!.source.kind).toBe('image')
  })

  it('an as-is photo cannot be edited again', async () => {
    const m = mount()
    cannotDecode(m)
    await m.add([new File(['heic'], 'a.heic', { type: 'image/heic' })])
    await waitFor(() => expect(m.state().photos).toHaveLength(1))
    act(() => m.result.current.edit('p1'))
    expect(m.state().editing).toBeNull()
  })
})

describe('links and paste', () => {
  it('CONDITION 2: an https link is a ready photo with no editor and no object URL, and none is ever made from its empty placeholder Blob', async () => {
    const m = mount()
    act(() => m.result.current.addLink('https://example.com/a.jpg'))
    expect(m.state().photos[0]).toMatchObject({ id: 'p1', source: { kind: 'link', url: 'https://example.com/a.jpg' }, output: { status: 'ready' } })
    expect(m.state().editing).toBeNull()
    expect(m.result.current.previewUrl('p1')).toBeUndefined()
    expect(m.result.current.editorUrl).toBeUndefined()
    expect(m.result.current.canRead).toBe(true)
    expect(m.urls.api.create).not.toHaveBeenCalled()
    expect(m.urls.created.filter((c) => c.blob.size === 0)).toEqual([])
  })

  it.each([
    ['', 'link_empty'],
    ['   ', 'link_empty'],
    ['http://example.com/a.jpg', 'link_invalid'],
    ['just some words', 'link_invalid'],
    ['https://user:pw@example.com/a.jpg', 'link_invalid'],
  ])('addLink(%j) is refused as %s', (text, code) => {
    const m = mount()
    act(() => m.result.current.addLink(text))
    expect(m.state().problem?.code).toBe(code)
    expect(m.state().photos).toEqual([])
  })

  it('a pasted data:image URL is taken like a file (decoded, edited), not sent to the server as a link', async () => {
    const m = mount()
    act(() => m.result.current.addLink('data:image/png;base64,iVBORw0KGgo='))
    await waitFor(() => expect(m.engine.normalise).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    expect(m.state().photos[0]!.source.kind).toBe('image')
  })

  it('a fifth link is refused with too_many_photos', () => {
    const m = mount()
    for (let i = 0; i < 5; i++) act(() => m.result.current.addLink(`https://example.com/${i}.jpg`))
    expect(m.state().photos).toHaveLength(4)
    expect(m.state().problem?.code).toBe('too_many_photos')
  })

  it('paste of an image file is added like a file with origin "paste"', async () => {
    const m = mount()
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    act(() => m.result.current.onPaste({ files: [file] }))
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    expect(m.engine.normalise).toHaveBeenCalledWith(file, expect.anything())
    expect(m.state().photos[0]!.source).toMatchObject({ kind: 'image', origin: 'paste' })
  })

  it('paste of an https link becomes a link photo; paste of other text is link_invalid', () => {
    const m = mount()
    act(() => m.result.current.onPaste({ getData: () => 'https://example.com/a.jpg' }))
    expect(m.state().photos[0]!.source).toEqual({ kind: 'link', url: 'https://example.com/a.jpg' })
    act(() => m.result.current.onPaste({ getData: () => 'my grandmother soup' }))
    expect(m.state().problem?.code).toBe('link_invalid')
    expect(m.state().photos).toHaveLength(1)
  })
})

describe('edit, render and Read recipe', () => {
  const photoWith = async (m: Mounted, name = 'a.jpg') => {
    await m.add([jpg(name)])
    await waitFor(() => expect(m.editingId()).toBeDefined())
  }

  it('Use photo renders with the committed turns and crop; the output is ready at the cropped size', async () => {
    const m = mount()
    await photoWith(m)
    const edit: ImageEdit = { turns: 1, crop: { x: 100, y: 200, width: 1000, height: 1200 } }
    commitDraft(m, edit)
    expect(m.state().editing).toBeNull()
    expect(m.state().photos[0]).toMatchObject({ edit, revision: 1 })
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    expect(m.engine.encode).toHaveBeenCalledTimes(1)
    expect(m.engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 1, crop: edit.crop, width: 1000, height: 1200, type: 'image/jpeg' })
    expect(m.state().photos[0]!.output).toMatchObject({ status: 'ready', width: 1000, height: 1200, type: 'image/jpeg' })
  })

  it('a photo used with no change keeps edit null and is sent byte for byte when it fits', async () => {
    const m = mount()
    await photoWith(m)
    commitDraft(m)
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    const photo = m.state().photos[0]!
    expect(photo.edit).toBeNull()
    expect(m.engine.encode).not.toHaveBeenCalled()
    expect(photo.output.status === 'ready' && photo.output.blob).toBe(photo.source.kind === 'image' && photo.source.working)
  })

  it('a big working copy is shrunk to a long side of 2576 on render', async () => {
    const m = mount({}, { width: 4000, height: 3000 })
    await photoWith(m)
    commitDraft(m)
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    expect(m.engine.encode.mock.calls[0]![1]).toMatchObject({ width: 2576, height: 1932 })
  })

  it('Read recipe is off while the editor is open or a render is pending, and on when every output is ready', async () => {
    const m = mount()
    await photoWith(m)
    expect(m.result.current.canRead).toBe(false)
    expect(blockReason(m.state())).toBe('editing')
    commitDraft(m, { turns: 2, crop: { x: 0, y: 0, width: 2000, height: 1500 } })
    expect(m.result.current.canRead).toBe(false)
    await waitFor(() => expect(m.result.current.canRead).toBe(true))
  })

  it('renders one photo at a time, and not while an intake runs', async () => {
    const m = mount()
    m.engine.encode.mockImplementation(async (_i, o) => {
      await new Promise((r) => setTimeout(r, 10))
      return new Blob([new Uint8Array(500)], { type: o.type })
    })
    await m.add([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')])
    for (const id of ['p1', 'p2']) {
      await waitFor(() => expect(m.editingId()).toBe(id))
      commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    }
    await waitFor(() => expect(m.editingId()).toBe('p3'))
    commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    await waitFor(() => expect(m.result.current.canRead).toBe(true))
    expect(m.engine.maxParallelRenders()).toBe(1)
    expect(m.engine.encode).toHaveBeenCalledTimes(3)

    const m2 = mount()
    const slow = deferred<Awaited<ReturnType<typeof m2.engine.normalise>>>()
    await m2.add([jpg('a.jpg'), jpg('b.jpg')])
    await waitFor(() => expect(m2.editingId()).toBe('p1'))
    m2.engine.normalise.mockImplementationOnce(() => slow.promise)
    commitDraft(m2, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    await flush()
    expect(m2.engine.decode).not.toHaveBeenCalled() // p1 waits for the intake of b
    await act(async () => slow.resolve(await createFakeEngine().normalise(jpg('b.jpg'))))
    await waitFor(() => expect(m2.engine.decode).toHaveBeenCalled())
  })

  it('a re-edit while a render runs drops the old result (the revision moved on)', async () => {
    const m = mount()
    await photoWith(m)
    const first = deferred<Blob>()
    m.engine.encode.mockImplementationOnce(() => first.promise)
    commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    await waitFor(() => expect(m.engine.encode).toHaveBeenCalledTimes(1))
    act(() => m.result.current.edit('p1'))
    commitDraft(m, { turns: 2, crop: { x: 0, y: 0, width: 2000, height: 1500 } })
    expect(m.state().photos[0]!.revision).toBe(2)
    await act(async () => first.resolve(new Blob(['stale'], { type: 'image/jpeg' })))
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    const out = m.state().photos[0]!.output
    expect(out.status === 'ready' && out.blob.size).toBe(1000) // the second render's, not 'stale'
    expect(m.engine.encode).toHaveBeenCalledTimes(2)
  })

  it('a failed render shows as failed, turns Read off with the reason, and Edit again + Use photo renders again', async () => {
    const m = mount()
    await photoWith(m)
    m.engine.encode.mockRejectedValueOnce(new Error('canvas'))
    commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    await waitFor(() => expect(m.state().photos[0]!.output).toMatchObject({ status: 'failed', problem: 'render_failed' }))
    expect(m.result.current.canRead).toBe(false)
    expect(blockReason(m.state())).toEqual({ failed: 'p1' })
    act(() => m.result.current.edit('p1'))
    expect(m.editingId()).toBe('p1')
    commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1000, height: 1000 } })
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    expect(m.result.current.canRead).toBe(true)
  })

  it('a render still over 8 MB at the lowest quality fails as too_large', async () => {
    const m = mount()
    await photoWith(m)
    m.engine.encode.mockImplementation(async (_i, o) => new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: o.type }))
    commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    await waitFor(() => expect(m.state().photos[0]!.output).toMatchObject({ status: 'failed', problem: 'too_large' }))
  })

  it('a working copy that cannot be decoded for the render is render_failed', async () => {
    const m = mount()
    await photoWith(m)
    m.engine.decode.mockRejectedValueOnce(new Error('gone'))
    commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    await waitFor(() => expect(m.state().photos[0]!.output).toMatchObject({ status: 'failed', problem: 'render_failed' }))
  })
})

describe('list changes', () => {
  async function three() {
    const m = mount()
    await m.add([jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')])
    for (const id of ['p1', 'p2', 'p3']) {
      await waitFor(() => expect(m.editingId()).toBe(id))
      commitDraft(m)
    }
    await waitFor(() => expect(m.result.current.canRead).toBe(true))
    return m
  }

  it('move reorders; the ids stay with their photos', async () => {
    const m = await three()
    act(() => m.result.current.move(0, 2))
    expect(m.state().photos.map((p) => p.id)).toEqual(['p2', 'p3', 'p1'])
  })
  it('move is refused while an editor is open', async () => {
    const m = await three()
    act(() => m.result.current.edit('p2'))
    act(() => m.result.current.move(0, 2))
    expect(m.state().photos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })
  it('remove takes the photo out and closes the editor if it was on it', async () => {
    const m = await three()
    act(() => m.result.current.edit('p2'))
    act(() => m.result.current.remove('p2'))
    expect(m.state().photos.map((p) => p.id)).toEqual(['p1', 'p3'])
    expect(m.state().editing).toBeNull()
  })
  it('remove while files wait in the queue does not clear the queue', async () => {
    const m = mount()
    await m.add([jpg('a.jpg'), jpg('b.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    commitDraft(m)
    await waitFor(() => expect(m.editingId()).toBe('p2'))
    await m.add([jpg('c.jpg')])
    act(() => m.result.current.remove('p1'))
    expect(m.state().queue).toHaveLength(1)
  })
})

describe('toReadInput', () => {
  it('makes data URLs now, in list order: a JPEG, an as-is HEIC with its DECLARED type (the file type is empty), a link', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    commitDraft(m)
    m.engine.normalise.mockRejectedValueOnce(new Error('decode'))
    await m.add([new File(['heic-bytes'], 'IMG_1.heic', { type: '' })])
    await waitFor(() => expect(m.state().photos).toHaveLength(2))
    act(() => m.result.current.addLink('https://example.com/card.jpg'))
    await waitFor(() => expect(m.result.current.canRead).toBe(true))
    const input = await m.result.current.toReadInput()
    expect(input.kind).toBe('photo')
    const [jpeg, heic, link] = input.photos
    expect(jpeg).toMatchObject({ kind: 'blob', type: 'image/jpeg' })
    expect(jpeg!.kind === 'blob' && jpeg!.dataUrl).toMatch(/^data:image\/jpeg;base64,/)
    expect(heic).toMatchObject({ kind: 'blob', type: 'image/heic' })
    expect(heic!.kind === 'blob' && heic!.dataUrl).toMatch(/^data:image\/heic;base64,/)
    expect(link).toEqual({ kind: 'url', url: 'https://example.com/card.jpg' })
  })

  it('follows a reorder', async () => {
    const m = mount()
    act(() => m.result.current.addLink('https://example.com/1.jpg'))
    act(() => m.result.current.addLink('https://example.com/2.jpg'))
    act(() => m.result.current.move(0, 1))
    const input = await m.result.current.toReadInput()
    expect(input.photos).toEqual([
      { kind: 'url', url: 'https://example.com/2.jpg' },
      { kind: 'url', url: 'https://example.com/1.jpg' },
    ])
  })
})

describe('object URLs (4.2)', () => {
  it('the list shows the working copy while the output is pending and the output once ready; the editor always the working copy', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.editingId()).toBe('p1'))
    const working = m.state().photos[0]!.source.kind === 'image' ? (m.state().photos[0]!.source as { working: Blob }).working : undefined
    const editorUrl = m.result.current.editorUrl
    expect(m.urls.created.find((c) => c.url === editorUrl)?.blob).toBe(working)
    expect(m.result.current.previewUrl('p1')).toBe(editorUrl)
    commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    const out = m.state().photos[0]!.output
    const previewUrl = m.result.current.previewUrl('p1')
    expect(previewUrl).not.toBe(editorUrl)
    expect(m.urls.created.find((c) => c.url === previewUrl)?.blob).toBe(out.status === 'ready' ? out.blob : undefined)
  })

  it('a new output revokes the old one; removing a photo revokes its URLs; unmount revokes everything (create and revoke balance)', async () => {
    const m = mount()
    await m.add([jpg('a.jpg'), jpg('b.jpg')])
    for (const id of ['p1', 'p2']) {
      await waitFor(() => expect(m.editingId()).toBe(id))
      m.result.current.previewUrl(id)
      commitDraft(m, { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } })
    }
    await waitFor(() => expect(m.result.current.canRead).toBe(true))
    m.result.current.previewUrl('p1')
    m.result.current.previewUrl('p2')
    const before = m.urls.live.size
    act(() => m.result.current.remove('p1'))
    m.result.current.previewUrl('p2')
    await waitFor(() => expect(m.urls.live.size).toBeLessThan(before))
    // p1 re-edited: its output URL is replaced
    act(() => m.result.current.edit('p2'))
    commitDraft(m, { turns: 2, crop: { x: 0, y: 0, width: 2000, height: 1500 } })
    await waitFor(() => expect(m.result.current.canRead).toBe(true))
    m.result.current.previewUrl('p2')
    m.unmount()
    await waitFor(() => expect(m.urls.live.size).toBe(0))
    expect(m.urls.api.revoke).toHaveBeenCalledTimes(m.urls.api.create.mock.calls.length)
  })

  it('an as-is photo never gets an object URL', async () => {
    const m = mount()
    m.engine.normalise.mockRejectedValueOnce(new Error('decode'))
    await m.add([new File(['h'], 'a.heic', { type: 'image/heic' })])
    await waitFor(() => expect(m.state().photos).toHaveLength(1))
    expect(m.result.current.previewUrl('p1')).toBeUndefined()
    expect(m.urls.api.create).not.toHaveBeenCalled()
  })
})

describe('after unmount', () => {
  it('a late intake answer changes nothing: no state update, no render, no error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const m = mount()
    const late = deferred<Awaited<ReturnType<typeof m.engine.normalise>>>()
    m.engine.normalise.mockImplementationOnce(() => late.promise)
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.engine.normalise).toHaveBeenCalled())
    m.unmount()
    await act(async () => late.resolve(await createFakeEngine().normalise(jpg('a.jpg'))))
    await flush()
    expect(error).not.toHaveBeenCalled()
    expect(m.engine.decode).not.toHaveBeenCalled()
    expect(m.urls.live.size).toBe(0)
  })
})
