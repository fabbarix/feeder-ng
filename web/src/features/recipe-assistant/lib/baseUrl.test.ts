// Base URL rules, mirroring recipeassistant.ValidateBaseURL and OriginOf (design 1.7). Pure TypeScript.
import { describe, expect, it } from 'vitest'
import { isLocalHost, originOf, sameOrigin, validateBaseUrl } from './baseUrl'

describe('validateBaseUrl', () => {
  it.each(['https://api.anthropic.com', 'https://gateway.example.com/anthropic', 'https://h:8443/x', 'http://localhost:8080', 'http://127.0.0.1:9000', 'http://[::1]:9000', 'http://fake.localhost:3000', 'https://api.anthropic.com/'])(
    'accepts %s',
    (url) => expect(validateBaseUrl(url)).toBeNull(),
  )

  it.each(['', '   ', 'api.anthropic.com', 'not a url', 'ftp://example.com', 'https://', 'https://user:pw@example.com', 'https://example.com?x=1', 'https://example.com#frag', 'https://' + 'a'.repeat(2050) + '.com'])(
    'calls %j invalid',
    (url) => expect(validateBaseUrl(url)).toBe('base_url_invalid'),
  )

  it.each(['http://example.com', 'http://192.168.1.5', 'http://localhost.evil.com', 'http://api.anthropic.com'])('asks for https on %s', (url) =>
    expect(validateBaseUrl(url)).toBe('base_url_not_https'),
  )

  it.each(['https://gateway.example.com/v1', 'https://gateway.example.com/v1/', 'https://gateway.example.com/anthropic/v1'])('refuses a /v1 ending on %s', (url) =>
    expect(validateBaseUrl(url)).toBe('base_url_has_version'),
  )

  it('lets a path that merely contains v1 through', () => {
    expect(validateBaseUrl('https://gateway.example.com/v1/anthropic')).toBeNull()
    expect(validateBaseUrl('https://gateway.example.com/rev1')).toBeNull()
  })

  it('ignores surrounding whitespace', () => expect(validateBaseUrl('  https://api.anthropic.com  ')).toBeNull())
})

describe('isLocalHost', () => {
  it('is true for localhost, *.localhost, 127.0.0.1 and [::1] only', () => {
    for (const h of ['localhost', 'a.localhost', '127.0.0.1', '[::1]']) expect(isLocalHost(h), h).toBe(true)
    for (const h of ['localhost.evil.com', '127.0.0.2', 'example.com', '']) expect(isLocalHost(h), h).toBe(false)
  })
})

describe('originOf (scheme, host, port; default port dropped; same as recipeassistant.OriginOf)', () => {
  it('drops the path, query-less trailing slash and default ports; lower-cases scheme and host', () => {
    expect(originOf('https://API.Example.com:443/gateway/')).toBe('https://api.example.com')
    expect(originOf('https://api.example.com/gateway')).toBe('https://api.example.com')
    expect(originOf('http://localhost:80/x')).toBe('http://localhost')
    expect(originOf('http://localhost:8080/x')).toBe('http://localhost:8080')
    expect(originOf('https://h:8443')).toBe('https://h:8443')
    expect(originOf('http://[::1]:9000/')).toBe('http://[::1]:9000')
  })
  it('is null for text that is not an absolute http(s) URL', () => {
    for (const t of ['', 'nope', 'ftp://x', 'https://']) expect(originOf(t), t).toBeNull()
  })
})

describe('sameOrigin (the UI mirror of KeyFor)', () => {
  const saved = 'https://api.example.com/gateway'
  it('keeps the key for the same origin: path-only change, trailing slash, host case, written-out default port', () => {
    for (const next of [saved, 'https://api.example.com/other/prefix', 'https://api.example.com', 'https://api.example.com/gateway/', 'https://API.Example.com/gateway', 'https://api.example.com:443/gateway'])
      expect(sameOrigin(saved, next), next).toBe(true)
  })
  it('does not for another scheme, host or port', () => {
    for (const next of ['http://api.example.com/gateway', 'https://api2.example.com/gateway', 'https://api.example.com:8443/gateway', 'https://evil.test'])
      expect(sameOrigin(saved, next), next).toBe(false)
  })
  it('treats an unparseable new address as a change (the key is never assumed to carry over)', () => {
    expect(sameOrigin(saved, 'garbage')).toBe(false)
    expect(sameOrigin(saved, '')).toBe(false)
  })
})
