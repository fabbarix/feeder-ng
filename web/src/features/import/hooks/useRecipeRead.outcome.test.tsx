// useRecipeRead.outcome: how the last read ended, so the Photo tab clears its photos only after a read that really reached review
// (review of 59f2b4b, PM decision: a server state of 'cancelled' or a Cancel from another tab keeps the photos).
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plan } from '../fixtures.test-helper'
import type { ReadInput, ReadView } from '../types'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useRecipeRead } from './useRecipeRead'

const text: ReadInput = { kind: 'text', text: 'Soup: 1 onion' }
const doneView: ReadView = {
  id: 'rd1',
  state: 'done',
  review: { id: 'imp1', plan: plan(), photos: [{ index: 0, width: 1600, height: 1200 }] },
  source: { kind: 'photo', photoCount: 1 },
  model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' },
}
const view = (state: ReadView['state']): ReadView => ({ id: 'rd1', state })
const setup = () => renderHook(() => useRecipeRead({ onDone: vi.fn() }))
const start = (h: ReturnType<typeof setup>, input: ReadInput = text) => act(async () => void (await h.result.current.start(input)))
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  api.startRead.mockResolvedValue({ id: 'rd1', state: 'reading' })
  api.getRead.mockResolvedValue(view('reading'))
  api.cancelRead.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('useRecipeRead: outcome', () => {
  it('is undefined before any read and while one runs', async () => {
    const h = setup()
    expect(h.result.current.outcome).toBeUndefined()
    await start(h)
    expect(h.result.current.busy).toBe(true)
    expect(h.result.current.outcome).toBeUndefined()
  })
  it('is "done" when the read reached review', async () => {
    api.getRead.mockResolvedValue(doneView)
    const h = setup()
    await start(h)
    await tick(10_000)
    expect(h.result.current.busy).toBe(false)
    expect(h.result.current.outcome).toBe('done')
  })
  it('is "cancelled" when the server says the read was cancelled (another tab)', async () => {
    api.getRead.mockResolvedValue(view('cancelled'))
    const h = setup()
    await start(h)
    await tick(10_000)
    expect(h.result.current).toMatchObject({ busy: false, phase: 'idle', outcome: 'cancelled' })
  })
  it('is "cancelled" after this tab\'s own Cancel', async () => {
    const h = setup()
    await start(h)
    await act(async () => void (await h.result.current.cancel()))
    expect(h.result.current).toMatchObject({ busy: false, outcome: 'cancelled' })
  })
  it('is "failed" when the read failed, and when the input was refused locally', async () => {
    api.getRead.mockResolvedValue({ id: 'rd1', state: 'failed', error: { code: 'assistant_unreachable' } })
    const h = setup()
    await start(h)
    await tick(10_000)
    expect(h.result.current).toMatchObject({ phase: 'failed', outcome: 'failed' })
    const refused = setup()
    await start(refused, { kind: 'text', text: '   ' })
    expect(refused.result.current).toMatchObject({ phase: 'failed', outcome: 'failed' })
  })
  it('a new read clears it', async () => {
    api.getRead.mockResolvedValue(view('cancelled'))
    const h = setup()
    await start(h)
    await tick(10_000)
    expect(h.result.current.outcome).toBe('cancelled')
    api.getRead.mockResolvedValue(view('reading'))
    await start(h)
    expect(h.result.current.outcome).toBeUndefined()
  })
})
