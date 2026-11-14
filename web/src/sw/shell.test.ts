// B9-21: the worker's behaviour against an in-memory Cache API and a scripted fetch. No worker is registered.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryCaches, flush, redirected } from '../test/swFakes'
import { NAVIGATION_TIMEOUT_MS, SHELL_CACHE } from './cache'
import { activateWorker, answerNavigation, handleWorkerMessage, precacheShell, type ShellEnv } from './shell'

const scope = 'https://feeder.test/'
const manifest = ['index.html', 'assets/index-new.js', 'manifest.webmanifest']

function setup(fetchImpl: ShellEnv['fetch']) {
  const caches = new MemoryCaches()
  const env: ShellEnv = { caches, fetch: fetchImpl, scope }
  return { caches, env }
}
const page = (body = '<html>new shell</html>') => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
const nav = () => new Request('https://feeder.test/shop')

describe('precacheShell (RES-01)', () => {
  it('fetches the shell from the scope root, never from index.html, bypassing the HTTP cache', async () => {
    const seen: Array<{ url: string; cache: string }> = []
    const { env } = setup(async (r) => {
      const req = r as Request
      seen.push({ url: req.url, cache: req.cache })
      return page('<x>')
    })
    await precacheShell(env, manifest)
    expect(seen.map((s) => s.url)).toContain('https://feeder.test/')
    expect(seen.map((s) => s.url)).not.toContain('https://feeder.test/index.html')
    expect(seen.every((s) => s.cache === 'reload')).toBe(true)
    expect(new Set(seen.map((s) => s.url)).size).toBe(seen.length) // one fetch per URL
  })

  it('stores everything in feeder-shell-v2, the shell under the scope URL', async () => {
    const { env, caches } = setup(async () => page())
    await precacheShell(env, manifest)
    expect(await caches.keys()).toEqual([SHELL_CACHE])
    const cache = await caches.open(SHELL_CACHE)
    expect([...cache.entries.keys()].sort()).toEqual(
      ['https://feeder.test/', 'https://feeder.test/assets/index-new.js', 'https://feeder.test/manifest.webmanifest'].sort(),
    )
  })

  it('stores a redirected response as a plain 200 with the same body and headers (defence in depth)', async () => {
    const { env, caches } = setup(async () => redirected('<html>shell</html>', { headers: { 'Content-Type': 'text/html' } }))
    await precacheShell(env, ['index.html'])
    const stored = (await (await caches.open(SHELL_CACHE)).match('https://feeder.test/'))!
    expect(stored.redirected).toBe(false)
    expect(stored.status).toBe(200)
    expect(stored.headers.get('Content-Type')).toBe('text/html')
    expect(await stored.text()).toBe('<html>shell</html>')
  })

  it('rejects, so the install fails and the old worker stays, when any file is not ok', async () => {
    const { env } = setup(async (r) => (String((r as Request).url).endsWith('.js') ? new Response('no', { status: 404 }) : page()))
    await expect(precacheShell(env, manifest)).rejects.toBeDefined()
  })

  it('rejects when the network is down', async () => {
    const { env } = setup(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(precacheShell(env, manifest)).rejects.toBeDefined()
  })
})

describe('answerNavigation (RES-01)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function withShell(fetchImpl: ShellEnv['fetch']) {
    const s = setup(fetchImpl)
    await (await s.caches.open(SHELL_CACHE)).put('https://feeder.test/', new Response('<html>cached shell</html>', { status: 200 }))
    return s
  }

  it('answers with the network when it answers', async () => {
    const { env } = await withShell(async () => page('<html>fresh</html>'))
    const res = await answerNavigation(env, nav())
    expect(await res.text()).toBe('<html>fresh</html>')
  })

  it('answers from the cached shell when fetch throws (offline)', async () => {
    const { env } = await withShell(async () => {
      throw new TypeError('Failed to fetch')
    })
    const res = await answerNavigation(env, nav())
    expect(await res.text()).toBe('<html>cached shell</html>')
  })

  it('answers from the cached shell when the gateway is down (502, 503, 504), because that is no page at all', async () => {
    for (const status of [502, 503, 504]) {
      const { env } = await withShell(async () => new Response('bad gateway', { status }))
      const res = await answerNavigation(env, nav())
      expect(await res.text(), `status ${status}`).toBe('<html>cached shell</html>')
    }
  })

  it('does not hide an application error: a 404 or 500 from Feeder itself is passed on', async () => {
    const { env } = await withShell(async () => new Response('oops', { status: 500 }))
    const res = await answerNavigation(env, nav())
    expect(res.status).toBe(500)
  })

  it('lie-fi: after 4 s with no response it answers from the cached shell', async () => {
    const { env } = await withShell(() => new Promise<Response>(() => {})) // never answers
    const done = vi.fn()
    const pending = answerNavigation(env, nav()).then(done)
    await vi.advanceTimersByTimeAsync(NAVIGATION_TIMEOUT_MS - 1)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    await pending
    expect(done).toHaveBeenCalledTimes(1)
    expect(await (done.mock.calls[0]![0] as Response).text()).toBe('<html>cached shell</html>')
  })

  it('a network answer at 3 s beats the timeout', async () => {
    const { env } = await withShell(() => new Promise<Response>((resolve) => setTimeout(() => resolve(page('<html>late but ok</html>')), 3000)))
    const pending = answerNavigation(env, nav())
    await vi.advanceTimersByTimeAsync(3100)
    expect(await (await pending).text()).toBe('<html>late but ok</html>')
  })

  it('with no cached shell yet it keeps waiting for the network instead of giving up at 4 s', async () => {
    const { env } = setup(() => new Promise<Response>((resolve) => setTimeout(() => resolve(page('<html>slow</html>')), 9000)))
    const pending = answerNavigation(env, nav())
    await vi.advanceTimersByTimeAsync(9100)
    expect(await (await pending).text()).toBe('<html>slow</html>')
  })

  it('with no cached shell and no network the page load fails as it would without a worker (a network error response)', async () => {
    const { env } = setup(async () => {
      throw new TypeError('Failed to fetch')
    })
    const res = await answerNavigation(env, nav())
    expect(res.type).toBe('error')
  })

  it('never answers with a redirected cached shell (the beta.8 poisoned entry): that counts as no shell', async () => {
    const s = setup(async () => {
      throw new TypeError('Failed to fetch')
    })
    await (await s.caches.open(SHELL_CACHE)).put('https://feeder.test/', redirected('<html>poisoned</html>'))
    const res = await answerNavigation(s.env, nav())
    expect(res.type).toBe('error')
  })

  it('the timeout can be given (the fourth argument is the only knob)', async () => {
    const { env } = await withShell(() => new Promise<Response>(() => {}))
    const pending = answerNavigation(env, nav(), 500)
    await vi.advanceTimersByTimeAsync(600)
    expect(await (await pending).text()).toBe('<html>cached shell</html>')
  })
})

describe('activateWorker', () => {
  it('drops every other cache (the beta.8 feeder-shell-v1 with the poisoned shell), then claims the open pages', async () => {
    const { env, caches } = setup(async () => page())
    await (await caches.open('feeder-shell-v1')).put('https://feeder.test/index.html', redirected('<html>poisoned</html>'))
    await (await caches.open('something-else')).put('https://feeder.test/x', page())
    await (await caches.open(SHELL_CACHE)).put('https://feeder.test/', page())
    const order: string[] = []
    const claim = vi.fn(async () => {
      order.push(`claim after caches ${(await caches.keys()).join(',')}`)
    })
    await activateWorker(env, manifest, claim)
    expect(await caches.keys()).toEqual([SHELL_CACHE])
    expect(claim).toHaveBeenCalledTimes(1)
    expect(order).toEqual([`claim after caches ${SHELL_CACHE}`])
  })

  it('removes entries of an earlier build that the manifest no longer lists, and keeps the shell and the current assets', async () => {
    const { env, caches } = setup(async () => page())
    const cache = await caches.open(SHELL_CACHE)
    for (const u of ['', 'assets/index-old.js', 'assets/index-new.js', 'manifest.webmanifest']) await cache.put(`https://feeder.test/${u}`, page())
    await activateWorker(env, manifest, async () => {})
    expect([...cache.entries.keys()].sort()).toEqual(
      ['https://feeder.test/', 'https://feeder.test/assets/index-new.js', 'https://feeder.test/manifest.webmanifest'].sort(),
    )
  })
})

describe('handleWorkerMessage (RES-10: the worker waits, and skips waiting only when the page says so)', () => {
  it('{type: "SKIP_WAITING"} calls skipWaiting once', () => {
    const skip = vi.fn()
    handleWorkerMessage({ type: 'SKIP_WAITING' }, skip)
    expect(skip).toHaveBeenCalledTimes(1)
  })
  it('anything else is ignored', async () => {
    const skip = vi.fn()
    for (const data of [null, undefined, 'SKIP_WAITING', 42, {}, { type: 'skip_waiting' }, { type: 'OTHER' }, [{ type: 'SKIP_WAITING' }]]) {
      handleWorkerMessage(data, skip)
    }
    await flush()
    expect(skip).not.toHaveBeenCalled()
  })
})
