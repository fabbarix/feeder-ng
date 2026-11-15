// B9-59 (RES-04): a route chunk that fails to load. Offline, or the server down: the page's error state, and Try again
// imports again. A new deploy removed the old file (the server now names another entry): the "new version, Reload" path.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeChunk, retryFailedChunks } from './routeChunks'
import { checkStaleBuild, entryScriptOf, resetStaleBuild, staleBuildKnown, tryAgainMove, watchChunkFailures, type StaleCheckEnv } from './staleChunk'

const page = (entry: string) =>
  `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script><link rel="stylesheet" href="/assets/index-c.css"></head><body><div id="root"></div></body></html>`

function env(overrides: Partial<StaleCheckEnv> = {}): StaleCheckEnv {
  return {
    online: () => true,
    currentEntry: () => '/assets/index-OLD.js',
    fetchIndex: async () => page('/assets/index-OLD.js'),
    announce: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  resetStaleBuild()
  retryFailedChunks()
})

describe('entryScriptOf', () => {
  it('reads the module entry script of an index.html, as written', () => {
    expect(entryScriptOf(page('/assets/index-Ab12.js'))).toBe('/assets/index-Ab12.js')
    expect(entryScriptOf('<script src="/x.js"></script>')).toBeNull() // not a module
    expect(entryScriptOf('<html></html>')).toBeNull()
  })
})

describe('checkStaleBuild', () => {
  it('offline: says so and asks the server nothing', async () => {
    const fetchIndex = vi.fn()
    expect(await checkStaleBuild(env({ online: () => false, fetchIndex }))).toBe('offline')
    expect(fetchIndex).not.toHaveBeenCalled()
  })

  it('the server names the entry this page runs: the same build (a passing fault, Try again)', async () => {
    expect(await checkStaleBuild(env())).toBe('same')
  })

  it('the server names another entry: a new version was deployed', async () => {
    expect(await checkStaleBuild(env({ fetchIndex: async () => page('/assets/index-NEW.js') }))).toBe('stale')
  })

  it('the server cannot be reached, or the page cannot tell its own entry: unknown', async () => {
    expect(await checkStaleBuild(env({ fetchIndex: () => Promise.reject(new TypeError('Failed to fetch')) }))).toBe('unknown')
    expect(await checkStaleBuild(env({ currentEntry: () => null }))).toBe('unknown')
    expect(await checkStaleBuild(env({ fetchIndex: async () => '<html>no script</html>' }))).toBe('unknown')
  })

  it('compares the paths, whatever origin the page wrote its own entry with', async () => {
    const e = env({ currentEntry: () => 'http://127.0.0.1:8080/assets/index-OLD.js' })
    expect(await checkStaleBuild(e)).toBe('same')
  })
})

describe('watchChunkFailures: the stale-chunk path', () => {
  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  }

  it('a chunk 404 after a deploy announces the new version (the Reload toast), once', async () => {
    const e = env({ fetchIndex: async () => page('/assets/index-NEW.js') })
    const stop = watchChunkFailures(e)
    await expect(routeChunk(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))).load()).rejects.toThrow()
    await expect(routeChunk(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))).load()).rejects.toThrow()
    await settle()
    expect(e.announce).toHaveBeenCalledTimes(1)
    expect(staleBuildKnown()).toBe(true)
    expect(tryAgainMove()).toBe('reload') // the old file is gone: importing it again cannot work, the new version can
    stop()
  })

  it('offline: no announcement, and Try again imports again', async () => {
    const e = env({ online: () => false })
    const stop = watchChunkFailures(e)
    await expect(routeChunk(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))).load()).rejects.toThrow()
    await settle()
    expect(e.announce).not.toHaveBeenCalled()
    expect(staleBuildKnown()).toBe(false)
    expect(tryAgainMove()).toBe('retry')
    stop()
  })

  it('the same build still served: no announcement, Try again imports again', async () => {
    const e = env()
    const stop = watchChunkFailures(e)
    await expect(routeChunk(() => Promise.reject(new Error('x'))).load()).rejects.toThrow()
    await settle()
    expect(e.announce).not.toHaveBeenCalled()
    expect(tryAgainMove()).toBe('retry')
    stop()
  })

  it('a failed prefetch asks nothing of the server', async () => {
    const fetchIndex = vi.fn(async () => page('/assets/index-NEW.js'))
    const stop = watchChunkFailures(env({ fetchIndex }))
    await expect(routeChunk(() => Promise.reject(new Error('x'))).load('prefetch')).rejects.toThrow()
    await settle()
    expect(fetchIndex).not.toHaveBeenCalled()
    stop()
  })
})
