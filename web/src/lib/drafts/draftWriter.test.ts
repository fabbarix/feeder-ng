// B9-18 (SAFE-01 "Writes: 500 ms after the last change, and on pagehide and visibilitychange (hidden)"): lib/drafts/draftWriter.ts,
// plain TypeScript, no React: the debounce and the flushes every editor with a reload draft shares. The React hook of an editor
// (useRecipeDraft in B9-31) wraps it.
//
//   createDraftWriter<T>({ store, area, key, baseUpdatedAt, delayMs?: 500, now?: () => number, target?: Window & Document }): DraftWriter<T>
//   DraftWriter<T> = {
//     change(draft: T): void      schedules a write delayMs after the LAST change (each change restarts the wait)
//     flush(): Promise<void>      writes the latest change now, if there is a pending one
//     discard(): Promise<void>    cancels what is pending and removes the stored draft (Save, Discard changes)
//     dispose(): void             removes the listeners and cancels the timer WITHOUT writing (unmount after a Save)
//   }
//   Listeners (on `target`, default window/document): 'pagehide' on the window and 'visibilitychange' on the document while document.hidden flush.
//   A failing store never throws into the editor: the error is swallowed (the guard still works; a reload loses the changes).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryDraftStore } from './draftStore'
import { createDraftWriter } from './draftWriter'

const T0 = Date.parse('2026-11-14T15:02:00Z')
let store: ReturnType<typeof createMemoryDraftStore>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  store = createMemoryDraftStore({ now: () => Date.now() })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const writer = (over: Record<string, unknown> = {}) => createDraftWriter<{ name: string }>({ store, area: 'recipe', key: '3:42', baseUpdatedAt: '2026-11-14T10:00:00Z', ...over })
const stored = () => store.get<{ name: string }>('recipe', '3:42')

describe('the debounce', () => {
  it('writes 500 ms after the last change, with the base and the time', async () => {
    const w = writer()
    w.change({ name: 'L' })
    await vi.advanceTimersByTimeAsync(499)
    expect(await stored()).toBeNull()
    await vi.advanceTimersByTimeAsync(2)
    // the write ran at T0 + 500 (the debounce), not at the clock's T0 + 501 after the 2 ms step
    expect(await stored()).toEqual({ draft: { name: 'L' }, baseUpdatedAt: '2026-11-14T10:00:00Z', savedAt: T0 + 500 })
    w.dispose()
  })

  it('every change restarts the wait and only the newest value is written', async () => {
    const w = writer()
    const put = vi.spyOn(store, 'put')
    w.change({ name: 'L' })
    await vi.advanceTimersByTimeAsync(400)
    w.change({ name: 'La' })
    await vi.advanceTimersByTimeAsync(400)
    expect(put).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(put).toHaveBeenCalledTimes(1)
    expect((await stored())!.draft.name).toBe('La')
    w.dispose()
  })

  it('delayMs can be set', async () => {
    const w = writer({ delayMs: 100 })
    w.change({ name: 'x' })
    await vi.advanceTimersByTimeAsync(150)
    expect(await stored()).not.toBeNull()
    w.dispose()
  })

  it('a new record is stored with baseUpdatedAt null', async () => {
    const w = writer({ baseUpdatedAt: null })
    w.change({ name: 'x' })
    await vi.advanceTimersByTimeAsync(600)
    expect((await stored())!.baseUpdatedAt).toBeNull()
    w.dispose()
  })
})

describe('flushes', () => {
  it('pagehide writes the pending change at once', async () => {
    const w = writer()
    w.change({ name: 'L' })
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect((await stored())!.draft.name).toBe('L')
    w.dispose()
  })

  it('visibilitychange writes it when the page is hidden, and does nothing when it became visible', async () => {
    const w = writer()
    w.change({ name: 'L' })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await stored()).toBeNull()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect((await stored())!.draft.name).toBe('L')
    w.dispose()
  })

  it('a flush with nothing pending writes nothing (no empty draft)', async () => {
    const w = writer()
    const put = vi.spyOn(store, 'put')
    window.dispatchEvent(new Event('pagehide'))
    await w.flush()
    expect(put).not.toHaveBeenCalled()
    w.dispose()
  })

  it('after the debounce wrote, a pagehide does not write the same value again', async () => {
    const w = writer()
    const put = vi.spyOn(store, 'put')
    w.change({ name: 'L' })
    await vi.advanceTimersByTimeAsync(600)
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect(put).toHaveBeenCalledTimes(1)
    w.dispose()
  })
})

describe('discard and dispose', () => {
  it('discard cancels the pending write and removes the stored draft', async () => {
    const w = writer()
    w.change({ name: 'L' })
    await vi.advanceTimersByTimeAsync(600)
    w.change({ name: 'La' })
    await w.discard()
    await vi.advanceTimersByTimeAsync(1000)
    expect(await stored()).toBeNull()
    w.dispose()
  })

  it('after discard, a pagehide writes nothing', async () => {
    const w = writer()
    w.change({ name: 'L' })
    await w.discard()
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await stored()).toBeNull()
    w.dispose()
  })

  it('dispose cancels the timer and the listeners without writing', async () => {
    const w = writer()
    w.change({ name: 'L' })
    w.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    window.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await stored()).toBeNull()
  })

  it('a store that fails never throws into the editor', async () => {
    vi.spyOn(store, 'put').mockRejectedValue(new Error('QuotaExceededError'))
    const w = writer()
    w.change({ name: 'L' })
    await expect(w.flush()).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(600)
    w.dispose()
  })
})
