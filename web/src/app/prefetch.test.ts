// B9-59 (RES-04): prefetching route chunks. After first paint, on idle, the bottom-bar destinations; on pointerdown or
// focus of a nav link, that link's route; never on a data-saver connection.
import { describe, expect, it, vi } from 'vitest'
import { createPrefetcher, saveDataOn } from './prefetch'
import { routeChunk, type RouteChunk } from './routeChunks'

function table(paths: string[]) {
  const importers = new Map<string, ReturnType<typeof vi.fn>>()
  const chunks = new Map<string, RouteChunk<unknown>>()
  for (const p of paths) {
    const importer = vi.fn(async () => p)
    importers.set(p, importer)
    chunks.set(p, routeChunk(importer))
  }
  return { importers, resolve: (path: string) => chunks.get(path) }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('saveDataOn', () => {
  it('is true only when the connection asks to save data', () => {
    expect(saveDataOn({ saveData: true })).toBe(true)
    expect(saveDataOn({ saveData: false })).toBe(false)
    expect(saveDataOn({})).toBe(false)
    expect(saveDataOn(undefined)).toBe(false)
    expect(saveDataOn(null)).toBe(false)
  })
})

describe('createPrefetcher', () => {
  it('prefetch(path) loads the chunk of that route, once', async () => {
    const t = table(['/plan'])
    const p = createPrefetcher(t.resolve, { connection: () => ({}), onIdle: (run) => run() })
    p.prefetch('/plan')
    p.prefetch('/plan')
    await flush()
    expect(t.importers.get('/plan')).toHaveBeenCalledTimes(1)
  })

  it('a path with no chunk (Today is in the entry, an unknown path) is ignored', () => {
    const t = table([])
    const p = createPrefetcher(t.resolve, { connection: () => ({}), onIdle: (run) => run() })
    expect(() => p.prefetch('/')).not.toThrow()
    expect(() => p.prefetch('/nowhere')).not.toThrow()
  })

  it('never prefetches on a data-saver connection, on idle or on intent', async () => {
    const t = table(['/plan', '/shop'])
    const onIdle = vi.fn((run: () => void) => run())
    const p = createPrefetcher(t.resolve, { connection: () => ({ saveData: true }), onIdle })
    p.prefetch('/plan')
    p.prefetchOnIdle(['/plan', '/shop'])
    await flush()
    expect(t.importers.get('/plan')).not.toHaveBeenCalled()
    expect(t.importers.get('/shop')).not.toHaveBeenCalled()
  })

  it('reads the data-saver setting at each call, so turning it on stops the next prefetch', async () => {
    const t = table(['/plan', '/shop'])
    let saveData = false
    const p = createPrefetcher(t.resolve, { connection: () => ({ saveData }), onIdle: (run) => run() })
    p.prefetch('/plan')
    saveData = true
    p.prefetch('/shop')
    await flush()
    expect(t.importers.get('/plan')).toHaveBeenCalledTimes(1)
    expect(t.importers.get('/shop')).not.toHaveBeenCalled()
  })

  it('prefetchOnIdle waits for idle, then loads the chunks one after another (one request at a time on a slow line)', async () => {
    const order: string[] = []
    const gates = new Map<string, () => void>()
    const chunks = new Map<string, RouteChunk<unknown>>()
    for (const path of ['/plan', '/pantry', '/scan']) {
      chunks.set(
        path,
        routeChunk(
          () =>
            new Promise<string>((resolve) => {
              order.push(path)
              gates.set(path, () => resolve(path))
            }),
        ),
      )
    }
    let idle: (() => void) | undefined
    const p = createPrefetcher((path) => chunks.get(path), { connection: () => ({}), onIdle: (run) => (idle = run) })
    p.prefetchOnIdle(['/', '/plan', '/pantry', '/scan'])
    await flush()
    expect(order).toEqual([]) // nothing before idle
    idle!()
    await flush()
    expect(order).toEqual(['/plan'])
    gates.get('/plan')!()
    await flush()
    expect(order).toEqual(['/plan', '/pantry'])
    gates.get('/pantry')!()
    await flush()
    expect(order).toEqual(['/plan', '/pantry', '/scan'])
  })

  it('a failed prefetch does not stop the next one and leaves the route to try again on the visit', async () => {
    const failing = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('Plan')
    const plan = routeChunk(failing)
    const shopImporter = vi.fn(async () => 'Shop')
    const shop = routeChunk(shopImporter)
    const p = createPrefetcher((path) => ({ '/plan': plan, '/shop': shop })[path], { connection: () => ({}), onIdle: (run) => run() })
    p.prefetchOnIdle(['/plan', '/shop'])
    await flush()
    await flush()
    expect(shopImporter).toHaveBeenCalledTimes(1)
    expect(plan.status).toBe('idle')
    await expect(plan.load()).resolves.toBe('Plan')
  })

  it('skips a chunk that is already loaded or loading', async () => {
    const t = table(['/plan'])
    await t.resolve('/plan')!.load()
    const p = createPrefetcher(t.resolve, { connection: () => ({}), onIdle: (run) => run() })
    p.prefetchOnIdle(['/plan'])
    p.prefetch('/plan')
    await flush()
    expect(t.importers.get('/plan')).toHaveBeenCalledTimes(1)
  })
})
