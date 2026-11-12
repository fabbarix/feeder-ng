// usePhotoPages and the on-device photo store (docs/dev/design/photo-store.md "Phase 2"): what is written and when, the restore at mount,
// and every way the stored photos are cleared. Real writer and a memory store behind spies; fake engine.
// Pinned where the doc is silent: `restoredCount` is the number of listed photos that came back from the device (it falls as they are removed);
// a failed `load` restores nothing and breaks nothing; with no signed-in User yet nothing is loaded.
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ReactNode } from 'react'
import { createBrowserRouter, Link, MemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageEdit } from '../../../ui'
import { createFakeEngine, createMemorySpyStore, createUrlLog, deferred, meHolder } from '../fakeReadEngine.test-helper'
import type { PhotoRecord } from '../lib/photoStore'
import { usePhotoPages, type UsePhotoPages } from './usePhotoPages'

vi.mock('../../../app/useMe', async () => (await import('../fakeReadEngine.test-helper')).useMeModule())

const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))))
const edit1: ImageEdit = { turns: 1, crop: { x: 0, y: 0, width: 1500, height: 2000 } }

const record = (id: string, order: number, over: Partial<PhotoRecord> = {}): PhotoRecord => ({
  id,
  userId: 7,
  order,
  source: { kind: 'image', working: new Blob(['w' + id], { type: 'image/jpeg' }), width: 2000, height: 1500, origin: 'file' },
  edit: null,
  ...over,
})

function mount(seed: PhotoRecord[] = []) {
  const { spy, inner } = createMemorySpyStore()
  const engine = createFakeEngine()
  const urls = createUrlLog()
  const ready = Promise.all(seed.map((r) => inner.save(r)))
  const view = renderHook(() => usePhotoPages({ engine, objectUrls: urls.api, store: spy }), {
    wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/recipes/import']}>{children}</MemoryRouter>,
  })
  const state = () => view.result.current.state
  const add = (files: File[]) => act(() => view.result.current.addFiles(files, 'file'))
  return { ...view, spy, inner, engine, urls, state, add, ready }
}
const writes = (store: ReturnType<typeof mount>['spy']) => store.save.mock.calls.length + store.update.mock.calls.length + store.remove.mock.calls.length + store.clear.mock.calls.length

beforeEach(() => {
  meHolder.data = { id: 7, email: 'ann@example.com', displayName: 'Ann', isAdmin: false }
})

describe('writes: only through the writer, only when the list changed', () => {
  it('a new photo is saved as a whole record for the signed-in User, in page order', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(1))
    expect(m.spy.save.mock.calls[0]![0]).toMatchObject({ id: 'p1', userId: 7, order: 0, edit: null, source: { kind: 'image', width: 2000, height: 1500, origin: 'file' } })
  })

  it('Use photo with a real edit writes the metadata only (update), never the Blob again', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(1))
    act(() => m.result.current.setDraft(edit1))
    act(() => m.result.current.commit())
    await waitFor(() => expect(m.spy.update).toHaveBeenCalledWith('p1', { order: 0, edit: edit1 }))
    expect(m.spy.save).toHaveBeenCalledTimes(1)
  })

  it('writes nothing for a draft change, a finished render, or a problem change', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(1))
    const encode = deferred<Blob>()
    m.engine.encode.mockImplementationOnce(() => encode.promise)
    act(() => m.result.current.setDraft(edit1))
    act(() => m.result.current.setDraft({ turns: 2, crop: { x: 0, y: 0, width: 2000, height: 1500 } }))
    act(() => m.result.current.setDraft(edit1))
    act(() => m.result.current.commit())
    await waitFor(() => expect(m.spy.update).toHaveBeenCalledTimes(1))
    await flush()
    const settled = writes(m.spy)
    act(() => m.result.current.addLink('nope'))
    act(() => m.result.current.dismissProblem())
    await act(async () => encode.resolve(new Blob(['out'], { type: 'image/jpeg' })))
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    await flush()
    expect(writes(m.spy)).toBe(settled)
  })

  it('Cancel of a NEW photo removes its record; Cancel of an existing photo writes nothing', async () => {
    const m = mount()
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(1))
    act(() => m.result.current.cancel())
    await waitFor(() => expect(m.spy.remove).toHaveBeenCalledWith('p1'))
    await m.add([jpg('b.jpg')])
    await waitFor(() => expect(m.state().editing?.id).toBe('p2'))
    act(() => m.result.current.commit())
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    await flush()
    const settled = writes(m.spy)
    act(() => m.result.current.edit('p2'))
    act(() => m.result.current.cancel())
    await flush()
    expect(writes(m.spy)).toBe(settled)
  })

  it('Remove removes the record; a move rewrites the order of the photos that moved, without Blobs', async () => {
    const m = mount()
    act(() => m.result.current.addLink('https://example.com/1.jpg'))
    act(() => m.result.current.addLink('https://example.com/2.jpg'))
    act(() => m.result.current.addLink('https://example.com/3.jpg'))
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(3))
    act(() => m.result.current.move(0, 2))
    await waitFor(() => expect(m.spy.update).toHaveBeenCalled())
    expect(m.spy.update).toHaveBeenCalledWith('p1', { order: 2, edit: null })
    expect(m.spy.save).toHaveBeenCalledTimes(3)
    act(() => m.result.current.remove('p2'))
    await waitFor(() => expect(m.spy.remove).toHaveBeenCalledWith('p2'))
  })

  it('keeps a link and an as-is HEIC too (their kind and url / bytes), so the list comes back whole', async () => {
    const m = mount()
    act(() => m.result.current.addLink('https://example.com/1.jpg'))
    m.engine.normalise.mockRejectedValueOnce(new Error('decode'))
    await m.add([new File(['h'], 'a.heic', { type: 'image/heic' })])
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(2))
    expect(m.spy.save.mock.calls[0]![0].source).toEqual({ kind: 'link', url: 'https://example.com/1.jpg' })
    expect(m.spy.save.mock.calls[1]![0].source).toMatchObject({ kind: 'as-is', type: 'image/heic', name: 'a.heic' })
  })

  it('a failing store is silent: the photos still work in memory', async () => {
    const m = mount()
    m.spy.save.mockRejectedValue(new Error('quota'))
    m.spy.update.mockRejectedValue(new Error('quota'))
    await m.add([jpg('a.jpg')])
    await waitFor(() => expect(m.state().editing?.id).toBe('p1'))
    act(() => m.result.current.setDraft(edit1))
    act(() => m.result.current.commit())
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    expect(m.result.current.canRead).toBe(true)
  })
})

describe('restore at mount', () => {
  it('loads, restores only this User\'s photos in order, opens no editor, normalises nothing, and writes nothing back', async () => {
    const m = mount([record('p2', 1), record('p1', 0)])
    await m.ready
    await waitFor(() => expect(m.state().photos.map((p) => p.id)).toEqual(['p1', 'p2']))
    expect(m.state().editing).toBeNull()
    expect(m.result.current.restoredCount).toBe(2)
    expect(m.engine.normalise).not.toHaveBeenCalled()
    await flush()
    expect(m.spy.save).not.toHaveBeenCalled()
    expect(m.spy.update).not.toHaveBeenCalled()
    expect(m.spy.remove).not.toHaveBeenCalled()
    expect(m.spy.clear).not.toHaveBeenCalled()
  })

  it('renders the output again (an image comes back pending) with its saved edit; Read recipe is on once done, never sent by itself', async () => {
    const m = mount([record('p1', 0, { edit: edit1 })])
    await m.ready
    await waitFor(() => expect(m.state().photos[0]!.output.status).toBe('ready'))
    expect(m.engine.encode.mock.calls[0]![1]).toMatchObject({ turns: 1, crop: edit1.crop })
    expect(m.result.current.canRead).toBe(true)
  })

  it('continues the ids after the stored ones', async () => {
    const m = mount([record('p1', 0), record('p4', 1)])
    await m.ready
    await waitFor(() => expect(m.state().photos).toHaveLength(2))
    act(() => m.result.current.addLink('https://example.com/new.jpg'))
    expect(m.state().photos.map((p) => p.id)).toEqual(['p1', 'p4', 'p5'])
  })

  it('a different User\'s records are cleared, not restored', async () => {
    const m = mount([record('p1', 0, { userId: 9 })])
    await m.ready
    await waitFor(() => expect(m.spy.clear).toHaveBeenCalled())
    expect(m.state().photos).toEqual([])
    expect(m.result.current.restoredCount).toBe(0)
    expect(await m.inner.load()).toEqual([])
  })

  it('drops a malformed row and keeps the good ones', async () => {
    const m = mount([record('p1', 0)])
    await m.ready
    const good = await m.inner.load()
    m.spy.load.mockResolvedValueOnce([{ junk: true }, null, 'x', ...good])
    m.unmount()
    const again = renderHook(() => usePhotoPages({ engine: m.engine, objectUrls: m.urls.api, store: m.spy }), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/recipes/import']}>{children}</MemoryRouter>,
    })
    await waitFor(() => expect(again.result.current.state.photos.map((p) => p.id)).toEqual(['p1']))
  })

  it('a store that cannot be read restores nothing and breaks nothing', async () => {
    const m = mount()
    m.unmount()
    const { spy } = createMemorySpyStore()
    spy.load.mockRejectedValue(new Error('idb'))
    const again = renderHook(() => usePhotoPages({ engine: m.engine, objectUrls: m.urls.api, store: spy }), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/recipes/import']}>{children}</MemoryRouter>,
    })
    await flush()
    expect(again.result.current.state.photos).toEqual([])
    await act(async () => again.result.current.addFiles([jpg('a.jpg')], 'file'))
    await waitFor(() => expect(again.result.current.state.editing?.id).toBe('p1'))
  })

  it('waits for the signed-in User: nothing is loaded before the User is known', async () => {
    meHolder.data = undefined
    const m = mount([record('p1', 0)])
    await m.ready
    await flush()
    expect(m.spy.load).not.toHaveBeenCalled()
    meHolder.data = { id: 7, email: 'ann@example.com', displayName: 'Ann', isAdmin: false }
    m.rerender()
    await waitFor(() => expect(m.state().photos).toHaveLength(1))
  })

  it('loads once, even when the hook renders many times', async () => {
    const m = mount([record('p1', 0)])
    await m.ready
    await waitFor(() => expect(m.state().photos).toHaveLength(1))
    m.rerender()
    m.rerender()
    expect(m.spy.load).toHaveBeenCalledTimes(1)
  })

  it('photos added while the load runs are listed after the restored ones; the editor stays on its photo', async () => {
    const m = mount([record('p1', 0), record('p2', 1)])
    await m.ready
    const gate = deferred<void>()
    const real = m.inner.load.bind(m.inner)
    m.unmount()
    m.spy.load.mockImplementationOnce(async () => {
      await gate.promise
      return real()
    })
    const again = renderHook(() => usePhotoPages({ engine: m.engine, objectUrls: m.urls.api, store: m.spy }), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/recipes/import']}>{children}</MemoryRouter>,
    })
    await act(async () => again.result.current.addFiles([jpg('live.jpg')], 'camera'))
    await waitFor(() => expect(again.result.current.state.editing).not.toBeNull())
    const liveId = again.result.current.state.editing!.id
    await act(async () => gate.resolve())
    await waitFor(() => expect(again.result.current.state.photos).toHaveLength(3))
    const s = again.result.current.state
    expect(s.photos.map((p) => p.id).slice(0, 2)).toEqual(['p1', 'p2'])
    expect(new Set(s.photos.map((p) => p.id)).size).toBe(3)
    expect(s.photos[2]!.source).toMatchObject({ origin: 'camera' })
    expect(s.editing?.id).toBe(s.photos[2]!.id)
    expect(liveId).toBeTruthy()
    expect(again.result.current.restoredCount).toBe(2)
  })

  it('Remove on one restored photo removes its record and lowers the count', async () => {
    const m = mount([record('p1', 0), record('p2', 1)])
    await m.ready
    await waitFor(() => expect(m.result.current.restoredCount).toBe(2))
    act(() => m.result.current.remove('p1'))
    await waitFor(() => expect(m.spy.remove).toHaveBeenCalledWith('p1'))
    expect(m.result.current.restoredCount).toBe(1)
  })

  it('removeRestored clears every photo and the whole store', async () => {
    const m = mount([record('p1', 0), record('p2', 1)])
    await m.ready
    await waitFor(() => expect(m.result.current.restoredCount).toBe(2))
    act(() => m.result.current.removeRestored())
    expect(m.state().photos).toEqual([])
    expect(m.result.current.restoredCount).toBe(0)
    await waitFor(() => expect(m.spy.clear).toHaveBeenCalled())
    expect(await m.inner.load()).toEqual([])
  })
})

describe('clearing', () => {
  it('finished() (a read that reached review) empties the list and the store', async () => {
    const m = mount()
    act(() => m.result.current.addLink('https://example.com/1.jpg'))
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(1))
    act(() => m.result.current.finished())
    expect(m.state().photos).toEqual([])
    expect(m.result.current.restoredCount).toBe(0)
    await waitFor(() => expect(m.spy.clear).toHaveBeenCalled())
    expect(await m.inner.load()).toEqual([])
  })

  it('nothing but finished(), Remove and leaving clears: a failed read or Try again never calls clear', async () => {
    const m = mount()
    act(() => m.result.current.addLink('https://example.com/1.jpg'))
    await waitFor(() => expect(m.spy.save).toHaveBeenCalledTimes(1))
    await act(async () => void (await m.result.current.toReadInput()))
    await flush()
    expect(m.spy.clear).not.toHaveBeenCalled()
  })
})

describe('leaving the import page (a location change, never a plain unmount)', () => {
  afterEach(() => window.history.pushState({}, '', '/'))
  function Harness({ hook, deps }: { hook: { current: UsePhotoPages | undefined }; deps: Parameters<typeof usePhotoPages>[0] }) {
    hook.current = usePhotoPages(deps)
    return (
      <nav>
        <Link to="/recipes">Back to recipes</Link>
        <Link to="/recipes/export">Export</Link>
        <Link to="/recipes/import#read">Same page</Link>
        <Link to="/recipes/import?x=1">Same page with a query</Link>
      </nav>
    )
  }
  function setup(strict = false) {
    const { spy, inner } = createMemorySpyStore()
    const hook: { current: UsePhotoPages | undefined } = { current: undefined }
    const deps = { engine: createFakeEngine(), objectUrls: createUrlLog().api, store: spy }
    // The app's own router (createBrowserRouter): the hook compares window.location at mount and at cleanup, so the real History API is used.
    window.history.pushState({}, '', '/recipes/import')
    const router = createBrowserRouter([
      { path: '/recipes/import', element: <Harness hook={hook} deps={deps} /> },
      { path: '/recipes', element: <p>the recipes</p> },
      { path: '/recipes/export', element: <p>the export</p> },
    ])
    const tree = <RouterProvider router={router} />
    const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree)
    return { spy, inner, hook, ...view }
  }
  const withPhoto = async (s: ReturnType<typeof setup>) => {
    act(() => s.hook.current!.addLink('https://example.com/1.jpg'))
    await waitFor(() => expect(s.spy.save).toHaveBeenCalledTimes(1))
  }

  it('navigating to another page clears the stored photos', async () => {
    const s = setup()
    await withPhoto(s)
    await userEvent.click(screen.getByRole('link', { name: 'Back to recipes' }))
    expect(await screen.findByText('the recipes')).toBeInTheDocument()
    await waitFor(() => expect(s.spy.clear).toHaveBeenCalled())
    expect(await s.inner.load()).toEqual([])
  })

  it('so does navigating to the export page', async () => {
    const s = setup()
    await withPhoto(s)
    await userEvent.click(screen.getByRole('link', { name: 'Export' }))
    await waitFor(() => expect(s.spy.clear).toHaveBeenCalled())
  })

  it('a hash or query change on the import page itself is not leaving', async () => {
    const s = setup()
    await withPhoto(s)
    await userEvent.click(screen.getByRole('link', { name: 'Same page' }))
    await userEvent.click(screen.getByRole('link', { name: 'Same page with a query' }))
    await flush()
    expect(s.spy.clear).not.toHaveBeenCalled()
    expect(s.hook.current!.state.photos).toHaveLength(1)
  })

  it('the back button (popstate) is leaving too', async () => {
    window.history.pushState({}, '', '/recipes')
    const s = setup()
    await withPhoto(s)
    act(() => window.history.back())
    expect(await screen.findByText('the recipes')).toBeInTheDocument()
    await waitFor(() => expect(s.spy.clear).toHaveBeenCalled())
    expect(await s.inner.load()).toEqual([])
  })

  it('StrictMode\'s mount, unmount, mount does not clear', async () => {
    const s = setup(true)
    await withPhoto(s)
    await flush()
    expect(s.spy.clear).not.toHaveBeenCalled()
    expect(await s.inner.load()).toHaveLength(1)
  })

  it('a plain unmount (a reload, the browser killing the page) never clears', async () => {
    const s = setup()
    await withPhoto(s)
    s.unmount()
    await flush()
    expect(s.spy.clear).not.toHaveBeenCalled()
    expect(await s.inner.load()).toHaveLength(1)
  })
})
