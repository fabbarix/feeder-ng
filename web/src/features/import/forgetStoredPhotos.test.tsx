// Sign-out while a write is in flight (review of 59f2b4b, PM decision): forgetStoredPhotos stops every write of a mounted photo read, so nothing
// lands after the clear. The app store is replaced by a memory store whose save waits on a gate.
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngine, createUrlLog, deferred, meHolder } from './fakeReadEngine.test-helper'
import { forgetStoredPhotos } from './index'
import { createMemoryPhotoStore, type PhotoStore } from './lib/photoStore'
import { usePhotoPages } from './hooks/usePhotoPages'

vi.mock('../../app/useMe', async () => (await import('./fakeReadEngine.test-helper')).useMeModule())
const device = vi.hoisted(() => ({ store: undefined as undefined | PhotoStore }))
vi.mock('./lib/photoStoreIdb', async (orig) => ({ ...(await orig<object>()), appPhotoStore: () => device.store }))

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/recipes/import']}>{children}</MemoryRouter>

beforeEach(() => {
  meHolder.data = { id: 7, email: 'ann@example.com', displayName: 'Ann', isAdmin: false }
})

describe('forgetStoredPhotos with a write in flight', () => {
  it('a save that is still running when the User signs out does not land after the clear', async () => {
    const inner = createMemoryPhotoStore()
    const gate = deferred<void>()
    const started = deferred<void>()
    device.store = {
      ...inner,
      save: async (record) => {
        started.resolve()
        await gate.promise
        await inner.save(record)
      },
    }
    // The hook uses the app store (no `store` dep): the mocked appPhotoStore.
    const hook = renderHook(() => usePhotoPages({ engine: createFakeEngine(), objectUrls: createUrlLog().api }), { wrapper })
    await waitFor(() => expect(hook.result.current.state).toBeDefined())
    act(() => hook.result.current.addLink('https://example.com/1.jpg'))
    await started.promise // the save is running

    const forgotten = forgetStoredPhotos()
    gate.resolve()
    await forgotten
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))))
    expect(await inner.load()).toEqual([])
  })

  it('a persist queued behind the running save is dropped as well', async () => {
    const inner = createMemoryPhotoStore()
    const gate = deferred<void>()
    const started = deferred<void>()
    device.store = {
      ...inner,
      save: async (record) => {
        started.resolve()
        await gate.promise
        await inner.save(record)
      },
    }
    const hook = renderHook(() => usePhotoPages({ engine: createFakeEngine(), objectUrls: createUrlLog().api }), { wrapper })
    act(() => hook.result.current.addLink('https://example.com/1.jpg'))
    await started.promise
    act(() => hook.result.current.addLink('https://example.com/2.jpg')) // queued behind the first save
    const forgotten = forgetStoredPhotos()
    gate.resolve()
    await forgotten
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))))
    expect(await inner.load()).toEqual([])
  })

  it('with no photo read mounted it simply clears the store', async () => {
    const inner = createMemoryPhotoStore()
    await inner.save({ id: 'p1', userId: 7, order: 0, source: { kind: 'link', url: 'https://example.com/a.jpg' }, edit: null })
    device.store = inner
    await forgetStoredPhotos()
    expect(await inner.load()).toEqual([])
  })
})
