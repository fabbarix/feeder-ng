import { describe, expect, it } from 'vitest'
import { classifyRequest, staleCacheUrls } from './cache'

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
    const cached = [`${origin}/index.html`, `${origin}/assets/index-old.js`, `${origin}/assets/index-new.js`]
    const manifest = ['index.html', 'assets/index-new.js']
    expect(staleCacheUrls(cached, manifest, `${origin}/`)).toEqual([`${origin}/assets/index-old.js`])
  })

  it('removes nothing when the cache matches the manifest', () => {
    expect(staleCacheUrls([`${origin}/index.html`], ['index.html'], `${origin}/`)).toEqual([])
  })
})
