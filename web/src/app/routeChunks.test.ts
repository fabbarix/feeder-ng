// B9-59 (RES-04): a route's code, loaded on demand: once, kept, a failure kept until Try again, a prefetch failure forgotten.
import { describe, expect, it, vi } from 'vitest'
import { hasFailedChunk, onChunkFailure, retryFailedChunks, routeChunk } from './routeChunks'

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('routeChunk', () => {
  it('imports nothing until asked, then once, however often it is asked', async () => {
    const importer = vi.fn(async () => 'Screen')
    const chunk = routeChunk(importer)
    expect(chunk.status).toBe('idle')
    expect(importer).not.toHaveBeenCalled()
    const a = chunk.load()
    const b = chunk.load('prefetch')
    expect(a).toBe(b)
    expect(chunk.status).toBe('loading')
    await expect(a).resolves.toBe('Screen')
    expect(chunk.status).toBe('loaded')
    expect(chunk.peek()).toBe('Screen')
    await chunk.load()
    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('marks the settled promise the way React reads a thenable, so a loaded chunk never suspends again', async () => {
    const chunk = routeChunk(async () => 42)
    const p = chunk.load() as Promise<number> & { status?: string; value?: number }
    expect(p.status).toBe('pending')
    await p
    expect(p.status).toBe('fulfilled')
    expect(p.value).toBe(42)
  })

  it('a failed load for the page on screen stays failed (no import on every render) until Try again', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module')).mockResolvedValue('Screen')
    const chunk = routeChunk(importer)
    const first = chunk.load()
    await expect(first).rejects.toThrow(/dynamically imported/)
    expect(chunk.status).toBe('failed')
    expect(hasFailedChunk()).toBe(true)
    expect(chunk.load()).toBe(first) // the same rejected promise: React shows the error state, it does not ask again
    expect(importer).toHaveBeenCalledTimes(1)

    expect(retryFailedChunks()).toBeGreaterThanOrEqual(1)
    expect(chunk.status).toBe('idle')
    await expect(chunk.load()).resolves.toBe('Screen')
    expect(importer).toHaveBeenCalledTimes(2)
    expect(hasFailedChunk()).toBe(false)
  })

  it('a failed prefetch is forgotten at once: the visit itself imports again, and nobody is told', async () => {
    const heard = vi.fn()
    const stop = onChunkFailure(heard)
    const importer = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('Screen')
    const chunk = routeChunk(importer)
    await expect(chunk.load('prefetch')).rejects.toThrow('offline')
    expect(chunk.status).toBe('idle')
    await expect(chunk.load()).resolves.toBe('Screen')
    expect(heard).not.toHaveBeenCalled()
    stop()
  })

  it('a page waiting on a prefetch that fails gets a fresh import on its next render', async () => {
    const d = deferred<string>()
    const importer = vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue('Screen')
    const chunk = routeChunk(importer)
    const prefetching = chunk.load('prefetch')
    expect(chunk.load()).toBe(prefetching) // the page waits on the prefetch that is under way
    d.reject(new Error('offline'))
    await expect(prefetching).rejects.toThrow('offline')
    await expect(chunk.load()).resolves.toBe('Screen')
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('tells the failure listeners about a failed load of a page on screen', async () => {
    const heard = vi.fn()
    const stop = onChunkFailure(heard)
    const error = new TypeError('Failed to fetch dynamically imported module: /assets/PlanScreen-x.js')
    const chunk = routeChunk(() => Promise.reject(error))
    await expect(chunk.load()).rejects.toBe(error)
    expect(heard).toHaveBeenCalledWith(error)
    stop()
    retryFailedChunks()
  })

  it('an importer that throws at once fails like one that rejects', async () => {
    const chunk = routeChunk((): Promise<string> => {
      throw new Error('boom')
    })
    await expect(chunk.load()).rejects.toThrow('boom')
    expect(chunk.status).toBe('failed')
    retryFailedChunks()
  })

  it('retry leaves a chunk that did not fail alone', async () => {
    const chunk = routeChunk(async () => 'Screen')
    await chunk.load()
    expect(chunk.retry()).toBe(false)
    expect(chunk.status).toBe('loaded')
  })
})
