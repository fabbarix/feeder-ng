// Hotfix 4.2, bug 2: after a photo read that reached review, the photos are gone from the Photo tab AND from the device store, so the
// next read starts from scratch. Real useRecipeRead, useImportReview and usePhotoPages (fake engine, memory store); only the server is
// faked. In the real flow the step unmounts in the same commit that adopts the review, so the clearing cannot wait for an effect of the step.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { createFakeEngine, createMemorySpyStore, createUrlLog, meHolder } from '../fakeReadEngine.test-helper'
import { plan } from '../fixtures.test-helper'
import type { PhotoRecord } from '../lib/photoStore'
import type { ReadView } from '../types'

const rig = vi.hoisted(() => ({ deps: undefined as unknown, getRead: undefined as unknown, startRead: undefined as unknown }))

vi.mock('../../../app/useMe', async () => (await import('../fakeReadEngine.test-helper')).useMeModule())
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../hooks/useImportCourses', () => ({ useImportCourses: () => ({ courses: [], isAdmin: false, isPending: false }) }))
vi.mock('../hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }),
}))
vi.mock('../lib/readProgress', async (orig) => ({ ...(await orig<typeof import('../lib/readProgress')>()), pollDelay: () => 0 }))
vi.mock('../api', () => ({
  importApi: {
    startRead: (...a: unknown[]) => (rig.startRead as (...x: unknown[]) => unknown)(...a),
    getRead: (...a: unknown[]) => (rig.getRead as (...x: unknown[]) => unknown)(...a),
    cancelRead: vi.fn(async () => undefined),
    discard: vi.fn(async () => undefined),
  },
}))
// The real hook, with the fake engine and the memory store injected (ReadRecipeStep calls usePhotoPages() with no arguments).
vi.mock('../hooks/usePhotoPages', async (orig) => {
  const real = await orig<typeof import('../hooks/usePhotoPages')>()
  return { ...real, usePhotoPages: () => real.usePhotoPages(rig.deps as never) }
})

import { ImportScreen } from './ImportScreen'

const record = (id: string, order: number): PhotoRecord => ({
  id,
  userId: 7,
  order,
  source: { kind: 'image', working: new Blob(['w' + id], { type: 'image/jpeg' }), width: 2000, height: 1500, origin: 'file' },
  edit: null,
})
const done: ReadView = { id: 'r1', state: 'done', review: { id: 'imp1', plan: plan() }, model: { id: 'm', name: 'Claude' } }
const failed: ReadView = { id: 'r1', state: 'failed', error: { code: 'assistant_unreachable' } }

let memory: ReturnType<typeof createMemorySpyStore>
const mountScreen = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/recipes/import']}>
        <ToastProvider>
          <ImportScreen />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
const stored = async () => (await memory.inner.load()).length
const readButton = () => screen.getByRole('button', { name: 'Read recipe' })

beforeEach(async () => {
  meHolder.data = { id: 7, email: 'ann@example.com', displayName: 'Ann', isAdmin: false }
  memory = createMemorySpyStore()
  await Promise.all([record('p1', 0), record('p2', 1)].map((r) => memory.inner.save(r)))
  rig.deps = { engine: createFakeEngine(), objectUrls: createUrlLog().api, store: memory.spy }
  rig.startRead = vi.fn(async () => ({ id: 'r1', state: 'queued' }))
  rig.getRead = vi.fn(async () => done)
})
afterEach(() => vi.restoreAllMocks())

/** Waits for the two photos that came back from the device to be ready to read. */
async function readyToRead() {
  await screen.findByRole('radio', { name: 'Photo', checked: true })
  await waitFor(() => expect(readButton()).toBeEnabled())
}

describe('a photo read that reaches review', () => {
  it('empties the device store, even though the Read step unmounts in the same commit as the review opens', async () => {
    mountScreen()
    await readyToRead()
    expect(await stored()).toBe(2)
    await userEvent.click(readButton())
    await screen.findByRole('button', { name: 'Confirm import' }) // the review is open: the step is gone
    expect(screen.queryByRole('radio', { name: 'Photo' })).not.toBeInTheDocument()
    await waitFor(async () => expect(await stored()).toBe(0))
  })

  it('a reload or a return to the page restores nothing: no photos, the Photo tab is not reopened', async () => {
    const first = mountScreen()
    await readyToRead()
    await userEvent.click(readButton())
    await screen.findByRole('button', { name: 'Confirm import' })
    await waitFor(async () => expect(await stored()).toBe(0))
    first.unmount()
    mountScreen()
    await screen.findByRole('textbox', { name: 'Page address' })
    await waitFor(() => expect(memory.spy.load).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('radio', { name: 'Web page', checked: true })).toBeInTheDocument()
    expect(screen.queryByText(/from before/)).not.toBeInTheDocument()
    expect(await stored()).toBe(0)
  })
})

describe('a photo read that fails', () => {
  it('keeps the photos on the screen and on the device; Try again sends them again, and success then clears both', async () => {
    rig.getRead = vi.fn().mockResolvedValueOnce(failed).mockResolvedValue(done)
    mountScreen()
    await readyToRead()
    await userEvent.click(readButton())
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await stored()).toBe(2) // still there while the second read runs
    expect(rig.startRead).toHaveBeenCalledTimes(2)
    await screen.findByRole('button', { name: 'Confirm import' })
    await waitFor(async () => expect(await stored()).toBe(0))
  })

  it('after the failure the photos are still listed and Read recipe is still on', async () => {
    rig.getRead = vi.fn(async () => failed)
    mountScreen()
    await readyToRead()
    await userEvent.click(readButton())
    await screen.findByRole('button', { name: 'Try again' })
    expect(await stored()).toBe(2)
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeInTheDocument()
  })
})
