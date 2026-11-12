// Hotfix 4.2: finished() is a clean slate: no photos, no editor open, no queued files, nothing left on the device, and a remount restores nothing.
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngine, createMemorySpyStore, createUrlLog, meHolder } from '../fakeReadEngine.test-helper'
import type { PhotoRecord } from '../lib/photoStore'
import { usePhotoPages } from './usePhotoPages'

vi.mock('../../../app/useMe', async () => (await import('../fakeReadEngine.test-helper')).useMeModule())

const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/recipes/import']}>{children}</MemoryRouter>

beforeEach(() => {
  meHolder.data = { id: 7, email: 'ann@example.com', displayName: 'Ann', isAdmin: false }
})

const record = (id: string, order: number): PhotoRecord => ({
  id,
  userId: 7,
  order,
  source: { kind: 'image', working: new Blob(['w' + id], { type: 'image/jpeg' }), width: 2000, height: 1500, origin: 'file' },
  edit: null,
})

async function mount() {
  const { spy, inner } = createMemorySpyStore()
  await Promise.all([record('p1', 0), record('p2', 1)].map((r) => inner.save(r)))
  const deps = { engine: createFakeEngine(), objectUrls: createUrlLog().api, store: spy }
  const view = renderHook(() => usePhotoPages(deps), { wrapper })
  await waitFor(() => expect(view.result.current.state.photos).toHaveLength(2))
  return { spy, inner, deps, view }
}

describe('finished()', () => {
  it('empties the list, closes the editor and empties the store; a new mount restores nothing', async () => {
    const { spy, inner, deps, view } = await mount()
    act(() => view.result.current.edit('p1'))
    expect(view.result.current.state.editing).not.toBeNull()

    act(() => view.result.current.finished())

    await waitFor(() => expect(view.result.current.state.photos).toHaveLength(0))
    expect(view.result.current.state.editing).toBeNull()
    expect(view.result.current.canRead).toBe(false)
    await waitFor(async () => expect(await inner.load()).toHaveLength(0))
    view.unmount()

    const again = renderHook(() => usePhotoPages(deps), { wrapper })
    await waitFor(() => expect(spy.load).toHaveBeenCalledTimes(2))
    expect(again.result.current.state.photos).toHaveLength(0)
    expect(again.result.current.restoredCount).toBe(0)
  })

  it('files still queued when the read ends are dropped too (they belong to the finished read)', async () => {
    const { view } = await mount()
    act(() => view.result.current.addFiles([jpg('a.jpg'), jpg('b.jpg')], 'file'))
    await waitFor(() => expect(view.result.current.state.editing).not.toBeNull()) // a.jpg is in the editor, b.jpg waits
    expect(view.result.current.state.queue).toHaveLength(1)
    act(() => view.result.current.finished())
    await new Promise((r) => setTimeout(r, 50))
    expect(view.result.current.state.queue).toHaveLength(0)
    expect(view.result.current.state.editing).toBeNull()
    expect(view.result.current.state.photos).toHaveLength(0)
  })
})
