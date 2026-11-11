// Base URL rules, mirroring recipeassistant.ValidateBaseURL and OriginOf (design 1.7). Pure TypeScript.

export type BaseUrlCode = 'base_url_invalid' | 'base_url_not_https' | 'base_url_has_version'

const MAX_LENGTH = 2048

/** localhost, *.localhost, 127.0.0.1 and [::1] (what URL.hostname gives for IPv6): the only hosts that may use plain http. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '[::1]'
}

function parseHttp(text: string): URL | null {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.hostname === '') return null
  return url
}

/** The API code the server would answer for this address, or null when it is fine. */
export function validateBaseUrl(text: string): BaseUrlCode | null {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.length > MAX_LENGTH) return 'base_url_invalid'
  const url = parseHttp(trimmed)
  if (!url || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return 'base_url_invalid'
  if (url.protocol === 'http:' && !isLocalHost(url.hostname)) return 'base_url_not_https'
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[segments.length - 1] === 'v1') return 'base_url_has_version'
  return null
}

/** Scheme, host and port (default port dropped, lower case); the path is ignored. Null when not an absolute http(s) URL. */
export function originOf(text: string): string | null {
  const url = parseHttp(text.trim())
  return url ? url.origin : null
}

/** True when both addresses have the same origin, so the saved key still applies. An unparseable address is a change. */
export function sameOrigin(saved: string, next: string): boolean {
  const a = originOf(saved)
  const b = originOf(next)
  return a !== null && b !== null && a === b
}
