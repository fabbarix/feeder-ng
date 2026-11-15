// B9-27 (RX-05): the Source of a Recipe as the detail and the Import Review preview show it. Plain TypeScript.
import type { RecipeSource } from '../types'

export interface SourceLine {
  /** The attribution, trimmed; null when there is none. */
  attribution: string | null
  /** The host of an http or https address, with the address to open; null for no address or one that is not http(s). */
  link: { host: string; href: string } | null
}

/** STUB (B9-27 test author): the developer implements it. */
export function sourceLine(_source: RecipeSource): SourceLine | null {
  return undefined as unknown as null
}
