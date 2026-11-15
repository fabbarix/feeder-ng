// B9-27 (RX-05): the Source of a Recipe as the detail and the Import Review preview show it. Plain TypeScript.
// Only http: and https: addresses become links. Any other address (javascript:, data:, a typo) is shown as plain text, never a link
// (ruling 4 of the main session), after the attribution when there is one.
import type { RecipeSource } from '../types'

export interface SourceLine {
  /** The attribution, trimmed; null when there is none. */
  attribution: string | null
  /** The host of an http or https address, with the address to open; null for no address or one that is not http(s). */
  link: { host: string; href: string } | null
  /** An address that is not http(s), as plain text (trimmed); null when there is none or it is a link. */
  address: string | null
}

function httpLink(url: string): { host: string; href: string } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return parsed.host ? { host: parsed.host, href: url } : null
}

/** The Source line's parts, or null when the Recipe has neither an attribution nor an address. */
export function sourceLine(source: RecipeSource): SourceLine | null {
  const attribution = source.attribution.trim() || null
  const url = source.url.trim()
  const link = url ? httpLink(url) : null
  const address = url && !link ? url : null
  if (!attribution && !link && !address) return null
  return { attribution, link, address }
}
