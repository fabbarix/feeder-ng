import { describe, expect, it } from 'vitest'
import { classifyRequest, isUsableShell, NAVIGATION_TIMEOUT_MS, SHELL_CACHE, shellUrl, staleCacheUrls, uniquePrecacheUrls } from './cache'

const origin = 'https://feeder.example.test'
const req = (path: string, over: { method?: string; mode?: string } = {}) => ({ url: origin + path, method: 'GET', mode: 'cors', ...over })

describe('classifyRequest', () => {
  it('page loads are navigations', () => {
    expect(classifyRequest(req('/shop', { mode: 'navigate' }), origin)).toBe('navigation')
    expect(classifyRequest(req('/', { mode: 'navigate' }), origin)).toBe('navigation')
  })

  it('API calls are never cached, and the event stream is left alone', () => {
    expect(classifyRequest(req('/api/shopping/list?to=2026-11-15'), origin)).toBe('api')
    expect(classifyRequest(req('/api/scan/offline'), origin)).toBe('api')
    expect(classifyRequest(req('/api/events'), origin)).toBe('events')
    expect(classifyRequest(req('/api/events?topics=shopping'), origin)).toBe('events')
  })

  it('built assets are static', () => {
    for (const path of ['/assets/index-3f2a.js', '/assets/index-3f2a.css', '/assets/figtree-latin-400.woff2', '/favicon.svg', '/manifest.webmanifest']) {
      expect(classifyRequest(req(path), origin)).toBe('static')
    }
  })

  it('anything that is not a GET is the browser\'s business', () => {
    expect(classifyRequest(req('/api/scan', { method: 'POST' }), origin)).toBe('bypass')
    expect(classifyRequest(req('/assets/x.js', { method: 'PUT' }), origin)).toBe('bypass')
  })

  it('other origins are bypassed', () => {
    expect(classifyRequest({ url: 'https://cdn.example.test/lib.js', method: 'GET', mode: 'cors' }, origin)).toBe('bypass')
  })

  it('an API path on another origin is not ours', () => {
    expect(classifyRequest({ url: 'https://elsewhere.test/api/events', method: 'GET', mode: 'cors' }, origin)).toBe('bypass')
  })
})

describe('staleCacheUrls', () => {
  it('lists the cached entries the current manifest no longer has, and keeps the rest', () => {
    const cached = [`${origin}/`, `${origin}/assets/index-old.js`, `${origin}/assets/index-new.js`]
    const manifest = ['index.html', 'assets/index-new.js']
    expect(staleCacheUrls(cached, manifest, `${origin}/`)).toEqual([`${origin}/assets/index-old.js`])
  })

  it('removes nothing when the cache matches the manifest', () => {
    expect(staleCacheUrls([`${origin}/`], ['index.html'], `${origin}/`)).toEqual([])
  })
})

describe('uniquePrecacheUrls', () => {
  const scope = 'https://feeder.test/'
  it('drops duplicate URLs, keeping the first and the order', () => {
    expect(uniquePrecacheUrls(['index.html', 'manifest.webmanifest', 'a.js', 'manifest.webmanifest'], scope)).toEqual([
      'https://feeder.test/',
      'https://feeder.test/manifest.webmanifest',
      'https://feeder.test/a.js',
    ])
  })
  it('treats relative and absolute spellings of one URL as duplicates', () => {
    expect(uniquePrecacheUrls(['a.js', '/a.js', 'https://feeder.test/a.js'], scope)).toEqual(['https://feeder.test/a.js'])
  })
  it('returns an empty list for an empty manifest', () => {
    expect(uniquePrecacheUrls([], scope)).toEqual([])
  })
})

// B9-21 / RES-01
describe('the shell is cached under the scope URL, not index.html', () => {
  const scope = 'https://feeder.test/'
  it('uniquePrecacheUrls maps index.html to the scope root (a redirect-free URL), in any spelling', () => {
    expect(uniquePrecacheUrls(['index.html', 'a.js'], scope)).toEqual(['https://feeder.test/', 'https://feeder.test/a.js'])
    expect(uniquePrecacheUrls(['/index.html', 'index.html', './index.html'], scope)).toEqual(['https://feeder.test/'])
  })
  it('a scope that is not the origin root maps to the scope URL', () => {
    expect(uniquePrecacheUrls(['index.html'], 'https://feeder.test/app/')).toEqual(['https://feeder.test/app/'])
  })
  it('an index.html in a sub-folder of the manifest is an ordinary asset', () => {
    expect(uniquePrecacheUrls(['docs/index.html'], scope)).toEqual(['https://feeder.test/docs/index.html'])
  })
  it('shellUrl is the scope URL', () => {
    expect(shellUrl(scope)).toBe('https://feeder.test/')
    expect(shellUrl('https://feeder.test/app/')).toBe('https://feeder.test/app/')
  })
  it('staleCacheUrls keeps the shell under the scope URL when the manifest lists index.html, and drops a leftover index.html entry', () => {
    const cached = ['https://feeder.test/', 'https://feeder.test/index.html', 'https://feeder.test/a.js']
    expect(staleCacheUrls(cached, ['index.html', 'a.js'], scope)).toEqual(['https://feeder.test/index.html'])
  })
})

describe('isUsableShell', () => {
  it('accepts a plain 200', () => {
    expect(isUsableShell({ ok: true, status: 200, redirected: false })).toBe(true)
  })
  it('rejects a redirected response: a browser refuses it for a navigation (the beta.8 poisoned entry)', () => {
    expect(isUsableShell({ ok: true, status: 200, redirected: true })).toBe(false)
  })
  it('rejects an error status, nothing and null', () => {
    expect(isUsableShell({ ok: false, status: 503, redirected: false })).toBe(false)
    expect(isUsableShell(undefined)).toBe(false)
    expect(isUsableShell(null)).toBe(false)
  })
})

describe('the worker constants', () => {
  it('the cache is feeder-shell-v2 (v1 held the redirected index.html) and a silent network is given 4 s', () => {
    expect(SHELL_CACHE).toBe('feeder-shell-v2')
    expect(NAVIGATION_TIMEOUT_MS).toBe(4000)
  })
})
