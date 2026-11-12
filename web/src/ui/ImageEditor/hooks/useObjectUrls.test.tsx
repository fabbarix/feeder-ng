import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useObjectUrls } from './useObjectUrls'

// A counting fake: create hands out unique urls, revoke records them.
function fakeApi() {
  let n = 0
  const live = new Set<string>()
  const created: string[] = []
  const revoked: string[] = []
  return {
    created,
    revoked,
    live,
    api: {
      create: (_b: Blob) => {
        const url = `blob:fake/${++n}`
        created.push(url)
        live.add(url)
        return url
      },
      revoke: (url: string) => {
        revoked.push(url)
        live.delete(url)
      },
    },
  }
}
const blob = (s = 'a') => new Blob([s])

describe('useObjectUrls', () => {
  it('creates a url once per (key, blob) and returns the same one again', () => {
    const f = fakeApi()
    const { result } = renderHook(() => useObjectUrls(f.api))
    const b = blob()
    const u1 = result.current.urlFor('p1:work', b)
    const u2 = result.current.urlFor('p1:work', b)
    expect(u2).toBe(u1)
    expect(f.created).toHaveLength(1)
    expect(f.revoked).toHaveLength(0)
  })

  it('keeps the same function identities across renders', () => {
    const f = fakeApi()
    const { result, rerender } = renderHook(() => useObjectUrls(f.api))
    const first = result.current
    rerender()
    expect(result.current.urlFor).toBe(first.urlFor)
    expect(result.current.release).toBe(first.release)
    expect(result.current.releaseAll).toBe(first.releaseAll)
  })

  it('a new blob under the same key revokes the previous url and makes a new one', () => {
    const f = fakeApi()
    const { result } = renderHook(() => useObjectUrls(f.api))
    const u1 = result.current.urlFor('p1:out', blob('a'))
    const u2 = result.current.urlFor('p1:out', blob('b'))
    expect(u2).not.toBe(u1)
    expect(f.revoked).toEqual([u1])
    expect([...f.live]).toEqual([u2])
  })

  it('different keys do not affect each other', () => {
    const f = fakeApi()
    const { result } = renderHook(() => useObjectUrls(f.api))
    result.current.urlFor('p1:work', blob())
    result.current.urlFor('p1:out', blob())
    result.current.urlFor('p2:work', blob())
    expect(f.live.size).toBe(3)
    expect(f.revoked).toHaveLength(0)
  })

  it('release revokes just that key, and is a no-op for an unknown key', () => {
    const f = fakeApi()
    const { result } = renderHook(() => useObjectUrls(f.api))
    const a = result.current.urlFor('p1:work', blob())
    const b = result.current.urlFor('p1:out', blob())
    result.current.release('p1:work')
    result.current.release('nope')
    expect(f.revoked).toEqual([a])
    expect([...f.live]).toEqual([b])
    result.current.release('p1:work')
    expect(f.revoked).toEqual([a])
  })

  it('urlFor after release creates a fresh url', () => {
    const f = fakeApi()
    const { result } = renderHook(() => useObjectUrls(f.api))
    const b = blob()
    const u1 = result.current.urlFor('k', b)
    result.current.release('k')
    const u2 = result.current.urlFor('k', b)
    expect(u2).not.toBe(u1)
    expect(f.live.size).toBe(1)
  })

  it('releaseAll revokes every live url', () => {
    const f = fakeApi()
    const { result } = renderHook(() => useObjectUrls(f.api))
    result.current.urlFor('a', blob())
    result.current.urlFor('b', blob())
    result.current.releaseAll()
    expect(f.live.size).toBe(0)
    expect(f.revoked).toHaveLength(2)
  })

  it('unmount revokes everything: create and revoke balance to zero', () => {
    const f = fakeApi()
    const { result, unmount } = renderHook(() => useObjectUrls(f.api))
    for (let i = 0; i < 4; i++) {
      result.current.urlFor(`p${i}:work`, blob())
      result.current.urlFor(`p${i}:out`, blob())
    }
    result.current.urlFor('p0:out', blob('new')) // replaced once
    unmount()
    expect(f.live.size).toBe(0)
    expect(f.revoked).toHaveLength(f.created.length)
  })

  it('uses URL.createObjectURL and revokeObjectURL by default', () => {
    const made: string[] = []
    const gone: string[] = []
    const orig = { c: URL.createObjectURL, r: URL.revokeObjectURL }
    URL.createObjectURL = () => {
      const u = `blob:default/${made.length}`
      made.push(u)
      return u
    }
    URL.revokeObjectURL = (u: string) => void gone.push(u)
    try {
      const { result, unmount } = renderHook(() => useObjectUrls())
      expect(result.current.urlFor('k', blob())).toBe('blob:default/0')
      unmount()
      expect(gone).toEqual(['blob:default/0'])
    } finally {
      URL.createObjectURL = orig.c
      URL.revokeObjectURL = orig.r
    }
  })

  it('survives StrictMode: a url obtained during render is live after mount, cleanup, mount', async () => {
    const f = fakeApi()
    const b = blob()
    const { result, unmount } = renderHook(
      () => {
        const urls = useObjectUrls(f.api)
        return { urls, url: urls.urlFor('p1:work', b) }
      },
      { reactStrictMode: true },
    )
    await Promise.resolve()
    expect(f.live.has(result.current.url)).toBe(true)
    expect(f.created).toHaveLength(1)
    expect(f.revoked).toHaveLength(0)
    // and it still hands out the same live url afterwards
    expect(result.current.urls.urlFor('p1:work', b)).toBe(result.current.url)
    unmount()
    await Promise.resolve()
    expect(f.live.size).toBe(0)
    expect(f.revoked).toHaveLength(f.created.length)
  })
})
